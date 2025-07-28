import { prisma } from '../../lib/prisma';
import { redis } from '../../lib/redis';
import { WebhookPayload, WebhookEventType } from '../webhookService';
import { SessionStatus } from '@prisma/client';

export interface BotEventData {
  remoteJid: string;
  status: 'opened' | 'closed' | 'paused';
  url?: string;
  session?: string;
  variables?: Record<string, any>;
  prefilledVariables?: Record<string, any>;
}

export class BotProcessor {
  /**
   * Process bot events (TYPEBOT_START, TYPEBOT_CHANGE_STATUS, OPENAI_START, OPENAI_CHANGE_STATUS)
   */
  static async processBotEvent(
    payload: WebhookPayload,
    tenant: any,
    instance: any
  ): Promise<void> {
    const eventType = payload.event;
    const data = payload.data as BotEventData;

    switch (eventType) {
      case WebhookEventType.TYPEBOT_START:
        await this.handleTypebotStart(data, tenant, instance);
        break;
      case WebhookEventType.TYPEBOT_CHANGE_STATUS:
        await this.handleTypebotStatusChange(data, tenant, instance);
        break;
      case WebhookEventType.OPENAI_START:
        await this.handleOpenAIStart(data, tenant, instance);
        break;
      case WebhookEventType.OPENAI_CHANGE_STATUS:
        await this.handleOpenAIStatusChange(data, tenant, instance);
        break;
      default:
        console.log(`Unhandled bot event: ${eventType}`);
    }
  }

  /**
   * Handle Typebot session start
   */
  private static async handleTypebotStart(
    data: BotEventData,
    tenant: any,
    instance: any
  ): Promise<void> {
    try {
      const phoneNumber = this.extractPhoneNumber(data.remoteJid);
      const sessionId = data.session || this.generateSessionId(phoneNumber, 'typebot');

      // Find the associated bot
      const bot = await prisma.bot.findFirst({
        where: {
          instanceId: instance.id,
          type: 'TYPEBOT',
          isActive: true
        }
      });

      if (!bot) {
        console.log(`No active Typebot found for instance ${instance.id}`);
        return;
      }

      // Create or update bot session
      await prisma.botSession.upsert({
        where: { sessionId },
        update: {
          status: SessionStatus.ACTIVE,
          context: {
            url: data.url,
            variables: data.variables,
            prefilledVariables: data.prefilledVariables,
            startedAt: new Date().toISOString()
          } as any,
          updatedAt: new Date()
        },
        create: {
          sessionId,
          phoneNumber,
          status: SessionStatus.ACTIVE,
          context: {
            url: data.url,
            variables: data.variables,
            prefilledVariables: data.prefilledVariables,
            startedAt: new Date().toISOString()
          } as any,
          botId: bot.id,
          startedAt: new Date()
        }
      });

      // Update bot session statistics
      await this.updateBotStats(tenant.id, bot.id, 'session_started');

      // Broadcast real-time update
      await this.broadcastBotUpdate(tenant.id, {
        type: 'typebot_session_started',
        instanceId: instance.id,
        botId: bot.id,
        sessionId,
        phoneNumber,
        url: data.url,
        timestamp: new Date().toISOString()
      });

      console.log(`Typebot session started: ${sessionId} for ${phoneNumber}`);

    } catch (error) {
      console.error('Error processing Typebot start:', error);
      throw error;
    }
  }

  /**
   * Handle Typebot status changes
   */
  private static async handleTypebotStatusChange(
    data: BotEventData,
    tenant: any,
    instance: any
  ): Promise<void> {
    try {
      const phoneNumber = this.extractPhoneNumber(data.remoteJid);
      const sessionId = data.session || this.generateSessionId(phoneNumber, 'typebot');
      const status = this.mapBotStatusToSessionStatus(data.status);

      // Update bot session status
      const updatedSession = await prisma.botSession.update({
        where: { sessionId },
        data: {
          status,
          context: {
            statusChange: {
              from: 'active',
              to: data.status,
              timestamp: new Date().toISOString()
            }
          } as any,
          endedAt: status === SessionStatus.ENDED ? new Date() : null,
          updatedAt: new Date()
        }
      });

      // Update bot session statistics
      await this.updateBotStats(tenant.id, updatedSession.botId, `session_${data.status}`);

      // Broadcast real-time update
      await this.broadcastBotUpdate(tenant.id, {
        type: 'typebot_status_changed',
        instanceId: instance.id,
        botId: updatedSession.botId,
        sessionId,
        phoneNumber,
        status: data.status,
        timestamp: new Date().toISOString()
      });

      console.log(`Typebot status changed: ${sessionId} -> ${data.status}`);

    } catch (error) {
      console.error('Error processing Typebot status change:', error);
      throw error;
    }
  }

