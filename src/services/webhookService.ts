import { prisma } from '../lib/prisma';
import { redis } from '../lib/redis';
import { ZapinError, ErrorCodes } from '../types';
import { evolutionService } from './evolutionService';
import { MessageProcessor } from './eventProcessors/messageProcessor';
import { ConnectionProcessor } from './eventProcessors/connectionProcessor';
import { BotProcessor } from './eventProcessors/botProcessor';
import { WebhookAnalyticsService } from './webhookAnalyticsService';
import crypto from 'crypto';
import { EventEmitter } from 'events';

// Webhook event types from Evolution API
export enum WebhookEventType {
  // Application Events
  APPLICATION_STARTUP = 'APPLICATION_STARTUP',
  QRCODE_UPDATED = 'QRCODE_UPDATED',
  CONNECTION_UPDATE = 'CONNECTION_UPDATE',

  // Message Events
  MESSAGES_SET = 'MESSAGES_SET',
  MESSAGES_UPSERT = 'MESSAGES_UPSERT',
  MESSAGES_UPDATE = 'MESSAGES_UPDATE',
  MESSAGES_DELETE = 'MESSAGES_DELETE',
  SEND_MESSAGE = 'SEND_MESSAGE',

  // Contact Events
  CONTACTS_SET = 'CONTACTS_SET',
  CONTACTS_UPSERT = 'CONTACTS_UPSERT',
  CONTACTS_UPDATE = 'CONTACTS_UPDATE',
  PRESENCE_UPDATE = 'PRESENCE_UPDATE',

  // Chat Events
  CHATS_SET = 'CHATS_SET',
  CHATS_UPSERT = 'CHATS_UPSERT',
  CHATS_UPDATE = 'CHATS_UPDATE',
  CHATS_DELETE = 'CHATS_DELETE',

  // Group Events
  GROUPS_UPSERT = 'GROUPS_UPSERT',
  GROUP_UPDATE = 'GROUP_UPDATE',
  GROUP_PARTICIPANTS_UPDATE = 'GROUP_PARTICIPANTS_UPDATE',

  // Bot Events
  TYPEBOT_START = 'TYPEBOT_START',
  TYPEBOT_CHANGE_STATUS = 'TYPEBOT_CHANGE_STATUS',
  OPENAI_START = 'OPENAI_START',
  OPENAI_CHANGE_STATUS = 'OPENAI_CHANGE_STATUS',

  // Call Events
  CALL = 'CALL'
}

export interface WebhookPayload {
  event: WebhookEventType;
  instance: string;
  data: any;
  destination: string;
  date_time: string;
  sender: string;
  server_url: string;
  apikey?: string;
}

export interface ProcessedWebhookEvent {
  id: string;
  tenantId: string;
  instanceId: string;
  eventType: WebhookEventType;
  payload: WebhookPayload;
  processedAt: Date;
  processingTime: number;
  success: boolean;
  error?: string;
  metadata?: any;
}

export interface WebhookConfig {
  id: string;
  tenantId: string;
  instanceId?: string;
  url: string;
  events: WebhookEventType[];
  isActive: boolean;
  secret?: string;
  retryAttempts: number;
  retryDelay: number;
  timeout: number;
  headers?: Record<string, string>;
  createdAt: Date;
  updatedAt: Date;
}

export class WebhookService extends EventEmitter {
  private static instance: WebhookService;
  private processingQueue: Map<string, Promise<void>> = new Map();
  private eventProcessors: Map<WebhookEventType, Function> = new Map();
  private webhookConfigs: Map<string, WebhookConfig[]> = new Map();

  constructor() {
    super();
    this.initializeEventProcessors();
    this.loadWebhookConfigs();
  }

  static getInstance(): WebhookService {
    if (!WebhookService.instance) {
      WebhookService.instance = new WebhookService();
    }
    return WebhookService.instance;
  }

