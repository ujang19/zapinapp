import { EventEmitter } from 'events';
import { performance } from 'perf_hooks';
import { prisma } from '../lib/prisma';
import { redis } from '../lib/redis';
import { logger } from '../lib/logger';

// Monitoring types
interface SystemMetrics {
  timestamp: number;
  cpu: {
    usage: NodeJS.CpuUsage;
    loadAverage: number[];
  };
  memory: {
    usage: NodeJS.MemoryUsage;
    freeMemory: number;
    totalMemory: number;
  };
  process: {
    uptime: number;
    pid: number;
    version: string;
  };
  eventLoop: {
    delay: number;
    utilization: number;
  };
}

interface ApplicationMetrics {
  timestamp: number;
  requests: {
    total: number;
    successful: number;
    failed: number;
    averageResponseTime: number;
  };
  database: {
    connections: number;
    queries: number;
    averageQueryTime: number;
  };
  cache: {
    hits: number;
    misses: number;
    hitRate: number;
  };
  instances: {
    total: number;
    connected: number;
    disconnected: number;
  };
  messages: {
    sent: number;
    received: number;
    failed: number;
  };
}

interface Alert {
  id: string;
  type: 'warning' | 'error' | 'critical';
  title: string;
  message: string;
  timestamp: number;
  resolved: boolean;
  resolvedAt?: number;
  metadata?: any;
}

// Monitoring service
export class MonitoringService extends EventEmitter {
  private static instance: MonitoringService;
  private metricsHistory: SystemMetrics[] = [];
  private appMetricsHistory: ApplicationMetrics[] = [];
  private alerts: Alert[] = [];
  private isCollecting = false;
  private collectionInterval?: NodeJS.Timeout;
  private readonly maxHistorySize = 1000;
  private readonly collectionIntervalMs = 30000; // 30 seconds

  // Performance counters
  private requestCount = 0;
  private successfulRequests = 0;
  private failedRequests = 0;
  private totalResponseTime = 0;
  private queryCount = 0;
  private totalQueryTime = 0;
  private cacheHits = 0;
  private cacheMisses = 0;
  private messagesSent = 0;
  private messagesReceived = 0;
  private messagesFailed = 0;

  static getInstance(): MonitoringService {
    if (!MonitoringService.instance) {
      MonitoringService.instance = new MonitoringService();
    }
    return MonitoringService.instance;
  }

  constructor() {
    super();
    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    // Listen for application events
    this.on('request.start', this.handleRequestStart.bind(this));
    this.on('request.end', this.handleRequestEnd.bind(this));
    this.on('request.error', this.handleRequestError.bind(this));
    this.on('database.query', this.handleDatabaseQuery.bind(this));
    this.on('cache.hit', this.handleCacheHit.bind(this));
    this.on('cache.miss', this.handleCacheMiss.bind(this));
    this.on('message.sent', this.handleMessageSent.bind(this));
    this.on('message.received', this.handleMessageReceived.bind(this));
    this.on('message.failed', this.handleMessageFailed.bind(this));

    // Listen for process events
    process.on('uncaughtException', this.handleUncaughtException.bind(this));
    process.on('unhandledRejection', this.handleUnhandledRejection.bind(this));
    process.on('warning', this.handleProcessWarning.bind(this));
  }

  startCollection(): void {
    if (this.isCollecting) {
      return;
    }

    this.isCollecting = true;
    this.collectionInterval = setInterval(() => {
      this.collectMetrics();
    }, this.collectionIntervalMs);

    logger.info('Monitoring service started collecting metrics');
  }

  stopCollection(): void {
    if (!this.isCollecting) {
      return;
    }

    this.isCollecting = false;
    if (this.collectionInterval) {
      clearInterval(this.collectionInterval);
      this.collectionInterval = undefined;
    }

    logger.info('Monitoring service stopped collecting metrics');
  }