  /**
   * Handle OpenAI bot session start
   */
  private static async handleOpenAIStart(
    data: BotEventData,
    tenant: any,
    instance: any
  ): Promise<void> {
    try {
      const phoneNumber = this.extractPhoneNumber(data.remoteJid);
      const sessionId = data.session || this.generateSessionId(phoneNumber, 'openai');

      // Find the associated bot
      const bot = await prisma.bot.findFirst({
        where: {
          instanceId: instance.id,
          type: 'OPENAI',
          isActive: true
        }
      });

      if (!bot) {
        console.log(`No active OpenAI bot found for instance ${instance.id}`);
        return;
      }

      // Create or update bot session
      await prisma.botSession.upsert({
        where: { sessionId },
        update: {
          status: SessionStatus.ACTIVE,
          context: {
            variables: data.variables,
            startedAt: new Date().toISOString()
          } as any,
          updatedAt: new Date()
        },
        create: {
          sessionId,
          phoneNumber,
          status: SessionStatus.ACTIVE,
          context: {
            variables: data.variables,
            startedAt: new Date().toISOString()
          } as any,
          botId: bot.id,
          startedAt: new Date()
        }
      });

      // Update bot session statistics
      await this.updateBotStats(tenant.id, bot.id, 'session_started');

      // Broadcast real-time update
      await this.broadcastBotUpdate(tenant.id, {
        type: 'openai_session_started',
        instanceId: instance.id,
        botId: bot.id,
        sessionId,
        phoneNumber,
        timestamp: new Date().toISOString()
      });

      console.log(`OpenAI session started: ${sessionId} for ${phoneNumber}`);

    } catch (error) {
      console.error('Error processing OpenAI start:', error);
      throw error;
    }
  }

  /**
   * Handle OpenAI bot status changes
   */
  private static async handleOpenAIStatusChange(
    data: BotEventData,
    tenant: any,
    instance: any
  ): Promise<void> {
    try {
      const phoneNumber = this.extractPhoneNumber(data.remoteJid);
      const sessionId = data.session || this.generateSessionId(phoneNumber, 'openai');
      const status = this.mapBotStatusToSessionStatus(data.status);

      // Update bot session status
      const updatedSession = await prisma.botSession.update({
        where: { sessionId },
        data: {
          status,
          context: {
            statusChange: {
              from: 'active',
              to: data.status,
              timestamp: new Date().toISOString()
            }
          } as any,
          endedAt: status === SessionStatus.ENDED ? new Date() : null,
          updatedAt: new Date()
        }
      });

      // Update bot session statistics
      await this.updateBotStats(tenant.id, updatedSession.botId, `session_${data.status}`);

      // Broadcast real-time update
      await this.broadcastBotUpdate(tenant.id, {
        type: 'openai_status_changed',
        instanceId: instance.id,
        botId: updatedSession.botId,
        sessionId,
        phoneNumber,
        status: data.status,
        timestamp: new Date().toISOString()
      });

      console.log(`OpenAI status changed: ${sessionId} -> ${data.status}`);

    } catch (error) {
      console.error('Error processing OpenAI status change:', error);
      throw error;
    }
  }

  /**
   * Extract phone number from remoteJid
   */
  private static extractPhoneNumber(remoteJid: string): string {
    return remoteJid.replace('@s.whatsapp.net', '').replace('@g.us', '');
  }

  /**
   * Generate session ID
   */
  private static generateSessionId(phoneNumber: string, botType: string): string {
    const timestamp = Date.now();
    return `${botType}_${phoneNumber}_${timestamp}`;
  }

