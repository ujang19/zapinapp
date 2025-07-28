import { EventEmitter } from 'events';
import { logger } from './logger';
import { metricsCollector } from './metricsCollector';

// Alert types and severity levels
export type AlertSeverity = 'low' | 'medium' | 'high' | 'critical';
export type AlertStatus = 'active' | 'resolved' | 'suppressed';

export interface Alert {
  id: string;
  title: string;
  description: string;
  severity: AlertSeverity;
  status: AlertStatus;
  source: string;
  timestamp: number;
  resolvedAt?: number;
  metadata?: Record<string, any>;
  tags?: string[];
}

export interface AlertRule {
  id: string;
  name: string;
  description: string;
  severity: AlertSeverity;
  condition: (metrics: any) => boolean;
  cooldown: number; // milliseconds
  enabled: boolean;
  tags?: string[];
}

export interface NotificationChannel {
  id: string;
  name: string;
  type: 'email' | 'webhook' | 'slack' | 'discord' | 'console';
  config: Record<string, any>;
  enabled: boolean;
  severityFilter?: AlertSeverity[];
}

export class AlertingSystem extends EventEmitter {
  private static instance: AlertingSystem;
  private alerts: Map<string, Alert> = new Map();
  private rules: Map<string, AlertRule> = new Map();
  private channels: Map<string, NotificationChannel> = new Map();
  private lastAlertTime: Map<string, number> = new Map();
  private isRunning = false;
  private checkInterval?: NodeJS.Timeout;
  private readonly checkIntervalMs = 30000; // 30 seconds

  static getInstance(): AlertingSystem {
    if (!AlertingSystem.instance) {
      AlertingSystem.instance = new AlertingSystem();
    }
    return AlertingSystem.instance;
  }

  constructor() {
    super();
    this.setupDefaultRules();
    this.setupDefaultChannels();
    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    // Listen for metrics collection events
    metricsCollector.on('metrics.collected', (data) => {
      this.evaluateRules(data.metrics);
    });

    // Listen for manual alerts
    this.on('alert.manual', this.handleManualAlert.bind(this));
  }

  private setupDefaultRules(): void {
    // High memory usage alert
    this.addRule({
      id: 'high_memory_usage',
      name: 'High Memory Usage',
      description: 'Memory usage is above 85%',
      severity: 'high',
      condition: (metrics) => {
        const memoryUsage = metrics.system?.memory?.process;
        if (!memoryUsage) return false;
        return (memoryUsage.heapUsed / memoryUsage.heapTotal) > 0.85;
      },
      cooldown: 300000, // 5 minutes
      enabled: true,
      tags: ['system', 'memory'],
    });

    // Critical memory usage alert
    this.addRule({
      id: 'critical_memory_usage',
      name: 'Critical Memory Usage',
      description: 'Memory usage is above 95%',
      severity: 'critical',
      condition: (metrics) => {
        const memoryUsage = metrics.system?.memory?.process;
        if (!memoryUsage) return false;
        return (memoryUsage.heapUsed / memoryUsage.heapTotal) > 0.95;
      },
      cooldown: 60000, // 1 minute
      enabled: true,
      tags: ['system', 'memory'],
    });

    // High CPU load alert
    this.addRule({
      id: 'high_cpu_load',
      name: 'High CPU Load',
      description: 'CPU load average is high',
      severity: 'medium',
      condition: (metrics) => {
        const loadAverage = metrics.system?.cpu?.loadAverage;
        if (!loadAverage || !Array.isArray(loadAverage)) return false;
        return loadAverage[0] > 2.0; // 1-minute load average
      },
      cooldown: 300000, // 5 minutes
      enabled: true,
      tags: ['system', 'cpu'],
    });

    // Database connection failure
    this.addRule({
      id: 'database_connection_failure',
      name: 'Database Connection Failure',
      description: 'Unable to connect to database',
      severity: 'critical',
      condition: (metrics) => {
        return metrics.application?.database?.connected === false;
      },
      cooldown: 60000, // 1 minute
      enabled: true,
      tags: ['database', 'connectivity'],
    });

    // Redis connection failure
    this.addRule({
      id: 'redis_connection_failure',
      name: 'Redis Connection Failure',
      description: 'Unable to connect to Redis',
      severity: 'high',
      condition: (metrics) => {
        return metrics.application?.redis?.connected === false;
      },
      cooldown: 60000, // 1 minute
      enabled: true,
      tags: ['redis', 'connectivity'],
    });

    // Low disk space alert
    this.addRule({
      id: 'low_disk_space',
      name: 'Low Disk Space',
      description: 'Disk space is running low',
      severity: 'medium',
      condition: (metrics) => {
        const disk = metrics.system?.disk;
        if (!disk) return false;
        const usagePercent = (disk.used / disk.total) * 100;
        return usagePercent > 85;
      },
      cooldown: 600000, // 10 minutes
      enabled: true,
      tags: ['system', 'disk'],
    });

    // High event loop delay
    this.addRule({
      id: 'high_event_loop_delay',
      name: 'High Event Loop Delay',
      description: 'Event loop delay is high',
      severity: 'medium',
      condition: (metrics) => {
        const eventLoop = metrics.system?.eventLoop;
        if (!eventLoop) return false;
        return eventLoop.utilization > 0.8; // 80% utilization
      },
      cooldown: 300000, // 5 minutes
      enabled: true,
      tags: ['system', 'performance'],
    });

    // No active WhatsApp instances
    this.addRule({
      id: 'no_active_instances',
      name: 'No Active WhatsApp Instances',
      description: 'No WhatsApp instances are currently connected',
      severity: 'high',
      condition: (metrics) => {
        const instances = metrics.application?.instances;
        if (!instances) return false;
        return instances.total > 0 && instances.connected === 0;
      },
      cooldown: 300000, // 5 minutes
      enabled: true,
      tags: ['whatsapp', 'instances'],
    });
  }