  private async collectMetrics(): Promise<void> {
    try {
      // Collect system metrics
      const systemMetrics = await this.collectSystemMetrics();
      this.metricsHistory.push(systemMetrics);

      // Collect application metrics
      const appMetrics = await this.collectApplicationMetrics();
      this.appMetricsHistory.push(appMetrics);

      // Trim history to prevent memory leaks
      if (this.metricsHistory.length > this.maxHistorySize) {
        this.metricsHistory = this.metricsHistory.slice(-this.maxHistorySize);
      }
      if (this.appMetricsHistory.length > this.maxHistorySize) {
        this.appMetricsHistory = this.appMetricsHistory.slice(-this.maxHistorySize);
      }

      // Check for alerts
      this.checkAlerts(systemMetrics, appMetrics);

      // Emit metrics collected event
      this.emit('metrics.collected', { systemMetrics, appMetrics });
    } catch (error) {
      logger.error('Failed to collect metrics:', error);
    }
  }

  private async collectSystemMetrics(): Promise<SystemMetrics> {
    const startTime = performance.now();
    
    // Measure event loop delay
    const eventLoopDelay = await this.measureEventLoopDelay();
    const eventLoopUtilization = performance.eventLoopUtilization();

    return {
      timestamp: Date.now(),
      cpu: {
        usage: process.cpuUsage(),
        loadAverage: require('os').loadavg(),
      },
      memory: {
        usage: process.memoryUsage(),
        freeMemory: require('os').freemem(),
        totalMemory: require('os').totalmem(),
      },
      process: {
        uptime: process.uptime(),
        pid: process.pid,
        version: process.version,
      },
      eventLoop: {
        delay: eventLoopDelay,
        utilization: eventLoopUtilization.utilization,
      },
    };
  }

  private async collectApplicationMetrics(): Promise<ApplicationMetrics> {
    try {
      // Get database statistics
      const instanceStats = await this.getInstanceStatistics();
      
      const averageResponseTime = this.requestCount > 0 
        ? this.totalResponseTime / this.requestCount 
        : 0;
      
      const averageQueryTime = this.queryCount > 0 
        ? this.totalQueryTime / this.queryCount 
        : 0;
      
      const hitRate = (this.cacheHits + this.cacheMisses) > 0 
        ? (this.cacheHits / (this.cacheHits + this.cacheMisses)) * 100 
        : 0;

      return {
        timestamp: Date.now(),
        requests: {
          total: this.requestCount,
          successful: this.successfulRequests,
          failed: this.failedRequests,
          averageResponseTime,
        },
        database: {
          connections: await this.getDatabaseConnections(),
          queries: this.queryCount,
          averageQueryTime,
        },
        cache: {
          hits: this.cacheHits,
          misses: this.cacheMisses,
          hitRate,
        },
        instances: instanceStats,
        messages: {
          sent: this.messagesSent,
          received: this.messagesReceived,
          failed: this.messagesFailed,
        },
      };
    } catch (error) {
      logger.error('Failed to collect application metrics:', error);
      
      // Return default metrics on error
      return {
        timestamp: Date.now(),
        requests: {
          total: this.requestCount,
          successful: this.successfulRequests,
          failed: this.failedRequests,
          averageResponseTime: 0,
        },
        database: {
          connections: 0,
          queries: this.queryCount,
          averageQueryTime: 0,
        },
        cache: {
          hits: this.cacheHits,
          misses: this.cacheMisses,
          hitRate: 0,
        },
        instances: {
          total: 0,
          connected: 0,
          disconnected: 0,
        },
        messages: {
          sent: this.messagesSent,
          received: this.messagesReceived,
          failed: this.messagesFailed,
        },
      };
    }
  }

  private async measureEventLoopDelay(): Promise<number> {
    return new Promise((resolve) => {
      const start = performance.now();
      setImmediate(() => {
        const delay = performance.now() - start;
        resolve(delay);
      });
    });
  }

  private async getDatabaseConnections(): Promise<number> {
    try {
      // This is a simplified approach - in production you might want to use
      // database-specific queries to get actual connection counts
      const result = await prisma.$queryRaw<Array<{ count: number }>>`
        SELECT COUNT(*) as count FROM pg_stat_activity WHERE state = 'active'
      `;
      return result[0]?.count || 0;
    } catch (error) {
      return 0;
    }
  }

  private async getInstanceStatistics(): Promise<{
    total: number;
    connected: number;
    disconnected: number;
  }> {
    try {
      const [total, connected] = await Promise.all([
        prisma.instance.count(),
        prisma.instance.count({ where: { status: 'CONNECTED' } }),
      ]);

      return {
        total,
        connected,
        disconnected: total - connected,
      };
    } catch (error) {
      return { total: 0, connected: 0, disconnected: 0 };
    }
  }

