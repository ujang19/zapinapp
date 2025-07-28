import { prisma } from '../../lib/prisma';
import { redis } from '../../lib/redis';
import { WebhookPayload, WebhookEventType } from '../webhookService';
import { InstanceStatus } from '@prisma/client';

export interface ConnectionEventData {
  state: 'open' | 'connecting' | 'close';
  statusReason?: number;
  qrcode?: {
    base64: string;
    code: string;
  };
}

export class ConnectionProcessor {
  /**
   * Process connection events (CONNECTION_UPDATE, QRCODE_UPDATED)
   */
  static async processConnectionEvent(
    payload: WebhookPayload,
    tenant: any,
    instance: any
  ): Promise<void> {
    const eventType = payload.event;
    const data = payload.data as ConnectionEventData;

    switch (eventType) {
      case WebhookEventType.CONNECTION_UPDATE:
        await this.handleConnectionUpdate(data, tenant, instance);
        break;
      case WebhookEventType.QRCODE_UPDATED:
        await this.handleQRCodeUpdate(data, tenant, instance);
        break;
      default:
        console.log(`Unhandled connection event: ${eventType}`);
    }
  }

  /**
   * Handle connection state changes
   */
  private static async handleConnectionUpdate(
    data: ConnectionEventData,
    tenant: any,
    instance: any
  ): Promise<void> {
    try {
      const connectionState = data.state;
      const statusReason = data.statusReason;

      // Map connection state to instance status
      const instanceStatus = this.mapConnectionStateToStatus(connectionState);

      // Update instance status in database
      await prisma.instance.update({
        where: { id: instance.id },
        data: {
          status: instanceStatus,
          lastConnectedAt: connectionState === 'open' ? new Date() : instance.lastConnectedAt,
          settings: {
            ...instance.settings,
            lastConnectionUpdate: {
              state: connectionState,
              statusReason,
              timestamp: new Date().toISOString()
            }
          } as any
        }
      });

      // Clear QR code if connected
      if (connectionState === 'open') {
        await prisma.instance.update({
          where: { id: instance.id },
          data: { qrCode: null }
        });

        // Clear QR code from Redis cache
        await redis.del(`qrcode:${instance.evolutionInstanceId}`);
      }

      // Update connection statistics
      await this.updateConnectionStats(tenant.id, instance.id, connectionState);

      // Broadcast real-time update
      await this.broadcastConnectionUpdate(tenant.id, {
        type: 'connection_update',
        instanceId: instance.id,
        instanceName: instance.name,
        state: connectionState,
        status: instanceStatus,
        statusReason,
        timestamp: new Date().toISOString()
      });

      console.log(`Connection update processed: ${instance.evolutionInstanceId} -> ${connectionState}`);

    } catch (error) {
      console.error('Error processing connection update:', error);
      throw error;
    }
  }

  /**
   * Handle QR code updates
   */
  private static async handleQRCodeUpdate(
    data: ConnectionEventData,
    tenant: any,
    instance: any
  ): Promise<void> {
    try {
      const qrCode = data.qrcode;

      if (!qrCode) {
        console.log('QR code update received but no QR code data');
        return;
      }

      // Update instance with new QR code
      await prisma.instance.update({
        where: { id: instance.id },
        data: {
          qrCode: qrCode.base64,
          status: InstanceStatus.CONNECTING
        }
      });

      // Cache QR code in Redis with expiration (5 minutes)
      await redis.setex(
        `qrcode:${instance.evolutionInstanceId}`,
        300,
        JSON.stringify({
          base64: qrCode.base64,
          code: qrCode.code,
          generatedAt: new Date().toISOString()
        })
      );

      // Broadcast QR code update
      await this.broadcastConnectionUpdate(tenant.id, {
        type: 'qrcode_update',
        instanceId: instance.id,
        instanceName: instance.name,
        qrCode: qrCode.base64,
        timestamp: new Date().toISOString()
      });

      console.log(`QR code updated for instance: ${instance.evolutionInstanceId}`);

    } catch (error) {
      console.error('Error processing QR code update:', error);
      throw error;
    }
  }

  /**
   * Map Evolution API connection state to our instance status
   */
  private static mapConnectionStateToStatus(state: string): InstanceStatus {
    switch (state) {
      case 'open':
        return InstanceStatus.CONNECTED;
      case 'connecting':
        return InstanceStatus.CONNECTING;
      case 'close':
        return InstanceStatus.DISCONNECTED;
      default:
        return InstanceStatus.ERROR;
    }
  }

