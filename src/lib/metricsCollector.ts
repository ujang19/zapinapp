import { EventEmitter } from 'events';
import { performance } from 'perf_hooks';
import { promClient, register } from './metrics';
import { logger } from './logger';
import { prisma } from './prisma';
import { redis } from './redis';
import os from 'os';
import fs from 'fs';
import path from 'path';

// Custom metrics for detailed monitoring
const systemMetricsGauge = new promClient.Gauge({
  name: 'zapin_system_metrics',
  help: 'System metrics including CPU, memory, and disk usage',
  labelNames: ['metric_type', 'unit'],
});

const applicationMetricsGauge = new promClient.Gauge({
  name: 'zapin_application_metrics',
  help: 'Application-specific metrics',
  labelNames: ['metric_type', 'component'],
});

const performanceMetricsHistogram = new promClient.Histogram({
  name: 'zapin_performance_metrics',
  help: 'Performance metrics for various operations',
  labelNames: ['operation', 'component'],
  buckets: [0.1, 0.5, 1, 2, 5, 10, 30, 60],
});

const errorMetricsCounter = new promClient.Counter({
  name: 'zapin_error_metrics',
  help: 'Error metrics by type and component',
  labelNames: ['error_type', 'component', 'severity'],
});

const businessMetricsCounter = new promClient.Counter({
  name: 'zapin_business_metrics',
  help: 'Business logic metrics',
  labelNames: ['event_type', 'tenant_id', 'status'],
});

// Register custom metrics
register.registerMetric(systemMetricsGauge);
register.registerMetric(applicationMetricsGauge);
register.registerMetric(performanceMetricsHistogram);
register.registerMetric(errorMetricsCounter);
register.registerMetric(businessMetricsCounter);

interface MetricsCollectorConfig {
  collectInterval: number; // in milliseconds
  enableSystemMetrics: boolean;
  enableApplicationMetrics: boolean;
  enablePerformanceMetrics: boolean;
  retentionPeriod: number; // in milliseconds
}

export class MetricsCollector extends EventEmitter {
  private static instance: MetricsCollector;
  private config: MetricsCollectorConfig;
  private isCollecting = false;
  private collectionInterval?: NodeJS.Timeout;
  private performanceTimers = new Map<string, number>();
  private metricsHistory: Array<{ timestamp: number; metrics: any }> = [];

  static getInstance(config?: Partial<MetricsCollectorConfig>): MetricsCollector {
    if (!MetricsCollector.instance) {
      MetricsCollector.instance = new MetricsCollector(config);
    }
    return MetricsCollector.instance;
  }

  constructor(config?: Partial<MetricsCollectorConfig>) {
    super();
    
    this.config = {
      collectInterval: 30000, // 30 seconds
      enableSystemMetrics: true,
      enableApplicationMetrics: true,
      enablePerformanceMetrics: true,
      retentionPeriod: 24 * 60 * 60 * 1000, // 24 hours
      ...config,
    };

    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    // Listen for application events
    this.on('performance.start', this.handlePerformanceStart.bind(this));
    this.on('performance.end', this.handlePerformanceEnd.bind(this));
    this.on('error.occurred', this.handleError.bind(this));
    this.on('business.event', this.handleBusinessEvent.bind(this));

    // Process events
    process.on('uncaughtException', (error) => {
      this.handleError({
        type: 'uncaught_exception',
        component: 'process',
        severity: 'critical',
        error,
      });
    });

    process.on('unhandledRejection', (reason) => {
      this.handleError({
        type: 'unhandled_rejection',
        component: 'process',
        severity: 'critical',
        error: reason,
      });
    });
  }

  startCollection(): void {
    if (this.isCollecting) {
      logger.warn('Metrics collection is already running');
      return;
    }

    this.isCollecting = true;
    this.collectionInterval = setInterval(() => {
      this.collectMetrics();
    }, this.config.collectInterval);

    logger.info('Metrics collection started', {
      interval: this.config.collectInterval,
      systemMetrics: this.config.enableSystemMetrics,
      applicationMetrics: this.config.enableApplicationMetrics,
    });
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

    logger.info('Metrics collection stopped');
  }

