import { prisma } from '../lib/prisma';
import { redis } from '../lib/redis';
import { WebhookAnalyticsService } from './webhookAnalyticsService';
// import { getWebSocketService } from './websocketService';

export interface WebhookAlert {
  id: string;
  type: 'error_rate' | 'processing_delay' | 'no_events' | 'security_breach' | 'quota_exceeded';
  severity: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  message: string;
  tenantId: string;
  instanceId?: string;
  metadata?: any;
  createdAt: Date;
  resolvedAt?: Date;
}

export interface MonitoringRule {
  id: string;
  name: string;
  type: string;
  condition: any;
  threshold: number;
  enabled: boolean;
  tenantId?: string; // null for global rules
}

export class WebhookMonitoringService {
  private static alertRules: MonitoringRule[] = [
    {
      id: 'high_error_rate',
      name: 'High Error Rate',
      type: 'error_rate',
      condition: { period: '5m', threshold: 50 },
      threshold: 50,
      enabled: true,
      tenantId: undefined
    },
    {
      id: 'processing_delay',
      name: 'Processing Delay',
      type: 'processing_delay',
      condition: { threshold: 10000 }, // 10 seconds
      threshold: 10000,
      enabled: true,
      tenantId: undefined
    },
    {
      id: 'no_events',
      name: 'No Events Received',
      type: 'no_events',
      condition: { period: '30m' },
      threshold: 30,
      enabled: true,
      tenantId: undefined
    },
    {
      id: 'security_breach',
      name: 'Security Breach Detected',
      type: 'security_breach',
      condition: { threshold: 10 },
      threshold: 10,
      enabled: true,
      tenantId: undefined
    }
  ];

  /**
   * Start monitoring service
   */
  static async startMonitoring(): Promise<void> {
    console.log('Starting webhook monitoring service...');

    // Run monitoring checks every minute
    setInterval(async () => {
      await this.runMonitoringChecks();
    }, 60000);

    // Run security monitoring every 30 seconds
    setInterval(async () => {
      await this.runSecurityMonitoring();
    }, 30000);

    // Clean up old alerts every hour
    setInterval(async () => {
      await this.cleanupOldAlerts();
    }, 3600000);

    console.log('Webhook monitoring service started');
  }

  /**
   * Run all monitoring checks
   */
  private static async runMonitoringChecks(): Promise<void> {
    try {
      // Get all active tenants
      const tenants = await prisma.tenant.findMany({
        where: { status: 'ACTIVE' },
        select: { id: true, name: true }
      });

      for (const tenant of tenants) {
        await this.checkTenantHealth(tenant.id);
      }

      // Run global checks
      await this.checkGlobalHealth();

    } catch (error) {
      console.error('Error running monitoring checks:', error);
    }
  }

  /**
   * Check tenant-specific health metrics
   */
  private static async checkTenantHealth(tenantId: string): Promise<void> {
    const healthStatus = await WebhookAnalyticsService.getHealthStatus(tenantId);

    // Check for high error rate
    if (healthStatus.recentErrorRate > 50) {
      await this.createAlert({
        type: 'error_rate',
        severity: healthStatus.recentErrorRate > 80 ? 'critical' : 'high',
        title: 'High Error Rate Detected',
        message: `Error rate is ${healthStatus.recentErrorRate.toFixed(1)}% in the last hour`,
        tenantId,
        metadata: { errorRate: healthStatus.recentErrorRate }
      });
    }

    // Check for no recent events
    if (!healthStatus.lastEventAt) {
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      await this.createAlert({
        type: 'no_events',
        severity: 'medium',
        title: 'No Webhook Events',
        message: 'No webhook events received in the last hour',
        tenantId,
        metadata: { lastCheck: oneHourAgo.toISOString() }
      });
    }

    // Check processing performance
    const performanceMetrics = await WebhookAnalyticsService.getPerformanceMetrics(tenantId, '1h');
    if (performanceMetrics.averageResponseTime > 10000) { // 10 seconds
      await this.createAlert({
        type: 'processing_delay',
        severity: 'medium',
        title: 'Slow Processing Detected',
        message: `Average processing time is ${performanceMetrics.averageResponseTime}ms`,
        tenantId,
        metadata: { averageResponseTime: performanceMetrics.averageResponseTime }
      });
    }
  }