  /**
   * Process incoming webhook event
   */
  async processWebhookEvent(payload: WebhookPayload): Promise<ProcessedWebhookEvent> {
    const startTime = Date.now();
    const eventId = this.generateEventId(payload);

    try {
      // Validate webhook payload
      this.validateWebhookPayload(payload);

      // Find tenant and instance
      const { tenant, instance } = await this.resolveInstanceAndTenant(payload.instance);

      // Check for duplicate events (idempotency)
      const isDuplicate = await this.checkDuplicateEvent(eventId, tenant.id);
      if (isDuplicate) {
        throw new ZapinError(
          ErrorCodes.VALIDATION_ERROR,
          'Duplicate webhook event',
          409
        );
      }

      // Store raw webhook event
      await this.storeWebhookEvent(eventId, tenant.id, instance.id, payload);

      // Process event based on type
      const processor = this.eventProcessors.get(payload.event);
      if (processor) {
        await processor(payload, tenant, instance);
      }

      // Broadcast real-time updates
      await this.broadcastRealtimeUpdate(tenant.id, payload);

      // Forward to configured webhooks
      await this.forwardToWebhooks(tenant.id, payload);

      const processingTime = Date.now() - startTime;
      const processedEvent: ProcessedWebhookEvent = {
        id: eventId,
        tenantId: tenant.id,
        instanceId: instance.id,
        eventType: payload.event,
        payload,
        processedAt: new Date(),
        processingTime,
        success: true
      };

      // Update metrics
      await this.updateMetrics(tenant.id, payload.event, true, processingTime);

      // Record analytics
      await WebhookAnalyticsService.recordWebhookEvent(
        tenant.id,
        payload.event,
        instance.id,
        processingTime,
        true
      );

      return processedEvent;

    } catch (error) {
      const processingTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      // Store failed event
      await this.storeFailedEvent(eventId, payload, errorMessage);

      // Update metrics
      await this.updateMetrics('unknown', payload.event, false, processingTime);

      // Record analytics for failed event
      if (payload.instance) {
        try {
          const { tenant, instance } = await this.resolveInstanceAndTenant(payload.instance);
          await WebhookAnalyticsService.recordWebhookEvent(
            tenant.id,
            payload.event,
            instance.id,
            processingTime,
            false,
            errorMessage
          );
        } catch (analyticsError) {
          console.error('Failed to record analytics for failed event:', analyticsError);
        }
      }

      throw error;
    }
  }

  /**
   * Validate webhook payload structure
   */
  private validateWebhookPayload(payload: WebhookPayload): void {
    if (!payload.event || !Object.values(WebhookEventType).includes(payload.event)) {
      throw new ZapinError(
        ErrorCodes.VALIDATION_ERROR,
        'Invalid or missing event type',
        400
      );
    }

    if (!payload.instance) {
      throw new ZapinError(
        ErrorCodes.VALIDATION_ERROR,
        'Missing instance identifier',
        400
      );
    }

    if (!payload.data) {
      throw new ZapinError(
        ErrorCodes.VALIDATION_ERROR,
        'Missing event data',
        400
      );
    }
  }

  /**
   * Resolve instance and tenant from instance name
   */
  private async resolveInstanceAndTenant(instanceName: string) {
    const instance = await prisma.instance.findUnique({
      where: { evolutionInstanceId: instanceName },
      include: { tenant: true }
    });

    if (!instance) {
      throw new ZapinError(
        ErrorCodes.INSTANCE_NOT_FOUND,
        `Instance not found: ${instanceName}`,
        404
      );
    }

    if (!instance.tenant || instance.tenant.status !== 'ACTIVE') {
      throw new ZapinError(
        ErrorCodes.VALIDATION_ERROR,
        'Instance tenant is inactive',
        403
      );
    }

    return { tenant: instance.tenant, instance };
  }

  /**
   * Check for duplicate events using Redis
   */
  private async checkDuplicateEvent(eventId: string, tenantId: string): Promise<boolean> {
    const key = `webhook:event:${tenantId}:${eventId}`;
    const exists = await redis.exists(key);
    
    if (exists) {
      return true;
    }

    // Store event ID with 1 hour expiration
    await redis.setex(key, 3600, '1');
    return false;
  }

  /**
   * Store webhook event in database
   */
  private async storeWebhookEvent(
    eventId: string,
    tenantId: string,
    instanceId: string,
    payload: WebhookPayload
  ): Promise<void> {
    await prisma.auditLog.create({
      data: {
        id: eventId,
        action: 'WEBHOOK_RECEIVED',
        resource: 'webhook_event',
        resourceId: instanceId,
        metadata: {
          eventType: payload.event,
          payload: JSON.parse(JSON.stringify(payload)),
          timestamp: new Date().toISOString()
        } as any,
        tenantId,
        userId: 'system'
      }
    });
  }

  /**
   * Store failed webhook event
   */
  private async storeFailedEvent(
    eventId: string,
    payload: WebhookPayload,
    error: string
  ): Promise<void> {
    try {
      await prisma.auditLog.create({
        data: {
          id: eventId,
          action: 'WEBHOOK_FAILED',
          resource: 'webhook_event',
          resourceId: payload.instance,
          metadata: {
            eventType: payload.event,
            payload: JSON.parse(JSON.stringify(payload)),
            error: error,
            timestamp: new Date().toISOString()
          } as any,
          tenantId: 'system',
          userId: 'system'
        }
      });
    } catch (dbError) {
      console.error('Failed to store failed webhook event:', dbError);
    }
  }