  /**
   * Map bot status to session status
   */
  private static mapBotStatusToSessionStatus(status: string): SessionStatus {
    switch (status) {
      case 'opened':
        return SessionStatus.ACTIVE;
      case 'closed':
        return SessionStatus.ENDED;
      case 'paused':
        return SessionStatus.ACTIVE; // Keep as active but with paused context
      default:
        return SessionStatus.ENDED;
    }
  }

  /**
   * Update bot statistics
   */
  private static async updateBotStats(
    tenantId: string,
    botId: string,
    eventType: string
  ): Promise<void> {
    const date = new Date().toISOString().split('T')[0];
    const hour = new Date().getHours();

    // Daily bot stats
    const dailyKey = `stats:bots:${tenantId}:${date}`;
    await redis.hincrby(dailyKey, `bot:${botId}:${eventType}`, 1);
    await redis.hincrby(dailyKey, `total:${eventType}`, 1);
    await redis.expire(dailyKey, 86400 * 30); // 30 days

    // Hourly bot stats
    const hourlyKey = `stats:bots:${tenantId}:${date}:${hour}`;
    await redis.hincrby(hourlyKey, `bot:${botId}:${eventType}`, 1);
    await redis.expire(hourlyKey, 86400 * 7); // 7 days

    // Bot-specific stats
    const botKey = `stats:bot:${botId}:${date}`;
    await redis.hincrby(botKey, eventType, 1);
    await redis.expire(botKey, 86400 * 30); // 30 days

    // Track active sessions
    if (eventType === 'session_started') {
      await redis.sadd(`active_sessions:${botId}`, `${botId}_session`);
    } else if (eventType === 'session_closed') {
      await redis.srem(`active_sessions:${botId}`, `${botId}_session`);
    }
  }

  /**
   * Broadcast real-time bot updates
   */
  private static async broadcastBotUpdate(
    tenantId: string,
    update: any
  ): Promise<void> {
    const message = {
      ...update,
      tenantId,
      timestamp: new Date().toISOString()
    };

    // Publish to tenant-specific channel
    await redis.publish(`tenant:${tenantId}:bots`, JSON.stringify(message));

    // Publish to global bots channel for admin dashboard
    await redis.publish('global:bots', JSON.stringify(message));

    // Publish to bot-specific channel
    await redis.publish(`bot:${update.botId}:events`, JSON.stringify(message));
  }

  /**
   * Get bot statistics for tenant
   */
  static async getBotStats(tenantId: string, period: '24h' | '7d' | '30d' = '24h'): Promise<any> {
    const now = new Date();
    const stats = {
      totalSessions: 0,
      activeSessions: 0,
      completedSessions: 0,
      sessionsByBot: {},
      sessionsByType: {
        typebot: 0,
        openai: 0
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
      const key = `stats:bots:${tenantId}:${dateStr}`;
      
      const dayStats = await redis.hgetall(key);
      
      for (const [field, value] of Object.entries(dayStats)) {
        const numValue = parseInt(value);
        if (field.includes('session_started')) {
          stats.totalSessions += numValue;
        } else if (field.includes('session_closed')) {
          stats.completedSessions += numValue;
        }
      }
    }

    stats.activeSessions = stats.totalSessions - stats.completedSessions;

    return stats;
  }

  /**
   * Get active bot sessions
   */
  static async getActiveSessions(tenantId: string): Promise<any[]> {
    const sessions = await prisma.botSession.findMany({
      where: {
        bot: {
          tenant: {
            id: tenantId
          }
        },
        status: SessionStatus.ACTIVE
      },
      include: {
        bot: {
          include: {
            instance: true
          }
        }
      },
      orderBy: {
        startedAt: 'desc'
      }
    });

    return sessions.map(session => ({
      id: session.id,
      sessionId: session.sessionId,
      phoneNumber: session.phoneNumber,
      botName: session.bot.name,
      botType: session.bot.type,
      instanceName: session.bot.instance.name,
      startedAt: session.startedAt,
      context: session.context
    }));
  }
}