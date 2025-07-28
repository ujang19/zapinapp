import { prisma } from '../../lib/prisma';
import { redis } from '../../lib/redis';
import { WebhookPayload, WebhookEventType } from '../webhookService';
import { MessageStatus } from '@prisma/client';

export interface MessageEventData {
  key: {
    remoteJid: string;
    fromMe: boolean;
    id: string;
  };
  message?: any;
  messageTimestamp: number;
  status?: string;
  pushName?: string;
  participant?: string;
}

export class MessageProcessor {
  /**
   * Process message events (MESSAGES_UPSERT, MESSAGES_UPDATE, SEND_MESSAGE)
   */
  static async processMessageEvent(
    payload: WebhookPayload,
    tenant: any,
    instance: any
  ): Promise<void> {
    const eventType = payload.event;
    const data = payload.data as MessageEventData;

    switch (eventType) {
      case WebhookEventType.MESSAGES_UPSERT:
        await this.handleMessageUpsert(data, tenant, instance);
        break;
      case WebhookEventType.MESSAGES_UPDATE:
        await this.handleMessageUpdate(data, tenant, instance);
        break;
      case WebhookEventType.SEND_MESSAGE:
        await this.handleSendMessage(data, tenant, instance);
        break;
      default:
        console.log(`Unhandled message event: ${eventType}`);
    }
  }

  /**
   * Handle new or updated messages
   */
  private static async handleMessageUpsert(
    data: MessageEventData,
    tenant: any,
    instance: any
  ): Promise<void> {
    try {
      const messageId = data.key.id;
      const remoteJid = data.key.remoteJid;
      const fromMe = data.key.fromMe;
      const timestamp = new Date(data.messageTimestamp * 1000);

      // Extract message content
      const messageContent = this.extractMessageContent(data.message);
      const messageType = this.getMessageType(data.message);

      // Determine phone number
      const phoneNumber = this.extractPhoneNumber(remoteJid, data.participant);

      // Store message log
      await prisma.messageLog.create({
        data: {
          messageId,
          endpoint: fromMe ? 'outbound' : 'inbound',
          method: 'WEBHOOK',
          status: MessageStatus.DELIVERED,
          phoneNumber,
          content: messageContent,
          metadata: {
            remoteJid,
            fromMe,
            messageType,
            pushName: data.pushName,
            participant: data.participant,
            timestamp: timestamp.toISOString(),
            rawMessage: data.message
          } as any,
          tenantId: tenant.id,
          instanceId: instance.id,
          createdAt: timestamp
        }
      });

      // Update real-time statistics
      await this.updateMessageStats(tenant.id, instance.id, messageType, fromMe);

      // Broadcast real-time update
      await this.broadcastMessageUpdate(tenant.id, {
        type: 'message_received',
        instanceId: instance.id,
        messageId,
        phoneNumber,
        content: messageContent,
        messageType,
        fromMe,
        timestamp: timestamp.toISOString()
      });

      console.log(`Message upsert processed: ${messageId} for tenant ${tenant.id}`);

    } catch (error) {
      console.error('Error processing message upsert:', error);
      throw error;
    }
  }

  /**
   * Handle message status updates (read receipts, delivery status)
   */
  private static async handleMessageUpdate(
    data: MessageEventData,
    tenant: any,
    instance: any
  ): Promise<void> {
    try {
      const messageId = data.key.id;
      const status = data.status;

      if (!status) return;

      // Map Evolution API status to our status
      const messageStatus = this.mapMessageStatus(status);

      // Update message log status
      await prisma.messageLog.updateMany({
        where: {
          messageId,
          tenantId: tenant.id,
          instanceId: instance.id
        },
        data: {
          status: messageStatus,
          metadata: {
            statusUpdate: {
              status,
              updatedAt: new Date().toISOString()
            }
          } as any
        }
      });

      // Broadcast status update
      await this.broadcastMessageUpdate(tenant.id, {
        type: 'message_status_update',
        instanceId: instance.id,
        messageId,
        status: messageStatus,
        timestamp: new Date().toISOString()
      });

      console.log(`Message status updated: ${messageId} -> ${status}`);

    } catch (error) {
      console.error('Error processing message update:', error);
      throw error;
    }
  }