  /**
   * Broadcast real-time updates via WebSocket
   */
  private async broadcastRealtimeUpdate(tenantId: string, payload: WebhookPayload): Promise<void> {
    const realtimeData = {
      type: 'webhook_event',
      tenantId,
      eventType: payload.event,
      instance: payload.instance,
      data: payload.data,
      timestamp: new Date().toISOString()
    };

    // Publish to Redis for WebSocket broadcasting
    await redis.publish(`tenant:${tenantId}:events`, JSON.stringify(realtimeData));
    
    // Also publish to global events channel for dashboard
    await redis.publish('global:webhook:events', JSON.stringify(realtimeData));
  }

  /**
   * Forward webhook to configured endpoints
   */
  private async forwardToWebhooks(tenantId: string, payload: WebhookPayload): Promise<void> {
    const configs = this.webhookConfigs.get(tenantId) || [];
    const activeConfigs = configs.filter(config => 
      config.isActive && 
      config.events.includes(payload.event)
    );

    const forwardPromises = activeConfigs.map(config => 
      this.forwardToWebhook(config, payload)
    );

    await Promise.allSettled(forwardPromises);
  }

  /**
   * Forward to individual webhook endpoint
   */
  private async forwardToWebhook(config: WebhookConfig, payload: WebhookPayload): Promise<void> {
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'User-Agent': 'Zapin-Webhook/1.0',
        ...config.headers
      };