  /**
   * Check global system health
   */
  private static async checkGlobalHealth(): Promise<void> {
    // Check Redis connectivity
    try {
      await redis.ping();
    } catch (error) {
      await this.createAlert({
        type: 'error_rate',
        severity: 'critical',
        title: 'Redis Connection Failed',
        message: 'Unable to connect to Redis server',
        tenantId: 'system',
        metadata: { error: error instanceof Error ? error.message : 'Unknown error' }
      });
    }

    // Check database connectivity
    try {
      await prisma.$queryRaw`SELECT 1`;
    } catch (error) {
      await this.createAlert({
        type: 'error_rate',
        severity: 'critical',
        title: 'Database Connection Failed',
        message: 'Unable to connect to database',
        tenantId: 'system',
        metadata: { error: error instanceof Error ? error.message : 'Unknown error' }
      });
    }

    // Check overall system load
    const globalStats = await this.getGlobalStats();
    if (globalStats.totalEventsPerSecond > 1000) { // High load threshold
      await this.createAlert({
        type: 'processing_delay',
        severity: 'medium',
        title: 'High System Load',
        message: `Processing ${globalStats.totalEventsPerSecond} events per second`,
        tenantId: 'system',
        metadata: globalStats
      });
    }
  }

  /**
   * Run security monitoring
   */
  private static async runSecurityMonitoring(): Promise<void> {
    try {
      // Check for suspicious activity patterns
      const securityEvents = await this.getRecentSecurityEvents();
      
      // Group by IP and check for excessive requests
      const ipCounts: Record<string, number> = {};
      securityEvents.forEach(event => {
        if (event.details?.ip) {
          ipCounts[event.details.ip] = (ipCounts[event.details.ip] || 0) + 1;
        }
      });

      // Alert on IPs with too many security events
      for (const [ip, count] of Object.entries(ipCounts)) {
        if (count > 10) {
          await this.createAlert({
            type: 'security_breach',
            severity: count > 50 ? 'critical' : 'high',
            title: 'Suspicious Activity Detected',
            message: `IP ${ip} triggered ${count} security events in the last 5 minutes`,
            tenantId: 'system',
            metadata: { ip, eventCount: count, events: securityEvents.filter(e => e.details?.ip === ip) }
          });
        }
      }

    } catch (error) {
      console.error('Error running security monitoring:', error);
    }
  }