  /**
   * Update connection statistics
   */
  private static async updateConnectionStats(
    tenantId: string,
    instanceId: string,
    state: string
  ): Promise<void> {
    const date = new Date().toISOString().split('T')[0];
    const hour = new Date().getHours();

    // Daily connection stats
    const dailyKey = `stats:connections:${tenantId}:${date}`;
    await redis.hincrby(dailyKey, `state:${state}`, 1);
    await redis.expire(dailyKey, 86400 * 30); // 30 days

    // Hourly connection stats
    const hourlyKey = `stats:connections:${tenantId}:${date}:${hour}`;
    await redis.hincrby(hourlyKey, `state:${state}`, 1);
    await redis.expire(hourlyKey, 86400 * 7); // 7 days

    // Instance-specific stats
    const instanceKey = `stats:instance:${instanceId}:${date}`;
    await redis.hset(instanceKey, 'last_connection_state', state);
    await redis.hset(instanceKey, 'last_connection_update', new Date().toISOString());
    await redis.expire(instanceKey, 86400 * 30); // 30 days

    // Track connection uptime
    if (state === 'open') {
      await redis.hset(`instance:${instanceId}:uptime`, 'connected_at', Date.now());
    } else if (state === 'close') {
      const connectedAt = await redis.hget(`instance:${instanceId}:uptime`, 'connected_at');
      if (connectedAt) {
        const uptime = Date.now() - parseInt(connectedAt);
        await redis.hincrby(`stats:instance:${instanceId}:${date}`, 'uptime_ms', uptime);
        await redis.hdel(`instance:${instanceId}:uptime`, 'connected_at');
      }
    }
  }

  /**
   * Broadcast real-time connection updates
   */
  private static async broadcastConnectionUpdate(
    tenantId: string,
    update: any
  ): Promise<void> {
    const message = {
      ...update,
      tenantId,
      timestamp: new Date().toISOString()
    };

    // Publish to tenant-specific channel
    await redis.publish(`tenant:${tenantId}:connections`, JSON.stringify(message));

    // Publish to global connections channel for admin dashboard
    await redis.publish('global:connections', JSON.stringify(message));

    // Publish to instance-specific channel for real-time UI updates
    await redis.publish(`instance:${update.instanceId}:status`, JSON.stringify(message));
  }

  /**
   * Get current connection statistics for tenant
   */
  static async getConnectionStats(tenantId: string, period: '24h' | '7d' | '30d' = '24h'): Promise<any> {
    const now = new Date();
    const stats = {
      totalConnections: 0,
      successfulConnections: 0,
      failedConnections: 0,
      averageUptime: 0,
      connectionsByState: {
        open: 0,
        connecting: 0,
        close: 0
      }
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
      const key = `stats:connections:${tenantId}:${dateStr}`;
      
      const dayStats = await redis.hgetall(key);
      
      for (const [field, value] of Object.entries(dayStats)) {
        const numValue = parseInt(value);
        if (field.startsWith('state:')) {
          const state = field.replace('state:', '');
          if (state in stats.connectionsByState) {
            (stats.connectionsByState as any)[state] += numValue;
          }
          stats.totalConnections += numValue;
          
          if (state === 'open') {
            stats.successfulConnections += numValue;
          } else if (state === 'close') {
            stats.failedConnections += numValue;
          }
        }
      }
    }

    return stats;
  }

  /**
   * Get instance uptime statistics
   */
  static async getInstanceUptime(instanceId: string, period: '24h' | '7d' | '30d' = '24h'): Promise<any> {
    const now = new Date();
    let totalUptime = 0;
    let days: number;

    switch (period) {
      case '24h': days = 1; break;
      case '7d': days = 7; break;
      case '30d': days = 30; break;
    }

    for (let i = 0; i < days; i++) {
      const date = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
      const dateStr = date.toISOString().split('T')[0];
      const key = `stats:instance:${instanceId}:${dateStr}`;
      
      const uptime = await redis.hget(key, 'uptime_ms');
      if (uptime) {
        totalUptime += parseInt(uptime);
      }
    }

    const totalPeriodMs = days * 24 * 60 * 60 * 1000;
    const uptimePercentage = totalPeriodMs > 0 ? (totalUptime / totalPeriodMs) * 100 : 0;

    return {
      totalUptimeMs: totalUptime,
      totalUptimeHours: Math.round(totalUptime / (1000 * 60 * 60) * 100) / 100,
      uptimePercentage: Math.round(uptimePercentage * 100) / 100,
      period
    };
  }
}