      // Add signature if secret is configured
      if (config.secret) {
        const signature = this.generateWebhookSignature(payload, config.secret);
        headers['X-Zapin-Signature'] = signature;
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), config.timeout);

      const response = await fetch(config.url, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      // Log successful delivery
      await this.logWebhookDelivery(config.id, payload, true);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      // Log failed delivery
      await this.logWebhookDelivery(config.id, payload, false, errorMessage);

      // Implement retry logic
      await this.scheduleWebhookRetry(config, payload, errorMessage);
    }
  }

  /**
   * Generate webhook signature for security
   */
  private generateWebhookSignature(payload: WebhookPayload, secret: string): string {
    const payloadString = JSON.stringify(payload);
    return crypto
      .createHmac('sha256', secret)
      .update(payloadString)
      .digest('hex');
  }

  /**
   * Log webhook delivery attempt
   */
  private async logWebhookDelivery(
    configId: string,
    payload: WebhookPayload,
    success: boolean,
    error?: string
  ): Promise<void> {
    const key = `webhook:delivery:${configId}:${Date.now()}`;
    const deliveryLog = {
      configId,
      eventType: payload.event,
      instance: payload.instance,
      success,
      error,
      timestamp: new Date().toISOString()
    };

    await redis.setex(key, 86400, JSON.stringify(deliveryLog)); // 24 hours retention
  }

  /**
   * Schedule webhook retry
   */
  private async scheduleWebhookRetry(
    config: WebhookConfig,
    payload: WebhookPayload,
    error: string
  ): Promise<void> {
    // Implement exponential backoff retry logic
    const retryKey = `webhook:retry:${config.id}:${this.generateEventId(payload)}`;
    const retryData = {
      config,
      payload,
      error,
      attempts: 0,
      nextRetry: Date.now() + config.retryDelay
    };

    await redis.setex(retryKey, 86400, JSON.stringify(retryData));
  }

  /**
   * Update webhook processing metrics
   */
  private async updateMetrics(
    tenantId: string,
    eventType: WebhookEventType,
    success: boolean,
    processingTime: number
  ): Promise<void> {
    const date = new Date().toISOString().split('T')[0];
    const hour = new Date().getHours();

    // Update daily metrics
    const dailyKey = `metrics:webhook:${tenantId}:${date}`;
    await redis.hincrby(dailyKey, `${eventType}:total`, 1);
    await redis.hincrby(dailyKey, `${eventType}:${success ? 'success' : 'failed'}`, 1);
    await redis.expire(dailyKey, 86400 * 30); // 30 days retention

    // Update hourly metrics
    const hourlyKey = `metrics:webhook:${tenantId}:${date}:${hour}`;
    await redis.hincrby(hourlyKey, `${eventType}:total`, 1);
    await redis.hincrby(hourlyKey, `${eventType}:${success ? 'success' : 'failed'}`, 1);
    await redis.hincrby(hourlyKey, 'processing_time', processingTime);
    await redis.expire(hourlyKey, 86400 * 7); // 7 days retention
  }

  /**
   * Generate unique event ID
   */
  private generateEventId(payload: WebhookPayload): string {
    const data = `${payload.event}:${payload.instance}:${payload.date_time}`;
    return crypto.createHash('sha256').update(data).digest('hex').substring(0, 16);
  }

  /**
   * Initialize event processors
   */
  private initializeEventProcessors(): void {
    // Import and register event processors
    // This will be implemented in separate processor files
    this.eventProcessors.set(WebhookEventType.MESSAGES_UPSERT, this.processMessageEvent.bind(this));
    this.eventProcessors.set(WebhookEventType.CONNECTION_UPDATE, this.processConnectionEvent.bind(this));
    this.eventProcessors.set(WebhookEventType.QRCODE_UPDATED, this.processQRCodeEvent.bind(this));
    this.eventProcessors.set(WebhookEventType.TYPEBOT_START, this.processBotEvent.bind(this));
    this.eventProcessors.set(WebhookEventType.GROUPS_UPSERT, this.processGroupEvent.bind(this));
    this.eventProcessors.set(WebhookEventType.CONTACTS_UPSERT, this.processContactEvent.bind(this));
  }

  /**
   * Load webhook configurations from database
   */
  private async loadWebhookConfigs(): Promise<void> {
    // This will be implemented when we create the webhook config management
    // For now, we'll load from a hypothetical webhook_configs table
  }

  /**
   * Process message events
   */
  private async processMessageEvent(payload: WebhookPayload, tenant: any, instance: any): Promise<void> {
    await MessageProcessor.processMessageEvent(payload, tenant, instance);
  }

  /**
   * Process connection events
   */
  private async processConnectionEvent(payload: WebhookPayload, tenant: any, instance: any): Promise<void> {
    await ConnectionProcessor.processConnectionEvent(payload, tenant, instance);
  }

  /**
   * Process QR code events
   */
  private async processQRCodeEvent(payload: WebhookPayload, tenant: any, instance: any): Promise<void> {
    await ConnectionProcessor.processConnectionEvent(payload, tenant, instance);
  }

  /**
   * Process bot events
   */
  private async processBotEvent(payload: WebhookPayload, tenant: any, instance: any): Promise<void> {
    await BotProcessor.processBotEvent(payload, tenant, instance);
  }

  /**
   * Process group events
   */
  private async processGroupEvent(payload: WebhookPayload, tenant: any, instance: any): Promise<void> {
    // TODO: Implement group event processor
    console.log('Processing group event:', payload.event);
  }

  /**
   * Process contact events
   */
  private async processContactEvent(payload: WebhookPayload, tenant: any, instance: any): Promise<void> {
    // TODO: Implement contact event processor
    console.log('Processing contact event:', payload.event);
  }

  /**
   * Get webhook processing statistics
   */
  async getWebhookStats(tenantId: string, period: '24h' | '7d' | '30d' = '24h'): Promise<any> {
    const now = new Date();
    const stats: any = {
      totalEvents: 0,
      successfulEvents: 0,
      failedEvents: 0,
      eventsByType: {},
      averageProcessingTime: 0
    };

    let days: number;
    switch (period) {
      case '24h': days = 1; break;
      case '7d': days = 7; break;
      case '30d': days = 30; break;
    }

    for (let i = 0; i < days; i++) {
      const date = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
      const dateStr = date.toISOString().split('T')[0];
      const key = `metrics:webhook:${tenantId}:${dateStr}`;
      
      const dayStats = await redis.hgetall(key);
      
      for (const [field, value] of Object.entries(dayStats)) {
        const numValue = parseInt(value);
        if (field.endsWith(':total')) {
          const eventType = field.replace(':total', '');
          stats.eventsByType[eventType] = (stats.eventsByType[eventType] || 0) + numValue;
          stats.totalEvents += numValue;
        } else if (field.endsWith(':success')) {
          stats.successfulEvents += numValue;
        } else if (field.endsWith(':failed')) {
          stats.failedEvents += numValue;
        }
      }
    }

    stats.successRate = stats.totalEvents > 0 ? 
      (stats.successfulEvents / stats.totalEvents) * 100 : 0;

    return stats;
  }

  /**
   * Get recent webhook events
   */
  async getRecentEvents(tenantId: string, limit: number = 50): Promise<any[]> {
    const events = await prisma.auditLog.findMany({
      where: {
        tenantId,
        action: { in: ['WEBHOOK_RECEIVED', 'WEBHOOK_FAILED'] }
      },
      orderBy: { createdAt: 'desc' },
      take: limit
    });

    return events.map(event => {
      const metadata = event.metadata as any;
      return {
        id: event.id,
        eventType: metadata?.eventType,
        instance: event.resourceId,
        success: event.action === 'WEBHOOK_RECEIVED',
        timestamp: event.createdAt,
        error: metadata?.error
      };
    });
  }
}

// Export singleton instance
export const webhookService = WebhookService.getInstance();