  private async collectMetrics(): Promise<void> {
    try {
      const timestamp = Date.now();
      const metrics: any = {};

      if (this.config.enableSystemMetrics) {
        metrics.system = await this.collectSystemMetrics();
      }

      if (this.config.enableApplicationMetrics) {
        metrics.application = await this.collectApplicationMetrics();
      }

      // Store metrics history
      this.metricsHistory.push({ timestamp, metrics });
      
      // Clean up old metrics
      this.cleanupOldMetrics();

      // Emit metrics collected event
      this.emit('metrics.collected', { timestamp, metrics });

      logger.debug('Metrics collected successfully', { timestamp });
    } catch (error) {
      logger.error('Failed to collect metrics', { error });
      this.handleError({
        type: 'metrics_collection_failed',
        component: 'metrics_collector',
        severity: 'high',
        error,
      });
    }
  }

  private async collectSystemMetrics(): Promise<any> {
    const startTime = performance.now();

    try {
      // CPU metrics
      const cpuUsage = process.cpuUsage();
      const loadAverage = os.loadavg();
      
      systemMetricsGauge.set(
        { metric_type: 'cpu_user', unit: 'microseconds' },
        cpuUsage.user
      );
      systemMetricsGauge.set(
        { metric_type: 'cpu_system', unit: 'microseconds' },
        cpuUsage.system
      );
      systemMetricsGauge.set(
        { metric_type: 'load_average_1m', unit: 'ratio' },
        loadAverage[0]
      );
      systemMetricsGauge.set(
        { metric_type: 'load_average_5m', unit: 'ratio' },
        loadAverage[1]
      );
      systemMetricsGauge.set(
        { metric_type: 'load_average_15m', unit: 'ratio' },
        loadAverage[2]
      );

      // Memory metrics
      const memoryUsage = process.memoryUsage();
      const totalMemory = os.totalmem();
      const freeMemory = os.freemem();
      const usedMemory = totalMemory - freeMemory;

      systemMetricsGauge.set(
        { metric_type: 'memory_heap_used', unit: 'bytes' },
        memoryUsage.heapUsed
      );
      systemMetricsGauge.set(
        { metric_type: 'memory_heap_total', unit: 'bytes' },
        memoryUsage.heapTotal
      );
      systemMetricsGauge.set(
        { metric_type: 'memory_rss', unit: 'bytes' },
        memoryUsage.rss
      );
      systemMetricsGauge.set(
        { metric_type: 'memory_external', unit: 'bytes' },
        memoryUsage.external
      );
      systemMetricsGauge.set(
        { metric_type: 'system_memory_used', unit: 'bytes' },
        usedMemory
      );
      systemMetricsGauge.set(
        { metric_type: 'system_memory_free', unit: 'bytes' },
        freeMemory
      );

      // Process metrics
      systemMetricsGauge.set(
        { metric_type: 'process_uptime', unit: 'seconds' },
        process.uptime()
      );
      systemMetricsGauge.set(
        { metric_type: 'system_uptime', unit: 'seconds' },
        os.uptime()
      );

      // Event loop metrics
      const eventLoopUtilization = performance.eventLoopUtilization();
      systemMetricsGauge.set(
        { metric_type: 'event_loop_utilization', unit: 'ratio' },
        eventLoopUtilization.utilization
      );

      // Disk usage (for current directory)
      const diskUsage = await this.getDiskUsage();
      if (diskUsage) {
        systemMetricsGauge.set(
          { metric_type: 'disk_used', unit: 'bytes' },
          diskUsage.used
        );
        systemMetricsGauge.set(
          { metric_type: 'disk_free', unit: 'bytes' },
          diskUsage.free
        );
        systemMetricsGauge.set(
          { metric_type: 'disk_total', unit: 'bytes' },
          diskUsage.total
        );
      }

      const collectionTime = performance.now() - startTime;
      performanceMetricsHistogram.observe(
        { operation: 'collect_system_metrics', component: 'metrics_collector' },
        collectionTime / 1000
      );

      return {
        cpu: { usage: cpuUsage, loadAverage },
        memory: { process: memoryUsage, system: { total: totalMemory, free: freeMemory, used: usedMemory } },
        process: { uptime: process.uptime(), pid: process.pid },
        system: { uptime: os.uptime(), platform: os.platform(), arch: os.arch() },
        eventLoop: eventLoopUtilization,
        disk: diskUsage,
        collectionTime,
      };
    } catch (error) {
      logger.error('Failed to collect system metrics', { error });
      throw error;
    }
  }