  /**
   * Handle sent message confirmation
   */
  private static async handleSendMessage(
    data: MessageEventData,
    tenant: any,
    instance: any
  ): Promise<void> {
    try {
      const messageId = data.key.id;
      const remoteJid = data.key.remoteJid;
      const phoneNumber = this.extractPhoneNumber(remoteJid);

      // Update message log to mark as sent
      await prisma.messageLog.updateMany({
        where: {
          messageId,
          tenantId: tenant.id,
          instanceId: instance.id
        },
        data: {
          status: MessageStatus.SENT,
          metadata: {
            sentConfirmation: {
              confirmedAt: new Date().toISOString(),
              remoteJid
            }
          } as any
        }
      });

      // Update quota usage
      await this.updateQuotaUsage(tenant.id);

      // Broadcast sent confirmation
      await this.broadcastMessageUpdate(tenant.id, {
        type: 'message_sent',
        instanceId: instance.id,
        messageId,
        phoneNumber,
        timestamp: new Date().toISOString()
      });

      console.log(`Message sent confirmation: ${messageId}`);

    } catch (error) {
      console.error('Error processing send message:', error);
      throw error;
    }
  }

  /**
   * Extract message content from Evolution API message object
   */
  private static extractMessageContent(message: any): string {
    if (!message) return '';

    // Text message
    if (message.conversation) {
      return message.conversation;
    }

    // Extended text message
    if (message.extendedTextMessage?.text) {
      return message.extendedTextMessage.text;
    }

    // Image message
    if (message.imageMessage?.caption) {
      return message.imageMessage.caption;
    }

    // Video message
    if (message.videoMessage?.caption) {
      return message.videoMessage.caption;
    }

    // Document message
    if (message.documentMessage?.fileName) {
      return `Document: ${message.documentMessage.fileName}`;
    }

    // Audio message
    if (message.audioMessage) {
      return 'Audio message';
    }

    // Location message
    if (message.locationMessage) {
      return `Location: ${message.locationMessage.degreesLatitude}, ${message.locationMessage.degreesLongitude}`;
    }

    // Contact message
    if (message.contactMessage) {
      return `Contact: ${message.contactMessage.displayName}`;
    }

    // Sticker message
    if (message.stickerMessage) {
      return 'Sticker';
    }

    return 'Unknown message type';
  }

  /**
   * Determine message type
   */
  private static getMessageType(message: any): string {
    if (!message) return 'unknown';

    if (message.conversation || message.extendedTextMessage) return 'text';
    if (message.imageMessage) return 'image';
    if (message.videoMessage) return 'video';
    if (message.audioMessage) return 'audio';
    if (message.documentMessage) return 'document';
    if (message.locationMessage) return 'location';
    if (message.contactMessage) return 'contact';
    if (message.stickerMessage) return 'sticker';

    return 'unknown';
  }

  /**
   * Extract phone number from remoteJid
   */
  private static extractPhoneNumber(remoteJid: string, participant?: string): string {
    // For group messages, use participant if available
    if (participant) {
      return participant.replace('@s.whatsapp.net', '');
    }

    // For direct messages
    return remoteJid.replace('@s.whatsapp.net', '').replace('@g.us', '');
  }

  /**
   * Map Evolution API message status to our enum
   */
  private static mapMessageStatus(status: string): MessageStatus {
    switch (status.toLowerCase()) {
      case 'sent':
        return MessageStatus.SENT;
      case 'delivered':
        return MessageStatus.DELIVERED;
      case 'read':
        return MessageStatus.READ;
      case 'failed':
        return MessageStatus.FAILED;
      default:
        return MessageStatus.SENT;
    }
  }