  private checkAlerts(systemMetrics: SystemMetrics, appMetrics: ApplicationMetrics): void {
    const alerts: Omit<Alert, 'id' | 'timestamp' | 'resolved'>[] = [];

    // Memory usage alert
    const memoryUsagePercent = (systemMetrics.memory.usage.heapUsed / systemMetrics.memory.usage.heapTotal) * 100;
    if (memoryUsagePercent > 90) {
      alerts.push({
        type: 'critical',
        title: 'High Memory Usage',
        message: `Memory usage is at ${memoryUsagePercent.toFixed(1)}%`,
        metadata: { memoryUsagePercent, heapUsed: systemMetrics.memory.usage.heapUsed },
      });
    } else if (memoryUsagePercent > 75) {
      alerts.push({
        type: 'warning',
        title: 'Elevated Memory Usage',
        message: `Memory usage is at ${memoryUsagePercent.toFixed(1)}%`,
        metadata: { memoryUsagePercent },
      });
    }

    // Event loop delay alert
    if (systemMetrics.eventLoop.delay > 100) {
      alerts.push({
        type: 'warning',
        title: 'High Event Loop Delay',
        message: `Event loop delay is ${systemMetrics.eventLoop.delay.toFixed(2)}ms`,
        metadata: { eventLoopDelay: systemMetrics.eventLoop.delay },
      });
    }

    // High error rate alert
    const errorRate = appMetrics.requests.total > 0 
      ? (appMetrics.requests.failed / appMetrics.requests.total) * 100 
      : 0;
    
    if (errorRate > 10) {
      alerts.push({
        type: 'error',
        title: 'High Error Rate',
        message: `Error rate is ${errorRate.toFixed(1)}%`,
        metadata: { errorRate, failedRequests: appMetrics.requests.failed },
      });
    }

    // Slow response time alert
    if (appMetrics.requests.averageResponseTime > 1000) {
      alerts.push({
        type: 'warning',
        title: 'Slow Response Time',
        message: `Average response time is ${appMetrics.requests.averageResponseTime.toFixed(0)}ms`,
        metadata: { averageResponseTime: appMetrics.requests.averageResponseTime },
      });
    }

    // Low cache hit rate alert
    if (appMetrics.cache.hitRate < 50 && (appMetrics.cache.hits + appMetrics.cache.misses) > 100) {
      alerts.push({
        type: 'warning',
        title: 'Low Cache Hit Rate',
        message: `Cache hit rate is ${appMetrics.cache.hitRate.toFixed(1)}%`,
        metadata: { hitRate: appMetrics.cache.hitRate },
      });
    }

    // Create new alerts
    alerts.forEach(alertData => {
      this.createAlert(alertData);
    });
  }