  private async collectApplicationMetrics(): Promise<any> {
    const startTime = performance.now();

    try {
      // Database metrics
      const dbMetrics = await this.collectDatabaseMetrics();
      
      // Redis metrics
      const redisMetrics = await this.collectRedisMetrics();
      
      // Application-specific metrics
      const instanceCount = await this.getInstanceCount();
      const userCount = await this.getUserCount();
      const tenantCount = await this.getTenantCount();

      applicationMetricsGauge.set(
        { metric_type: 'total_instances', component: 'whatsapp' },
        instanceCount.total
      );
      applicationMetricsGauge.set(
        { metric_type: 'connected_instances', component: 'whatsapp' },
        instanceCount.connected
      );
      applicationMetricsGauge.set(
        { metric_type: 'total_users', component: 'auth' },
        userCount
      );
      applicationMetricsGauge.set(
        { metric_type: 'total_tenants', component: 'tenant' },
        tenantCount
      );

      const collectionTime = performance.now() - startTime;
      performanceMetricsHistogram.observe(
        { operation: 'collect_application_metrics', component: 'metrics_collector' },
        collectionTime / 1000
      );

      return {
        database: dbMetrics,
        redis: redisMetrics,
        instances: instanceCount,
        users: userCount,
        tenants: tenantCount,
        collectionTime,
      };
    } catch (error) {
      logger.error('Failed to collect application metrics', { error });
      throw error;
    }
  }