  /**
   * Update message statistics
   */
  private static async updateMessageStats(
    tenantId: string,
    instanceId: string,
    messageType: string,
    fromMe: boolean
  ): Promise<void> {
    const date = new Date().toISOString().split('T')[0];
    const hour = new Date().getHours();

    // Daily stats
    const dailyKey = `stats:messages:${tenantId}:${date}`;
    await redis.hincrby(dailyKey, 'total', 1);
    await redis.hincrby(dailyKey, fromMe ? 'outbound' : 'inbound', 1);
    await redis.hincrby(dailyKey, `type:${messageType}`, 1);
    await redis.expire(dailyKey, 86400 * 30); // 30 days

    // Hourly stats
    const hourlyKey = `stats:messages:${tenantId}:${date}:${hour}`;
    await redis.hincrby(hourlyKey, 'total', 1);
    await redis.hincrby(hourlyKey, fromMe ? 'outbound' : 'inbound', 1);
    await redis.expire(hourlyKey, 86400 * 7); // 7 days

    // Instance stats
    const instanceKey = `stats:instance:${instanceId}:${date}`;
    await redis.hincrby(instanceKey, 'messages', 1);
    await redis.expire(instanceKey, 86400 * 30); // 30 days
  }

  /**
   * Update quota usage for sent messages
   */
  private static async updateQuotaUsage(tenantId: string): Promise<void> {
    const now = new Date();
    const hourPeriod = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}-${String(now.getHours()).padStart(2, '0')}`;
    const dayPeriod = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const monthPeriod = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    // Update hourly quota
    await prisma.quotaUsage.upsert({
      where: {
        tenantId_quotaType_period: {
          tenantId,
          quotaType: 'MESSAGES_HOURLY',
          period: hourPeriod
        }
      },
      update: {
        used: { increment: 1 }
      },
      create: {
        tenantId,
        quotaType: 'MESSAGES_HOURLY',
        period: hourPeriod,
        used: 1,
        limit: 100, // Default limit, should be based on tenant plan
        resetAt: new Date(now.getTime() + 60 * 60 * 1000) // Next hour
      }
    });

    // Update daily quota
    await prisma.quotaUsage.upsert({
      where: {
        tenantId_quotaType_period: {
          tenantId,
          quotaType: 'MESSAGES_DAILY',
          period: dayPeriod
        }
      },
      update: {
        used: { increment: 1 }
      },
      create: {
        tenantId,
        quotaType: 'MESSAGES_DAILY',
        period: dayPeriod,
        used: 1,
        limit: 1000, // Default limit
        resetAt: new Date(now.getTime() + 24 * 60 * 60 * 1000) // Next day
      }
    });

    // Update monthly quota
    await prisma.quotaUsage.upsert({
      where: {
        tenantId_quotaType_period: {
          tenantId,
          quotaType: 'MESSAGES_MONTHLY',
          period: monthPeriod
        }
      },
      update: {
        used: { increment: 1 }
      },
      create: {
        tenantId,
        quotaType: 'MESSAGES_MONTHLY',
        period: monthPeriod,
        used: 1,
        limit: 10000, // Default limit
        resetAt: new Date(now.getFullYear(), now.getMonth() + 1, 1) // Next month
      }
    });
  }

  /**
   * Broadcast real-time message updates
   */
  private static async broadcastMessageUpdate(
    tenantId: string,
    update: any
  ): Promise<void> {
    const message = {
      ...update,
      tenantId,
      timestamp: new Date().toISOString()
    };

    // Publish to tenant-specific channel
    await redis.publish(`tenant:${tenantId}:messages`, JSON.stringify(message));

    // Publish to global messages channel for admin dashboard
    await redis.publish('global:messages', JSON.stringify(message));
  }
}