  private createAlert(alertData: Omit<Alert, 'id' | 'timestamp' | 'resolved'>): void {
    // Check if similar alert already exists and is not resolved
    const existingAlert = this.alerts.find(alert => 
      !alert.resolved && 
      alert.title === alertData.title &&
      Date.now() - alert.timestamp < 300000 // 5 minutes
    );

    if (existingAlert) {
      return; // Don't create duplicate alerts
    }

    const alert: Alert = {
      id: `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now(),
      resolved: false,
      ...alertData,
    };

    this.alerts.push(alert);
    this.emit('alert.created', alert);
    
    logger.warn(`Alert created: ${alert.title} - ${alert.message}`, {
      alertId: alert.id,
      type: alert.type,
      metadata: alert.metadata,
    });
  }

  resolveAlert(alertId: string): boolean {
    const alert = this.alerts.find(a => a.id === alertId);
    if (alert && !alert.resolved) {
      alert.resolved = true;
      alert.resolvedAt = Date.now();
      this.emit('alert.resolved', alert);
      
      logger.info(`Alert resolved: ${alert.title}`, { alertId });
      return true;
    }
    return false;
  }

  // Event handlers
  private handleRequestStart(): void {
    this.requestCount++;
  }

  private handleRequestEnd(data: { responseTime: number; statusCode: number }): void {
    this.totalResponseTime += data.responseTime;
    if (data.statusCode < 400) {
      this.successfulRequests++;
    } else {
      this.failedRequests++;
    }
  }

  private handleRequestError(): void {
    this.failedRequests++;
  }

  private handleDatabaseQuery(data: { queryTime: number }): void {
    this.queryCount++;
    this.totalQueryTime += data.queryTime;
  }

  private handleCacheHit(): void {
    this.cacheHits++;
  }

  private handleCacheMiss(): void {
    this.cacheMisses++;
  }

  private handleMessageSent(): void {
    this.messagesSent++;
  }

  private handleMessageReceived(): void {
    this.messagesReceived++;
  }

  private handleMessageFailed(): void {
    this.messagesFailed++;
  }

  private handleUncaughtException(error: Error): void {
    this.createAlert({
      type: 'critical',
      title: 'Uncaught Exception',
      message: error.message,
      metadata: { stack: error.stack },
    });
  }

  private handleUnhandledRejection(reason: any): void {
    this.createAlert({
      type: 'error',
      title: 'Unhandled Promise Rejection',
      message: reason?.message || 'Unknown rejection reason',
      metadata: { reason },
    });
  }

  private handleProcessWarning(warning: Error): void {
    this.createAlert({
      type: 'warning',
      title: 'Process Warning',
      message: warning.message,
      metadata: { name: warning.name, stack: warning.stack },
    });
  }

  // Public methods for retrieving metrics and alerts
  getSystemMetrics(limit = 100): SystemMetrics[] {
    return this.metricsHistory.slice(-limit);
  }

  getApplicationMetrics(limit = 100): ApplicationMetrics[] {
    return this.appMetricsHistory.slice(-limit);
  }

  getLatestMetrics(): { system: SystemMetrics | null; application: ApplicationMetrics | null } {
    return {
      system: this.metricsHistory[this.metricsHistory.length - 1] || null,
      application: this.appMetricsHistory[this.appMetricsHistory.length - 1] || null,
    };
  }

  getAlerts(includeResolved = false): Alert[] {
    return includeResolved 
      ? [...this.alerts]
      : this.alerts.filter(alert => !alert.resolved);
  }

  getAlertsSummary(): {
    total: number;
    active: number;
    resolved: number;
    critical: number;
    errors: number;
    warnings: number;
  } {
    const active = this.alerts.filter(a => !a.resolved);
    
    return {
      total: this.alerts.length,
      active: active.length,
      resolved: this.alerts.filter(a => a.resolved).length,
      critical: active.filter(a => a.type === 'critical').length,
      errors: active.filter(a => a.type === 'error').length,
      warnings: active.filter(a => a.type === 'warning').length,
    };
  }

  // Reset counters (useful for testing or periodic resets)
  resetCounters(): void {
    this.requestCount = 0;
    this.successfulRequests = 0;
    this.failedRequests = 0;
    this.totalResponseTime = 0;
    this.queryCount = 0;
    this.totalQueryTime = 0;
    this.cacheHits = 0;
    this.cacheMisses = 0;
    this.messagesSent = 0;
    this.messagesReceived = 0;
    this.messagesFailed = 0;
  }

  // Get performance summary
  getPerformanceSummary(): {
    uptime: number;
    requestsPerSecond: number;
    averageResponseTime: number;
    errorRate: number;
    memoryUsage: number;
    cacheHitRate: number;
  } {
    const uptime = process.uptime();
    const requestsPerSecond = uptime > 0 ? this.requestCount / uptime : 0;
    const averageResponseTime = this.requestCount > 0 ? this.totalResponseTime / this.requestCount : 0;
    const errorRate = this.requestCount > 0 ? (this.failedRequests / this.requestCount) * 100 : 0;
    const memoryUsage = process.memoryUsage();
    const memoryUsagePercent = (memoryUsage.heapUsed / memoryUsage.heapTotal) * 100;
    const cacheHitRate = (this.cacheHits + this.cacheMisses) > 0 
      ? (this.cacheHits / (this.cacheHits + this.cacheMisses)) * 100 
      : 0;

    return {
      uptime,
      requestsPerSecond,
      averageResponseTime,
      errorRate,
      memoryUsage: memoryUsagePercent,
      cacheHitRate,
    };
  }
}

// Export singleton instance
export const monitoringService = MonitoringService.getInstance();