  private setupDefaultChannels(): void {
    // Console notification channel (always enabled for development)
    this.addChannel({
      id: 'console',
      name: 'Console Logger',
      type: 'console',
      config: {},
      enabled: true,
    });

    // Email notification channel (disabled by default)
    this.addChannel({
      id: 'email',
      name: 'Email Notifications',
      type: 'email',
      config: {
        smtp: {
          host: process.env.SMTP_HOST || 'localhost',
          port: parseInt(process.env.SMTP_PORT || '587'),
          secure: process.env.SMTP_SECURE === 'true',
          auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS,
          },
        },
        from: process.env.ALERT_EMAIL_FROM || 'alerts@zapin.app',
        to: process.env.ALERT_EMAIL_TO?.split(',') || [],
      },
      enabled: false, // Enable when SMTP is configured
      severityFilter: ['high', 'critical'],
    });

    // Webhook notification channel
    this.addChannel({
      id: 'webhook',
      name: 'Webhook Notifications',
      type: 'webhook',
      config: {
        url: process.env.ALERT_WEBHOOK_URL,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': process.env.ALERT_WEBHOOK_TOKEN ? `Bearer ${process.env.ALERT_WEBHOOK_TOKEN}` : undefined,
        },
      },
      enabled: !!process.env.ALERT_WEBHOOK_URL,
      severityFilter: ['medium', 'high', 'critical'],
    });
  }

  start(): void {
    if (this.isRunning) {
      logger.warn('Alerting system is already running');
      return;
    }

    this.isRunning = true;
    this.checkInterval = setInterval(() => {
      this.performHealthCheck();
    }, this.checkIntervalMs);

    logger.info('Alerting system started', {
      rules: this.rules.size,
      channels: this.channels.size,
      checkInterval: this.checkIntervalMs,
    });
  }

  stop(): void {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = undefined;
    }

    logger.info('Alerting system stopped');
  }

  private async performHealthCheck(): Promise<void> {
    try {
      // Get latest metrics
      const latestMetrics = metricsCollector.getLatestMetrics();
      if (latestMetrics) {
        this.evaluateRules(latestMetrics.metrics);
      }
    } catch (error) {
      logger.error('Failed to perform health check', { error });
    }
  }

  private evaluateRules(metrics: any): void {
    this.rules.forEach((rule, ruleId) => {
      if (!rule.enabled) return;

      try {
        const shouldAlert = rule.condition(metrics);
        
        if (shouldAlert) {
          const lastAlertTime = this.lastAlertTime.get(ruleId) || 0;
          const now = Date.now();
          
          // Check cooldown period
          if (now - lastAlertTime < rule.cooldown) {
            return;
          }

          this.createAlert({
            title: rule.name,
            description: rule.description,
            severity: rule.severity,
            source: `rule:${ruleId}`,
            metadata: { ruleId, metrics },
            tags: rule.tags,
          });

          this.lastAlertTime.set(ruleId, now);
        }
      } catch (error) {
        logger.error('Failed to evaluate alert rule', {
          ruleId,
          ruleName: rule.name,
          error,
        });
      }
    });
  }

  createAlert(alertData: Omit<Alert, 'id' | 'status' | 'timestamp'>): Alert {
    const alert: Alert = {
      id: `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      status: 'active',
      timestamp: Date.now(),
      ...alertData,
    };

    this.alerts.set(alert.id, alert);
    this.emit('alert.created', alert);

    // Send notifications
    this.sendNotifications(alert);

    logger.warn('Alert created', {
      alertId: alert.id,
      title: alert.title,
      severity: alert.severity,
      source: alert.source,
    });

    return alert;
  }

  resolveAlert(alertId: string, reason?: string): boolean {
    const alert = this.alerts.get(alertId);
    if (!alert || alert.status !== 'active') {
      return false;
    }

    alert.status = 'resolved';
    alert.resolvedAt = Date.now();
    if (reason) {
      alert.metadata = { ...alert.metadata, resolveReason: reason };
    }

    this.emit('alert.resolved', alert);

    logger.info('Alert resolved', {
      alertId: alert.id,
      title: alert.title,
      reason,
    });

    return true;
  }

  suppressAlert(alertId: string, reason?: string): boolean {
    const alert = this.alerts.get(alertId);
    if (!alert || alert.status !== 'active') {
      return false;
    }

    alert.status = 'suppressed';
    if (reason) {
      alert.metadata = { ...alert.metadata, suppressReason: reason };
    }

    this.emit('alert.suppressed', alert);

    logger.info('Alert suppressed', {
      alertId: alert.id,
      title: alert.title,
      reason,
    });

    return true;
  }

  private async sendNotifications(alert: Alert): Promise<void> {
    this.channels.forEach(async (channel, channelId) => {
      if (!channel.enabled) return;

      // Check severity filter
      if (channel.severityFilter && !channel.severityFilter.includes(alert.severity)) {
        return;
      }

      try {
        await this.sendNotification(channel, alert);
      } catch (error) {
        logger.error('Failed to send notification', {
          channelId,
          channelName: channel.name,
          alertId: alert.id,
          error,
        });
      }
    });
  }

  private async sendNotification(channel: NotificationChannel, alert: Alert): Promise<void> {
    switch (channel.type) {
      case 'console':
        this.sendConsoleNotification(alert);
        break;
      case 'email':
        await this.sendEmailNotification(channel, alert);
        break;
      case 'webhook':
        await this.sendWebhookNotification(channel, alert);
        break;
      case 'slack':
        await this.sendSlackNotification(channel, alert);
        break;
      case 'discord':
        await this.sendDiscordNotification(channel, alert);
        break;
      default:
        logger.warn('Unknown notification channel type', {
          channelType: channel.type,
          channelId: channel.id,
        });
    }
  }

  private sendConsoleNotification(alert: Alert): void {
    const emoji = this.getSeverityEmoji(alert.severity);
    console.log(`\n🚨 ${emoji} ALERT: ${alert.title}`);
    console.log(`   Severity: ${alert.severity.toUpperCase()}`);
    console.log(`   Description: ${alert.description}`);
    console.log(`   Source: ${alert.source}`);
    console.log(`   Time: ${new Date(alert.timestamp).toISOString()}`);
    if (alert.tags?.length) {
      console.log(`   Tags: ${alert.tags.join(', ')}`);
    }
    console.log('');
  }

  private async sendEmailNotification(channel: NotificationChannel, alert: Alert): Promise<void> {
    // Email implementation would go here
    // For now, just log that we would send an email
    logger.info('Would send email notification', {
      to: channel.config.to,
      alert: {
        id: alert.id,
        title: alert.title,
        severity: alert.severity,
      },
    });
  }

  private async sendWebhookNotification(channel: NotificationChannel, alert: Alert): Promise<void> {
    if (!channel.config.url) {
      throw new Error('Webhook URL not configured');
    }

    const payload = {
      alert: {
        id: alert.id,
        title: alert.title,
        description: alert.description,
        severity: alert.severity,
        status: alert.status,
        source: alert.source,
        timestamp: alert.timestamp,
        tags: alert.tags,
        metadata: alert.metadata,
      },
      service: 'zapin-api',
      environment: process.env.NODE_ENV || 'development',
    };

    // Webhook implementation would go here
    logger.info('Would send webhook notification', {
      url: channel.config.url,
      payload,
    });
  }

  private async sendSlackNotification(channel: NotificationChannel, alert: Alert): Promise<void> {
    // Slack implementation would go here
    logger.info('Would send Slack notification', {
      alert: {
        id: alert.id,
        title: alert.title,
        severity: alert.severity,
      },
    });
  }

  private async sendDiscordNotification(channel: NotificationChannel, alert: Alert): Promise<void> {
    // Discord implementation would go here
    logger.info('Would send Discord notification', {
      alert: {
        id: alert.id,
        title: alert.title,
        severity: alert.severity,
      },
    });
  }

  private getSeverityEmoji(severity: AlertSeverity): string {
    switch (severity) {
      case 'low': return '🟡';
      case 'medium': return '🟠';
      case 'high': return '🔴';
      case 'critical': return '💀';
      default: return '⚠️';
    }
  }

  private handleManualAlert(data: {
    title: string;
    description: string;
    severity: AlertSeverity;
    source?: string;
    metadata?: Record<string, any>;
    tags?: string[];
  }): void {
    this.createAlert({
      title: data.title,
      description: data.description,
      severity: data.severity,
      source: data.source || 'manual',
      metadata: data.metadata,
      tags: data.tags,
    });
  }

  // Public methods for managing rules and channels
  addRule(rule: AlertRule): void {
    this.rules.set(rule.id, rule);
    logger.info('Alert rule added', { ruleId: rule.id, ruleName: rule.name });
  }

  removeRule(ruleId: string): boolean {
    const removed = this.rules.delete(ruleId);
    if (removed) {
      logger.info('Alert rule removed', { ruleId });
    }
    return removed;
  }

  enableRule(ruleId: string): boolean {
    const rule = this.rules.get(ruleId);
    if (rule) {
      rule.enabled = true;
      logger.info('Alert rule enabled', { ruleId });
      return true;
    }
    return false;
  }

  disableRule(ruleId: string): boolean {
    const rule = this.rules.get(ruleId);
    if (rule) {
      rule.enabled = false;
      logger.info('Alert rule disabled', { ruleId });
      return true;
    }
    return false;
  }

  addChannel(channel: NotificationChannel): void {
    this.channels.set(channel.id, channel);
    logger.info('Notification channel added', { channelId: channel.id, channelName: channel.name });
  }

  removeChannel(channelId: string): boolean {
    const removed = this.channels.delete(channelId);
    if (removed) {
      logger.info('Notification channel removed', { channelId });
    }
    return removed;
  }

  // Getters
  getAlerts(status?: AlertStatus): Alert[] {
    const alerts = Array.from(this.alerts.values());
    return status ? alerts.filter(alert => alert.status === status) : alerts;
  }

  getAlert(alertId: string): Alert | undefined {
    return this.alerts.get(alertId);
  }

  getRules(): AlertRule[] {
    return Array.from(this.rules.values());
  }

  getChannels(): NotificationChannel[] {
    return Array.from(this.channels.values());
  }

  getAlertsSummary(): {
    total: number;
    active: number;
    resolved: number;
    suppressed: number;
    bySeverity: Record<AlertSeverity, number>;
  } {
    const alerts = Array.from(this.alerts.values());
    const summary = {
      total: alerts.length,
      active: 0,
      resolved: 0,
      suppressed: 0,
      bySeverity: {
        low: 0,
        medium: 0,
        high: 0,
        critical: 0,
      } as Record<AlertSeverity, number>,
    };

    alerts.forEach(alert => {
      summary[alert.status]++;
      if (alert.status === 'active') {
        summary.bySeverity[alert.severity]++;
      }
    });

    return summary;
  }

  // Manual alert creation
  createManualAlert(
    title: string,
    description: string,
    severity: AlertSeverity,
    metadata?: Record<string, any>,
    tags?: string[]
  ): Alert {
    return this.createAlert({
      title,
      description,
      severity,
      source: 'manual',
      metadata,
      tags,
    });
  }
}

// Export singleton instance
export const alertingSystem = AlertingSystem.getInstance();

// Helper functions
export const createAlert = (
  title: string,
  description: string,
  severity: AlertSeverity,
  metadata?: Record<string, any>,
  tags?: string[]
) => {
  return alertingSystem.createManualAlert(title, description, severity, metadata, tags);
};

export const resolveAlert = (alertId: string, reason?: string) => {
  return alertingSystem.resolveAlert(alertId, reason);
};

export const suppressAlert = (alertId: string, reason?: string) => {
  return alertingSystem.suppressAlert(alertId, reason);
};