  private async collectDatabaseMetrics(): Promise<any> {
    try {
      // This is a simplified approach - in production you might want to use
      // database-specific queries for more detailed metrics
      const startTime = performance.now();
      
      // Test database connectivity
      await prisma.$queryRaw`SELECT 1`;
      
      const queryTime = performance.now() - startTime;
      
      applicationMetricsGauge.set(
        { metric_type: 'database_response_time', component: 'database' },
        queryTime
      );

      return {
        connected: true,
        responseTime: queryTime,
      };
    } catch (error) {
      applicationMetricsGauge.set(
        { metric_type: 'database_response_time', component: 'database' },
        -1
      );
      
      return {
        connected: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private async collectRedisMetrics(): Promise<any> {
    try {
      const startTime = performance.now();
      
      // Test Redis connectivity
      await redis.ping();
      
      const responseTime = performance.now() - startTime;
      
      applicationMetricsGauge.set(
        { metric_type: 'redis_response_time', component: 'cache' },
        responseTime
      );

      return {
        connected: true,
        responseTime,
      };
    } catch (error) {
      applicationMetricsGauge.set(
        { metric_type: 'redis_response_time', component: 'cache' },
        -1
      );
      
      return {
        connected: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private async getDiskUsage(): Promise<{ used: number; free: number; total: number } | null> {
    try {
      const stats = await fs.promises.statfs(process.cwd());
      const total = stats.blocks * stats.bsize;
      const free = stats.bavail * stats.bsize;
      const used = total - free;
      
      return { used, free, total };
    } catch (error) {
      // Fallback for systems that don't support statfs
      return null;
    }
  }

  private async getInstanceCount(): Promise<{ total: number; connected: number }> {
    try {
      const [total, connected] = await Promise.all([
        prisma.instance.count(),
        prisma.instance.count({ where: { status: 'CONNECTED' } }),
      ]);
      
      return { total, connected };
    } catch (error) {
      return { total: 0, connected: 0 };
    }
  }

  private async getUserCount(): Promise<number> {
    try {
      return await prisma.user.count();
    } catch (error) {
      return 0;
    }
  }

  private async getTenantCount(): Promise<number> {
    try {
      return await prisma.tenant.count();
    } catch (error) {
      return 0;
    }
  }

  private cleanupOldMetrics(): void {
    const cutoffTime = Date.now() - this.config.retentionPeriod;
    this.metricsHistory = this.metricsHistory.filter(
      entry => entry.timestamp > cutoffTime
    );
  }

  // Event handlers
  private handlePerformanceStart(data: { operation: string; component: string }): void {
    const key = `${data.component}:${data.operation}`;
    this.performanceTimers.set(key, performance.now());
  }

  private handlePerformanceEnd(data: { operation: string; component: string }): void {
    const key = `${data.component}:${data.operation}`;
    const startTime = this.performanceTimers.get(key);
    
    if (startTime) {
      const duration = (performance.now() - startTime) / 1000;
      performanceMetricsHistogram.observe(
        { operation: data.operation, component: data.component },
        duration
      );
      this.performanceTimers.delete(key);
    }
  }

  private handleError(data: {
    type: string;
    component: string;
    severity: string;
    error: any;
  }): void {
    errorMetricsCounter.inc({
      error_type: data.type,
      component: data.component,
      severity: data.severity,
    });

    logger.error('Error metric recorded', {
      type: data.type,
      component: data.component,
      severity: data.severity,
      error: data.error?.message || data.error,
    });
  }

  private handleBusinessEvent(data: {
    eventType: string;
    tenantId: string;
    status: string;
  }): void {
    businessMetricsCounter.inc({
      event_type: data.eventType,
      tenant_id: data.tenantId,
      status: data.status,
    });
  }

  // Public methods
  recordPerformance(operation: string, component: string, duration: number): void {
    performanceMetricsHistogram.observe(
      { operation, component },
      duration / 1000
    );
  }

  recordError(type: string, component: string, severity: 'low' | 'medium' | 'high' | 'critical'): void {
    errorMetricsCounter.inc({
      error_type: type,
      component,
      severity,
    });
  }

  recordBusinessEvent(eventType: string, tenantId: string, status: 'success' | 'failure' | 'pending'): void {
    businessMetricsCounter.inc({
      event_type: eventType,
      tenant_id: tenantId,
      status,
    });
  }

  getMetricsHistory(limit = 100): Array<{ timestamp: number; metrics: any }> {
    return this.metricsHistory.slice(-limit);
  }

  getLatestMetrics(): { timestamp: number; metrics: any } | null {
    return this.metricsHistory[this.metricsHistory.length - 1] || null;
  }

  async exportMetrics(): Promise<string> {
    return register.metrics();
  }

  getMetricsSummary(): any {
    const latest = this.getLatestMetrics();
    if (!latest) {
      return null;
    }

    return {
      timestamp: latest.timestamp,
      system: {
        uptime: latest.metrics.system?.process?.uptime || 0,
        memoryUsage: latest.metrics.system?.memory?.process?.heapUsed || 0,
        cpuUsage: latest.metrics.system?.cpu?.usage || {},
        loadAverage: latest.metrics.system?.cpu?.loadAverage || [],
      },
      application: {
        database: latest.metrics.application?.database?.connected || false,
        redis: latest.metrics.application?.redis?.connected || false,
        instances: latest.metrics.application?.instances || { total: 0, connected: 0 },
        users: latest.metrics.application?.users || 0,
        tenants: latest.metrics.application?.tenants || 0,
      },
    };
  }
}

// Export singleton instance
export const metricsCollector = MetricsCollector.getInstance();

// Helper functions for easy integration
export const startPerformanceTimer = (operation: string, component: string) => {
  metricsCollector.emit('performance.start', { operation, component });
};

export const endPerformanceTimer = (operation: string, component: string) => {
  metricsCollector.emit('performance.end', { operation, component });
};

export const recordError = (type: string, component: string, severity: 'low' | 'medium' | 'high' | 'critical', error?: any) => {
  metricsCollector.emit('error.occurred', { type, component, severity, error });
};

export const recordBusinessEvent = (eventType: string, tenantId: string, status: 'success' | 'failure' | 'pending') => {
  metricsCollector.emit('business.event', { eventType, tenantId, status });
};