  /**
   * Create and store alert
   */
  private static async createAlert(alertData: Omit<WebhookAlert, 'id' | 'createdAt'>): Promise<void> {
    const alertId = `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const alert: WebhookAlert = {
      id: alertId,
      createdAt: new Date(),
      ...alertData
    };

    // Store alert in Redis
    const alertKey = `alerts:webhook:${alertId}`;
    await redis.setex(alertKey, 86400 * 7, JSON.stringify(alert)); // 7 days retention

    // Add to tenant's alert list
    const tenantAlertsKey = `alerts:tenant:${alertData.tenantId}`;
    await redis.lpush(tenantAlertsKey, alertId);
    await redis.ltrim(tenantAlertsKey, 0, 99); // Keep last 100 alerts
    await redis.expire(tenantAlertsKey, 86400 * 7);

    // Send real-time notification
    await this.sendAlertNotification(alert);

    // Log alert
    console.warn(`Webhook Alert [${alert.severity.toUpperCase()}]: ${alert.title}`, {
      tenantId: alert.tenantId,
      message: alert.message,
      metadata: alert.metadata
    });
  }

  /**
   * Send alert notification via WebSocket
   */
  private static async sendAlertNotification(alert: WebhookAlert): Promise<void> {
    // const wsService = getWebSocketService();
    // if (!wsService) return;

    const notification = {
      type: 'alert',
      alert: {
        id: alert.id,
        type: alert.type,
        severity: alert.severity,
        title: alert.title,
        message: alert.message,
        createdAt: alert.createdAt.toISOString()
      }
    };

    if (alert.tenantId === 'system') {
      // Send to all admin users
      // wsService.getConnectedUsers()
      //   .filter((user: any) => user.role === 'ADMIN')
      //   .forEach((user: any) => {
      //     wsService.sendToUser(user.id, 'webhook:alert', notification);
      //   });
    } else {
      // Send to tenant users
      // wsService.sendToTenant(alert.tenantId, 'webhook:alert', notification);
    }
  }

  /**
   * Get recent security events
   */
  private static async getRecentSecurityEvents(): Promise<any[]> {
    const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
    const eventKeys = await redis.keys('security:events:*');
    const events = [];

    for (const key of eventKeys) {
      const eventData = await redis.get(key);
      if (eventData) {
        const event = JSON.parse(eventData);
        const eventTime = new Date(event.timestamp).getTime();
        
        if (eventTime >= fiveMinutesAgo) {
          events.push(event);
        }
      }
    }

    return events;
  }

  /**
   * Get global system statistics
   */
  private static async getGlobalStats(): Promise<any> {
    const now = Date.now();
    const oneMinuteAgo = now - 60 * 1000;

    // Get recent events count from all tenants
    const recentEvents = await prisma.auditLog.count({
      where: {
        action: { in: ['WEBHOOK_RECEIVED', 'WEBHOOK_FAILED'] },
        createdAt: { gte: new Date(oneMinuteAgo) }
      }
    });

    const totalEventsPerSecond = recentEvents / 60;

    // Get active tenants count
    const activeTenants = await prisma.tenant.count({
      where: { status: 'ACTIVE' }
    });

    // Get active instances count
    const activeInstances = await prisma.instance.count({
      where: { 
        isActive: true,
        status: 'CONNECTED'
      }
    });

    return {
      totalEventsPerSecond,
      activeTenants,
      activeInstances,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Get alerts for tenant
   */
  static async getAlertsForTenant(tenantId: string, limit: number = 50): Promise<WebhookAlert[]> {
    const tenantAlertsKey = `alerts:tenant:${tenantId}`;
    const alertIds = await redis.lrange(tenantAlertsKey, 0, limit - 1);
    
    const alerts: WebhookAlert[] = [];
    for (const alertId of alertIds) {
      const alertKey = `alerts:webhook:${alertId}`;
      const alertData = await redis.get(alertKey);
      if (alertData) {
        alerts.push(JSON.parse(alertData));
      }
    }

    return alerts.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  /**
   * Resolve alert
   */
  static async resolveAlert(alertId: string, resolvedBy: string): Promise<void> {
    const alertKey = `alerts:webhook:${alertId}`;
    const alertData = await redis.get(alertKey);
    
    if (alertData) {
      const alert = JSON.parse(alertData);
      alert.resolvedAt = new Date().toISOString();
      alert.resolvedBy = resolvedBy;
      
      await redis.setex(alertKey, 86400 * 7, JSON.stringify(alert));
      
      // Send resolution notification
      // const wsService = getWebSocketService();
      // if (wsService) {
        // const notification = {
        //   type: 'alert_resolved',
        //   alertId,
        //   resolvedBy,
        //   resolvedAt: alert.resolvedAt
        // };
        
        // if (alert.tenantId === 'system') {
        //   wsService.getConnectedUsers()
        //     .filter((user: any) => user.role === 'ADMIN')
        //     .forEach((user: any) => {
        //       wsService.sendToUser(user.id, 'webhook:alert_resolved', notification);
        //     });
        // } else {
        //   wsService.sendToTenant(alert.tenantId, 'webhook:alert_resolved', notification);
        // }
      // }
    }
  }

  /**
   * Get monitoring dashboard data
   */
  static async getMonitoringDashboard(tenantId?: string): Promise<any> {
    const period = '24h';
    
    if (tenantId) {
      // Tenant-specific dashboard
      const [analytics, performanceMetrics, healthStatus, alerts] = await Promise.all([
        WebhookAnalyticsService.getWebhookAnalytics(tenantId, period),
        WebhookAnalyticsService.getPerformanceMetrics(tenantId, period),
        WebhookAnalyticsService.getHealthStatus(tenantId),
        this.getAlertsForTenant(tenantId, 10)
      ]);

      return {
        analytics,
        performanceMetrics,
        healthStatus,
        alerts: alerts.filter(alert => !alert.resolvedAt),
        period
      };
    } else {
      // Global dashboard
      const globalStats = await this.getGlobalStats();
      const systemAlerts = await this.getAlertsForTenant('system', 20);
      
      return {
        globalStats,
        systemAlerts: systemAlerts.filter(alert => !alert.resolvedAt),
        period
      };
    }
  }

  /**
   * Clean up old alerts
   */
  private static async cleanupOldAlerts(): Promise<void> {
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const alertKeys = await redis.keys('alerts:webhook:*');
    
    let cleanedCount = 0;
    for (const key of alertKeys) {
      const alertData = await redis.get(key);
      if (alertData) {
        const alert = JSON.parse(alertData);
        const alertTime = new Date(alert.createdAt).getTime();
        
        if (alertTime < sevenDaysAgo) {
          await redis.del(key);
          cleanedCount++;
        }
      }
    }
    
    if (cleanedCount > 0) {
      console.log(`Cleaned up ${cleanedCount} old webhook alerts`);
    }
  }

  /**
   * Add custom monitoring rule
   */
  static async addMonitoringRule(rule: Omit<MonitoringRule, 'id'>): Promise<string> {
    const ruleId = `rule_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const fullRule: MonitoringRule = { id: ruleId, ...rule };
    
    // Store rule in Redis
    const ruleKey = `monitoring:rules:${ruleId}`;
    await redis.setex(ruleKey, 86400 * 30, JSON.stringify(fullRule)); // 30 days
    
    // Add to rules list
    await redis.lpush('monitoring:rules:list', ruleId);
    
    return ruleId;
  }

  /**
   * Get all monitoring rules
   */
  static async getMonitoringRules(): Promise<MonitoringRule[]> {
    const ruleIds = await redis.lrange('monitoring:rules:list', 0, -1);
    const rules: MonitoringRule[] = [...this.alertRules]; // Start with default rules
    
    for (const ruleId of ruleIds) {
      const ruleKey = `monitoring:rules:${ruleId}`;
      const ruleData = await redis.get(ruleKey);
      if (ruleData) {
        rules.push(JSON.parse(ruleData));
      }
    }
    
    return rules;
  }
}