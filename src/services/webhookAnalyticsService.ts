import { prisma } from '../lib/prisma';
import { redis } from '../lib/redis';
import { WebhookEventType } from './webhookService';

export interface WebhookAnalytics {
  totalEvents: number;
  successfulEvents: number;
  failedEvents: number;
  successRate: number;
  averageProcessingTime: number;
  eventsByType: Record<string, number>;
  eventsByHour: Array<{ hour: string; count: number }>;
  eventsByDay: Array<{ date: string; count: number }>;
  topInstances: Array<{ instance: string; count: number }>;
  errorsByType: Record<string, number>;
}

export interface WebhookPerformanceMetrics {
  averageResponseTime: number;
  p95ResponseTime: number;
  p99ResponseTime: number;
  throughputPerSecond: number;
  errorRate: number;
  uptime: number;
}

export class WebhookAnalyticsService {
  /**
   * Get comprehensive webhook analytics for a tenant
   */
  static async getWebhookAnalytics(
    tenantId: string,
    period: '1h' | '24h' | '7d' | '30d' = '24h'
  ): Promise<WebhookAnalytics> {
    const now = new Date();
    const { startDate, endDate } = this.getPeriodDates(period, now);

    // Get events from audit logs
    const events = await prisma.auditLog.findMany({
      where: {
        tenantId,
        action: { in: ['WEBHOOK_RECEIVED', 'WEBHOOK_FAILED'] },
        createdAt: {
          gte: startDate,
          lte: endDate
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    // Calculate basic metrics
    const totalEvents = events.length;
    const successfulEvents = events.filter(e => e.action === 'WEBHOOK_RECEIVED').length;
    const failedEvents = events.filter(e => e.action === 'WEBHOOK_FAILED').length;
    const successRate = totalEvents > 0 ? (successfulEvents / totalEvents) * 100 : 0;

    // Calculate average processing time from Redis metrics
    const avgProcessingTime = await this.getAverageProcessingTime(tenantId, period);

    // Group events by type
    const eventsByType: Record<string, number> = {};
    events.forEach(event => {
      const metadata = event.metadata as any;
      const eventType = metadata?.eventType || 'unknown';
      eventsByType[eventType] = (eventsByType[eventType] || 0) + 1;
    });

    // Group events by hour/day
    const eventsByHour = this.groupEventsByHour(events, period);
    const eventsByDay = this.groupEventsByDay(events, period);

    // Get top instances
    const topInstances = this.getTopInstances(events);

    // Get errors by type
    const errorsByType = this.getErrorsByType(events);

    return {
      totalEvents,
      successfulEvents,
      failedEvents,
      successRate,
      averageProcessingTime: avgProcessingTime,
      eventsByType,
      eventsByHour,
      eventsByDay,
      topInstances,
      errorsByType
    };
  }

  /**
   * Get webhook performance metrics
   */
  static async getPerformanceMetrics(
    tenantId: string,
    period: '1h' | '24h' | '7d' | '30d' = '24h'
  ): Promise<WebhookPerformanceMetrics> {
    const { startDate, endDate } = this.getPeriodDates(period, new Date());

    // Get response times from Redis
    const responseTimes = await this.getResponseTimes(tenantId, period);
    
    // Calculate percentiles
    const sortedTimes = responseTimes.sort((a, b) => a - b);
    const averageResponseTime = sortedTimes.length > 0 
      ? sortedTimes.reduce((sum, time) => sum + time, 0) / sortedTimes.length 
      : 0;
    
    const p95Index = Math.floor(sortedTimes.length * 0.95);
    const p99Index = Math.floor(sortedTimes.length * 0.99);
    const p95ResponseTime = sortedTimes[p95Index] || 0;
    const p99ResponseTime = sortedTimes[p99Index] || 0;

    // Calculate throughput
    const periodMs = endDate.getTime() - startDate.getTime();
    const throughputPerSecond = responseTimes.length / (periodMs / 1000);

    // Get error rate
    const events = await prisma.auditLog.count({
      where: {
        tenantId,
        action: { in: ['WEBHOOK_RECEIVED', 'WEBHOOK_FAILED'] },
        createdAt: { gte: startDate, lte: endDate }
      }
    });

    const errors = await prisma.auditLog.count({
      where: {
        tenantId,
        action: 'WEBHOOK_FAILED',
        createdAt: { gte: startDate, lte: endDate }
      }
    });

    const errorRate = events > 0 ? (errors / events) * 100 : 0;

    // Calculate uptime (simplified - based on successful events)
    const uptime = events > 0 ? ((events - errors) / events) * 100 : 100;

    return {
      averageResponseTime,
      p95ResponseTime,
      p99ResponseTime,
      throughputPerSecond,
      errorRate,
      uptime
    };
  }

  /**
   * Get webhook events timeline
   */
  static async getEventsTimeline(
    tenantId: string,
    period: '1h' | '24h' | '7d' | '30d' = '24h',
    eventType?: WebhookEventType
  ): Promise<Array<{ timestamp: string; count: number; success: number; failed: number }>> {
    const { startDate, endDate } = this.getPeriodDates(period, new Date());
    
    const whereClause: any = {
      tenantId,
      action: { in: ['WEBHOOK_RECEIVED', 'WEBHOOK_FAILED'] },
      createdAt: { gte: startDate, lte: endDate }
    };

    if (eventType) {
      whereClause.metadata = {
        path: ['eventType'],
        equals: eventType
      };
    }

    const events = await prisma.auditLog.findMany({
      where: whereClause,
      orderBy: { createdAt: 'asc' }
    });

    // Group by time intervals
    const interval = this.getTimeInterval(period);
    const timeline: Record<string, { count: number; success: number; failed: number }> = {};

    events.forEach(event => {
      const timestamp = this.roundToInterval(event.createdAt, interval);
      const key = timestamp.toISOString();

      if (!timeline[key]) {
        timeline[key] = { count: 0, success: 0, failed: 0 };
      }

      timeline[key].count++;
      if (event.action === 'WEBHOOK_RECEIVED') {
        timeline[key].success++;
      } else {
        timeline[key].failed++;
      }
    });

    return Object.entries(timeline)
      .map(([timestamp, data]) => ({ timestamp, ...data }))
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  }

  /**
   * Get webhook health status
   */
  static async getHealthStatus(tenantId: string): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy';
    issues: string[];
    lastEventAt?: string;
    recentErrorRate: number;
  }> {
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

    // Get recent events
    const recentEvents = await prisma.auditLog.findMany({
      where: {
        tenantId,
        action: { in: ['WEBHOOK_RECEIVED', 'WEBHOOK_FAILED'] },
        createdAt: { gte: oneHourAgo }
      },
      orderBy: { createdAt: 'desc' },
      take: 100
    });

    const issues: string[] = [];
    let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';

    // Check if we have recent events
    const lastEvent = recentEvents[0];
    const lastEventAt = lastEvent?.createdAt.toISOString();

    // Calculate recent error rate
    const totalRecent = recentEvents.length;
    const recentErrors = recentEvents.filter(e => e.action === 'WEBHOOK_FAILED').length;
    const recentErrorRate = totalRecent > 0 ? (recentErrors / totalRecent) * 100 : 0;

    // Health checks
    if (totalRecent === 0) {
      issues.push('No webhook events received in the last hour');
      status = 'degraded';
    }

    if (recentErrorRate > 50) {
      issues.push(`High error rate: ${recentErrorRate.toFixed(1)}%`);
      status = 'unhealthy';
    } else if (recentErrorRate > 20) {
      issues.push(`Elevated error rate: ${recentErrorRate.toFixed(1)}%`);
      if (status === 'healthy') status = 'degraded';
    }

    // Check for processing delays
    const avgProcessingTime = await this.getAverageProcessingTime(tenantId, '1h');
    if (avgProcessingTime > 5000) { // 5 seconds
      issues.push(`Slow processing: ${avgProcessingTime}ms average`);
      if (status === 'healthy') status = 'degraded';
    }

    return {
      status,
      issues,
      lastEventAt,
      recentErrorRate
    };
  }

  /**
   * Store webhook event for analytics
   */
  static async recordWebhookEvent(
    tenantId: string,
    eventType: WebhookEventType,
    instanceId: string,
    processingTime: number,
    success: boolean,
    error?: string
  ): Promise<void> {
    const timestamp = Date.now();
    const date = new Date().toISOString().split('T')[0];
    const hour = new Date().getHours();

    // Store in Redis for fast analytics
    const pipeline = redis.pipeline();

    // Daily metrics
    const dailyKey = `analytics:webhook:${tenantId}:${date}`;
    pipeline.hincrby(dailyKey, 'total_events', 1);
    pipeline.hincrby(dailyKey, success ? 'successful_events' : 'failed_events', 1);
    pipeline.hincrby(dailyKey, `events_by_type:${eventType}`, 1);
    pipeline.hincrby(dailyKey, `events_by_instance:${instanceId}`, 1);
    pipeline.hincrby(dailyKey, 'total_processing_time', processingTime);
    pipeline.expire(dailyKey, 86400 * 30); // 30 days

    // Hourly metrics
    const hourlyKey = `analytics:webhook:${tenantId}:${date}:${hour}`;
    pipeline.hincrby(hourlyKey, 'total_events', 1);
    pipeline.hincrby(hourlyKey, success ? 'successful_events' : 'failed_events', 1);
    pipeline.expire(hourlyKey, 86400 * 7); // 7 days

    // Response time tracking
    const responseTimeKey = `analytics:response_times:${tenantId}`;
    pipeline.lpush(responseTimeKey, processingTime);
    pipeline.ltrim(responseTimeKey, 0, 999); // Keep last 1000 response times
    pipeline.expire(responseTimeKey, 86400); // 24 hours

    // Error tracking
    if (!success && error) {
      const errorKey = `analytics:errors:${tenantId}:${date}`;
      pipeline.hincrby(errorKey, error, 1);
      pipeline.expire(errorKey, 86400 * 7); // 7 days
    }

    await pipeline.exec();
  }

  /**
   * Get period start and end dates
   */
  private static getPeriodDates(period: string, now: Date): { startDate: Date; endDate: Date } {
    const endDate = new Date(now);
    let startDate: Date;

    switch (period) {
      case '1h':
        startDate = new Date(now.getTime() - 60 * 60 * 1000);
        break;
      case '24h':
        startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        break;
      case '7d':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case '30d':
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      default:
        startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    }

    return { startDate, endDate };
  }

  /**
   * Get average processing time from Redis
   */
  private static async getAverageProcessingTime(tenantId: string, period: string): Promise<number> {
    const responseTimeKey = `analytics:response_times:${tenantId}`;
    const responseTimes = await redis.lrange(responseTimeKey, 0, -1);
    
    if (responseTimes.length === 0) return 0;

    const times = responseTimes.map(time => parseInt(time));
    return times.reduce((sum, time) => sum + time, 0) / times.length;
  }

  /**
   * Get response times from Redis
   */
  private static async getResponseTimes(tenantId: string, period: string): Promise<number[]> {
    const responseTimeKey = `analytics:response_times:${tenantId}`;
    const responseTimes = await redis.lrange(responseTimeKey, 0, -1);
    return responseTimes.map(time => parseInt(time));
  }

  /**
   * Group events by hour
   */
  private static groupEventsByHour(events: any[], period: string): Array<{ hour: string; count: number }> {
    const hourCounts: Record<string, number> = {};
    
    events.forEach(event => {
      const hour = event.createdAt.toISOString().substring(0, 13) + ':00:00Z';
      hourCounts[hour] = (hourCounts[hour] || 0) + 1;
    });

    return Object.entries(hourCounts)
      .map(([hour, count]) => ({ hour, count }))
      .sort((a, b) => a.hour.localeCompare(b.hour));
  }

  /**
   * Group events by day
   */
  private static groupEventsByDay(events: any[], period: string): Array<{ date: string; count: number }> {
    const dayCounts: Record<string, number> = {};
    
    events.forEach(event => {
      const date = event.createdAt.toISOString().split('T')[0];
      dayCounts[date] = (dayCounts[date] || 0) + 1;
    });

    return Object.entries(dayCounts)
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  /**
   * Get top instances by event count
   */
  private static getTopInstances(events: any[]): Array<{ instance: string; count: number }> {
    const instanceCounts: Record<string, number> = {};
    
    events.forEach(event => {
      const instance = event.resourceId || 'unknown';
      instanceCounts[instance] = (instanceCounts[instance] || 0) + 1;
    });

    return Object.entries(instanceCounts)
      .map(([instance, count]) => ({ instance, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }

  /**
   * Get errors by type
   */
  private static getErrorsByType(events: any[]): Record<string, number> {
    const errorCounts: Record<string, number> = {};
    
    events
      .filter(event => event.action === 'WEBHOOK_FAILED')
      .forEach(event => {
        const metadata = event.metadata as any;
        const error = metadata?.error || 'Unknown error';
        errorCounts[error] = (errorCounts[error] || 0) + 1;
      });

    return errorCounts;
  }

  /**
   * Get time interval for grouping
   */
  private static getTimeInterval(period: string): number {
    switch (period) {
      case '1h':
        return 5 * 60 * 1000; // 5 minutes
      case '24h':
        return 60 * 60 * 1000; // 1 hour
      case '7d':
        return 6 * 60 * 60 * 1000; // 6 hours
      case '30d':
        return 24 * 60 * 60 * 1000; // 1 day
      default:
        return 60 * 60 * 1000; // 1 hour
    }
  }

  /**
   * Round timestamp to interval
   */
  private static roundToInterval(date: Date, interval: number): Date {
    const timestamp = date.getTime();
    return new Date(Math.floor(timestamp / interval) * interval);
  }
}