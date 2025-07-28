import { prisma } from '@/lib/prisma';
import { redis } from '@/lib/redis';
import { evolutionService } from './evolutionService';
import { instanceService } from './instanceService';
import { ZapinError, ErrorCodes, PLAN_CONFIGS } from '@/types';
import { Bot, BotType, BotSession, SessionStatus, Instance, Tenant } from '@prisma/client';
import { z } from 'zod';

// Validation schemas
export const CreateTypebotSchema = z.object({
  name: z.string().min(1).max(100),
  instanceId: z.string().cuid(),
  typebotUrl: z.string().url(),
  typebotId: z.string().min(1),
  triggerType: z.enum(['all', 'keyword']),
  triggerValue: z.string().optional(),
  settings: z.object({
    enabled: z.boolean().default(true),
    expire: z.number().min(1).max(1440).optional(), // 1-1440 minutes
    keywordFinish: z.string().optional(),
    delayMessage: z.number().min(0).max(10000).optional(), // 0-10 seconds
    unknownMessage: z.string().optional(),
    listeningFromMe: z.boolean().default(false),
    stopBotFromMe: z.boolean().default(true),
    keepOpen: z.boolean().default(false),
    debounceTime: z.number().min(0).max(5000).optional(), // 0-5 seconds
  }),
});

export const CreateOpenAIBotSchema = z.object({
  name: z.string().min(1).max(100),
  instanceId: z.string().cuid(),
  model: z.string().min(1),
  systemPrompt: z.string().min(1).max(4000),
  triggerType: z.enum(['all', 'keyword']),
  triggerValue: z.string().optional(),
  settings: z.object({
    enabled: z.boolean().default(true),
    botType: z.enum(['assistant', 'chatCompletion']).default('chatCompletion'),
    assistantId: z.string().optional(),
    functionUrl: z.string().url().optional(),
    maxTokens: z.number().min(1).max(4096).optional(),
    temperature: z.number().min(0).max(2).optional(),
    topP: z.number().min(0).max(1).optional(),
    presencePenalty: z.number().min(-2).max(2).optional(),
    frequencyPenalty: z.number().min(-2).max(2).optional(),
    expire: z.number().min(1).max(1440).optional(),
    keywordFinish: z.string().optional(),
    delayMessage: z.number().min(0).max(10000).optional(),
    unknownMessage: z.string().optional(),
    listeningFromMe: z.boolean().default(false),
    stopBotFromMe: z.boolean().default(true),
    keepOpen: z.boolean().default(false),
    debounceTime: z.number().min(0).max(5000).optional(),
    openaiCredsId: z.string().optional(),
  }),
});

export const UpdateBotSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  config: z.record(z.any()).optional(),
  isActive: z.boolean().optional(),
});

// Types
export interface CreateTypebotRequest {
  name: string;
  instanceId: string;
  typebotUrl: string;
  typebotId: string;
  triggerType: 'all' | 'keyword';
  triggerValue?: string;
  settings: TypebotSettings;
}

export interface TypebotSettings {
  enabled: boolean;
  expire?: number;
  keywordFinish?: string;
  delayMessage?: number;
  unknownMessage?: string;
  listeningFromMe?: boolean;
  stopBotFromMe?: boolean;
  keepOpen?: boolean;
  debounceTime?: number;
}

export interface CreateOpenAIBotRequest {
  name: string;
  instanceId: string;
  model: string;
  systemPrompt: string;
  triggerType: 'all' | 'keyword';
  triggerValue?: string;
  settings: OpenAIBotSettings;
}

export interface OpenAIBotSettings {
  enabled: boolean;
  botType: 'assistant' | 'chatCompletion';
  assistantId?: string;
  functionUrl?: string;
  maxTokens?: number;
  temperature?: number;
  topP?: number;
  presencePenalty?: number;
  frequencyPenalty?: number;
  expire?: number;
  keywordFinish?: string;
  delayMessage?: number;
  unknownMessage?: string;
  listeningFromMe?: boolean;
  stopBotFromMe?: boolean;
  keepOpen?: boolean;
  debounceTime?: number;
  openaiCredsId?: string;
}

export interface BotWithDetails extends Bot {
  instance: {
    id: string;
    name: string;
    status: string;
    phoneNumber: string | null;
  };
  _count: {
    sessions: number;
  };
  stats?: BotStats;
}

export interface BotStats {
  totalSessions: number;
  activeSessions: number;
  totalMessages: number;
  avgResponseTime: number;
  successRate: number;
  lastActivity: Date | null;
}

export interface BotSessionWithMessages extends BotSession {
  messages: Array<{
    id: string;
    content: string;
    type: string;
    direction: string;
    createdAt: Date;
  }>;
  bot: {
    id: string;
    name: string;
    type: BotType;
  };
}

export interface BotAnalytics {
  period: '24h' | '7d' | '30d';
  sessions: {
    total: number;
    active: number;
    completed: number;
    abandoned: number;
  };
  messages: {
    total: number;
    inbound: number;
    outbound: number;
  };
  performance: {
    avgResponseTime: number;
    successRate: number;
    errorRate: number;
  };
  trends: Array<{
    date: string;
    sessions: number;
    messages: number;
    responseTime: number;
  }>;
  topUsers: Array<{
    phoneNumber: string;
    sessionCount: number;
    messageCount: number;
    lastActivity: Date;
  }>;
}

export class BotService {
  private readonly REDIS_PREFIX = 'bot:';
  private readonly SESSION_PREFIX = 'bot_session:';
  private readonly STATS_TTL = 300; // 5 minutes

  // Bot CRUD Operations
  async createTypebot(tenantId: string, data: CreateTypebotRequest): Promise<Bot> {
    // Validate input
    const validatedData = CreateTypebotSchema.parse(data);

    // Check tenant and instance access
    const instance = await this.validateInstanceAccess(tenantId, validatedData.instanceId);

    // Check bot quota
    await this.checkBotQuota(tenantId);

    // Check bot name uniqueness
    await this.checkBotNameUniqueness(tenantId, validatedData.name);

    try {
      // Prepare bot configuration
      const botConfig = {
        typebotUrl: validatedData.typebotUrl,
        typebotId: validatedData.typebotId,
        triggerType: validatedData.triggerType,
        triggerValue: validatedData.triggerValue,
        ...validatedData.settings,
      };

      // Create bot in database
      const bot = await prisma.bot.create({
        data: {
          name: validatedData.name,
          type: BotType.TYPEBOT,
          tenantId,
          instanceId: validatedData.instanceId,
          config: botConfig,
          isActive: validatedData.settings.enabled,
        },
        include: {
          instance: {
            select: {
              id: true,
              name: true,
              status: true,
              phoneNumber: true,
            },
          },
        },
      });

      // Configure bot in Evolution API if enabled
      if (validatedData.settings.enabled) {
        await this.enableBotInEvolution(bot, instance);
      }

      // Cache bot data
      await this.cacheBotData(bot);

      // Log audit event
      await this.logAuditEvent(tenantId, 'bot.created', bot.id, {
        botName: bot.name,
        botType: bot.type,
        instanceId: validatedData.instanceId,
      });

      return bot;
    } catch (error) {
      if (error instanceof ZapinError) {
        throw error;
      }

      throw new ZapinError(
        ErrorCodes.INTERNAL_ERROR,
        `Failed to create Typebot: ${error instanceof Error ? error.message : 'Unknown error'}`,
        500
      );
    }
  }

  async createOpenAIBot(tenantId: string, data: CreateOpenAIBotRequest): Promise<Bot> {
    // Validate input
    const validatedData = CreateOpenAIBotSchema.parse(data);

    // Check tenant and instance access
    const instance = await this.validateInstanceAccess(tenantId, validatedData.instanceId);

    // Check bot quota
    await this.checkBotQuota(tenantId);

    // Check bot name uniqueness
    await this.checkBotNameUniqueness(tenantId, validatedData.name);

    try {
      // Prepare bot configuration
      const botConfig = {
        model: validatedData.model,
        systemPrompt: validatedData.systemPrompt,
        triggerType: validatedData.triggerType,
        triggerValue: validatedData.triggerValue,
        ...validatedData.settings,
      };

      // Create bot in database
      const bot = await prisma.bot.create({
        data: {
          name: validatedData.name,
          type: BotType.OPENAI,
          tenantId,
          instanceId: validatedData.instanceId,
          config: botConfig,
          isActive: validatedData.settings.enabled,
        },
        include: {
          instance: {
            select: {
              id: true,
              name: true,
              status: true,
              phoneNumber: true,
            },
          },
        },
      });

      // Configure bot in Evolution API if enabled
      if (validatedData.settings.enabled) {
        await this.enableBotInEvolution(bot, instance);
      }

      // Cache bot data
      await this.cacheBotData(bot);

      // Log audit event
      await this.logAuditEvent(tenantId, 'bot.created', bot.id, {
        botName: bot.name,
        botType: bot.type,
        instanceId: validatedData.instanceId,
      });

      return bot;
    } catch (error) {
      if (error instanceof ZapinError) {
        throw error;
      }

      throw new ZapinError(
        ErrorCodes.INTERNAL_ERROR,
        `Failed to create OpenAI bot: ${error instanceof Error ? error.message : 'Unknown error'}`,
        500
      );
    }
  }

  async getBotById(tenantId: string, botId: string): Promise<BotWithDetails | null> {
    const bot = await prisma.bot.findFirst({
      where: {
        id: botId,
        tenantId,
      },
      include: {
        instance: {
          select: {
            id: true,
            name: true,
            status: true,
            phoneNumber: true,
          },
        },
        _count: {
          select: {
            sessions: true,
          },
        },
      },
    });

    if (!bot) {
      return null;
    }

    // Get bot stats
    const stats = await this.getBotStats(botId);

    return {
      ...bot,
      stats,
    };
  }

  async getBotsByTenant(tenantId: string): Promise<BotWithDetails[]> {
    const bots = await prisma.bot.findMany({
      where: {
        tenantId,
      },
      include: {
        instance: {
          select: {
            id: true,
            name: true,
            status: true,
            phoneNumber: true,
          },
        },
        _count: {
          select: {
            sessions: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    // Get stats for all bots
    const botsWithStats = await Promise.all(
      bots.map(async (bot) => {
        const stats = await this.getBotStats(bot.id);
        return {
          ...bot,
          stats,
        };
      })
    );

    return botsWithStats;
  }

  async getBotsByInstance(tenantId: string, instanceId: string): Promise<BotWithDetails[]> {
    // Validate instance access
    await this.validateInstanceAccess(tenantId, instanceId);

    const bots = await prisma.bot.findMany({
      where: {
        tenantId,
        instanceId,
      },
      include: {
        instance: {
          select: {
            id: true,
            name: true,
            status: true,
            phoneNumber: true,
          },
        },
        _count: {
          select: {
            sessions: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    // Get stats for all bots
    const botsWithStats = await Promise.all(
      bots.map(async (bot) => {
        const stats = await this.getBotStats(bot.id);
        return {
          ...bot,
          stats,
        };
      })
    );

    return botsWithStats;
  }

  async updateBot(tenantId: string, botId: string, data: Partial<z.infer<typeof UpdateBotSchema>>): Promise<Bot> {
    // Validate input
    const validatedData = UpdateBotSchema.parse(data);

    // Get existing bot
    const existingBot = await this.getBotById(tenantId, botId);
    if (!existingBot) {
      throw new ZapinError(ErrorCodes.INSTANCE_NOT_FOUND, 'Bot not found', 404);
    }

    // Check name uniqueness if changing name
    if (validatedData.name && validatedData.name !== existingBot.name) {
      await this.checkBotNameUniqueness(tenantId, validatedData.name, botId);
    }

    try {
      // Update bot in database
      const updatedBot = await prisma.bot.update({
        where: { id: botId },
        data: {
          ...(validatedData.name && { name: validatedData.name }),
          ...(validatedData.config && { config: validatedData.config }),
          ...(validatedData.isActive !== undefined && { isActive: validatedData.isActive }),
          updatedAt: new Date(),
        },
        include: {
          instance: {
            select: {
              id: true,
              name: true,
              status: true,
              phoneNumber: true,
            },
          },
        },
      });

      // Update Evolution API configuration if status changed
      if (validatedData.isActive !== undefined) {
        if (validatedData.isActive) {
          await this.enableBotInEvolution(updatedBot, updatedBot.instance);
        } else {
          await this.disableBotInEvolution(updatedBot, updatedBot.instance);
        }
      }

      // Update cache
      await this.cacheBotData(updatedBot);

      // Log audit event
      await this.logAuditEvent(tenantId, 'bot.updated', botId, validatedData);

      return updatedBot;
    } catch (error) {
      if (error instanceof ZapinError) {
        throw error;
      }

      throw new ZapinError(
        ErrorCodes.INTERNAL_ERROR,
        `Failed to update bot: ${error instanceof Error ? error.message : 'Unknown error'}`,
        500
      );
    }
  }

  async deleteBot(tenantId: string, botId: string): Promise<void> {
    // Get existing bot
    const bot = await this.getBotById(tenantId, botId);
    if (!bot) {
      throw new ZapinError(ErrorCodes.INSTANCE_NOT_FOUND, 'Bot not found', 404);
    }

    try {
      // Disable bot in Evolution API first
      await this.disableBotInEvolution(bot, bot.instance);

      // End all active sessions
      await this.endAllBotSessions(botId);

      // Delete bot from database (cascade will handle sessions and messages)
      await prisma.bot.delete({
        where: { id: botId },
      });

      // Remove from cache
      await this.removeCachedBotData(botId);

      // Log audit event
      await this.logAuditEvent(tenantId, 'bot.deleted', botId, {
        botName: bot.name,
        botType: bot.type,
      });
    } catch (error) {
      if (error instanceof ZapinError) {
        throw error;
      }

      throw new ZapinError(
        ErrorCodes.INTERNAL_ERROR,
        `Failed to delete bot: ${error instanceof Error ? error.message : 'Unknown error'}`,
        500
      );
    }
  }

  // Bot Session Management
  async getBotSessions(tenantId: string, botId: string, limit: number = 50, offset: number = 0): Promise<BotSessionWithMessages[]> {
    // Validate bot access
    const bot = await this.getBotById(tenantId, botId);
    if (!bot) {
      throw new ZapinError(ErrorCodes.INSTANCE_NOT_FOUND, 'Bot not found', 404);
    }

    return prisma.botSession.findMany({
      where: {
        botId,
      },
      include: {
        messages: {
          select: {
            id: true,
            content: true,
            type: true,
            direction: true,
            createdAt: true,
          },
          orderBy: {
            createdAt: 'asc',
          },
        },
        bot: {
          select: {
            id: true,
            name: true,
            type: true,
          },
        },
      },
      orderBy: {
        startedAt: 'desc',
      },
      take: limit,
      skip: offset,
    });
  }

  async getBotSessionById(tenantId: string, sessionId: string): Promise<BotSessionWithMessages | null> {
    const session = await prisma.botSession.findFirst({
      where: {
        id: sessionId,
        bot: {
          tenantId,
        },
      },
      include: {
        messages: {
          select: {
            id: true,
            content: true,
            type: true,
            direction: true,
            createdAt: true,
          },
          orderBy: {
            createdAt: 'asc',
          },
        },
        bot: {
          select: {
            id: true,
            name: true,
            type: true,
          },
        },
      },
    });

    return session;
  }

  async endBotSession(tenantId: string, sessionId: string): Promise<void> {
    const session = await this.getBotSessionById(tenantId, sessionId);
    if (!session) {
      throw new ZapinError(ErrorCodes.INSTANCE_NOT_FOUND, 'Bot session not found', 404);
    }

    if (session.status === SessionStatus.ENDED) {
      return; // Already ended
    }

    await prisma.botSession.update({
      where: { id: sessionId },
      data: {
        status: SessionStatus.ENDED,
        endedAt: new Date(),
        updatedAt: new Date(),
      },
    });

    // Remove from active sessions cache
    await this.removeActiveSession(session.bot.id, sessionId);
  }

  // Bot Analytics
  async getBotAnalytics(tenantId: string, botId: string, period: '24h' | '7d' | '30d' = '7d'): Promise<BotAnalytics> {
    // Validate bot access
    const bot = await this.getBotById(tenantId, botId);
    if (!bot) {
      throw new ZapinError(ErrorCodes.INSTANCE_NOT_FOUND, 'Bot not found', 404);
    }

    const now = new Date();
    const startDate = new Date();
    
    switch (period) {
      case '24h':
        startDate.setHours(now.getHours() - 24);
        break;
      case '7d':
        startDate.setDate(now.getDate() - 7);
        break;
      case '30d':
        startDate.setDate(now.getDate() - 30);
        break;
    }

    // Get session statistics
    const sessionStats = await prisma.botSession.groupBy({
      by: ['status'],
      where: {
        botId,
        startedAt: {
          gte: startDate,
        },
      },
      _count: {
        id: true,
      },
    });

    // Get message statistics
    const messageStats = await prisma.botMessage.groupBy({
      by: ['direction'],
      where: {
        session: {
          botId,
          startedAt: {
            gte: startDate,
          },
        },
      },
      _count: {
        id: true,
      },
    });

    // Get trends data
    const trends = await this.getBotTrends(botId, period, startDate);

    // Get top users
    const topUsers = await this.getBotTopUsers(botId, startDate);

    // Calculate performance metrics
    const performance = await this.calculateBotPerformance(botId, startDate);

    const sessions = {
      total: sessionStats.reduce((sum, stat) => sum + stat._count.id, 0),
      active: sessionStats.find(s => s.status === SessionStatus.ACTIVE)?._count.id || 0,
      completed: sessionStats.find(s => s.status === SessionStatus.ENDED)?._count.id || 0,
      abandoned: sessionStats.find(s => s.status === SessionStatus.EXPIRED)?._count.id || 0,
    };

    const messages = {
      total: messageStats.reduce((sum, stat) => sum + stat._count.id, 0),
      inbound: messageStats.find(m => m.direction === 'INBOUND')?._count.id || 0,
      outbound: messageStats.find(m => m.direction === 'OUTBOUND')?._count.id || 0,
    };

    return {
      period,
      sessions,
      messages,
      performance,
      trends,
      topUsers,
    };
  }

  // Bot Testing
  async testBot(tenantId: string, botId: string, testMessage: string, phoneNumber: string): Promise<{ success: boolean; response?: string; error?: string }> {
    // Validate bot access
    const bot = await this.getBotById(tenantId, botId);
    if (!bot) {
      throw new ZapinError(ErrorCodes.INSTANCE_NOT_FOUND, 'Bot not found', 404);
    }

    if (!bot.isActive) {
      throw new ZapinError(ErrorCodes.VALIDATION_ERROR, 'Bot is not active', 400);
    }

    try {
      // Create a test session
      const testSession = await prisma.botSession.create({
        data: {
          sessionId: `test_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          botId,
          phoneNumber,
          status: SessionStatus.ACTIVE,
          context: { isTest: true },
        },
      });

      // Send test message through Evolution API
      const instance = await instanceService.getInstanceById(tenantId, bot.instanceId);
      if (!instance) {
        throw new ZapinError(ErrorCodes.INSTANCE_NOT_FOUND, 'Instance not found', 404);
      }

      // Simulate message sending based on bot type
      let response: string;
      if (bot.type === BotType.TYPEBOT) {
        response = await this.simulateTypebotResponse(bot, testMessage);
      } else {
        response = await this.simulateOpenAIResponse(bot, testMessage);
      }

      // Log test messages
      await prisma.botMessage.createMany({
        data: [
          {
            sessionId: testSession.id,
            messageId: `test_in_${Date.now()}`,
            content: testMessage,
            type: 'TEXT',
            direction: 'INBOUND',
          },
          {
            sessionId: testSession.id,
            messageId: `test_out_${Date.now()}`,
            content: response,
            type: 'TEXT',
            direction: 'OUTBOUND',
          },
        ],
      });

      // End test session
      await prisma.botSession.update({
        where: { id: testSession.id },
        data: {
          status: SessionStatus.ENDED,
          endedAt: new Date(),
        },
      });

      return {
        success: true,
        response,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  // Private helper methods
  private async validateInstanceAccess(tenantId: string, instanceId: string): Promise<Instance> {
    const instance = await prisma.instance.findFirst({
      where: {
        id: instanceId,
        tenantId,
        isActive: true,
      },
    });

    if (!instance) {
      throw new ZapinError(ErrorCodes.INSTANCE_ACCESS_DENIED, 'Instance not found or access denied', 403);
    }

    return instance;
  }

  private async checkBotQuota(tenantId: string): Promise<void> {
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      include: { bots: { where: { isActive: true } } },
    });

    if (!tenant) {
      throw new ZapinError(ErrorCodes.UNAUTHORIZED, 'Tenant not found', 404);
    }

    const planConfig = PLAN_CONFIGS[tenant.plan];
    if (tenant.bots.length >= planConfig.botsLimit) {
      throw new ZapinError(
        ErrorCodes.QUOTA_EXCEEDED,
        `Bot limit reached. Your ${tenant.plan} plan allows ${planConfig.botsLimit} bots.`,
        403
      );
    }
  }

  private async checkBotNameUniqueness(tenantId: string, name: string, excludeBotId?: string): Promise<void> {
    const existingBot = await prisma.bot.findFirst({
      where: {
        tenantId,
        name,
        ...(excludeBotId && { id: { not: excludeBotId } }),
      },
    });

    if (existingBot) {
      throw new ZapinError(ErrorCodes.VALIDATION_ERROR, 'Bot name already exists', 400);
    }
  }

  private async enableBotInEvolution(bot: Bot, instance: any): Promise<void> {
    try {
      if (bot.type === BotType.TYPEBOT) {
        const config = bot.config as any;
        await evolutionService.setTypebot(instance.evolutionInstanceId, {
          enabled: true,
          description: bot.name,
          typebot: {
            url: config.typebotUrl,
            typebot: config.typebotId,
            expire: config.expire,
            keywordFinish: config.keywordFinish,
            delayMessage: config.delayMessage,
            unknownMessage: config.unknownMessage,
            listeningFromMe: config.listeningFromMe,
            stopBotFromMe: config.stopBotFromMe,
            keepOpen: config.keepOpen,
            debounceTime: config.debounceTime,
          },
        });
      } else if (bot.type === BotType.OPENAI) {
        const config = bot.config as any;
        await evolutionService.setOpenAIBot(instance.evolutionInstanceId, {
          enabled: true,
          description: bot.name,
          openaibot: {
            enabled: true,
            description: bot.name,
            botType: config.botType,
            assistantId: config.assistantId,
            functionUrl: config.functionUrl,
            model: config.model,
            systemMessages: config.systemPrompt ? [{ role: 'system', content: config.systemPrompt }] : [],
            maxTokens: config.maxTokens,
            expire: config.expire,
            keywordFinish: config.keywordFinish,
            delayMessage: config.delayMessage,
            unknownMessage: config.unknownMessage,
            listeningFromMe: config.listeningFromMe,
            stopBotFromMe: config.stopBotFromMe,
            keepOpen: config.keepOpen,
            debounceTime: config.debounceTime,
            openaiCredsId: config.openaiCredsId,
          },
        });
      }

      // Update evolutionBotId if returned
      await prisma.bot.update({
        where: { id: bot.id },
        data: {
          evolutionBotId: `${instance.evolutionInstanceId}_${bot.type.toLowerCase()}`,
        },
      });
    } catch (error) {
      throw new ZapinError(
        ErrorCodes.EVOLUTION_API_ERROR,
        `Failed to enable bot in Evolution API: ${error instanceof Error ? error.message : 'Unknown error'}`,
        500
      );
    }
  }

  private async disableBotInEvolution(bot: Bot, instance: any): Promise<void> {
    try {
      if (bot.type === BotType.TYPEBOT) {
        await evolutionService.setTypebot(instance.evolutionInstanceId, {
          enabled: false,
        });
      } else if (bot.type === BotType.OPENAI) {
        await evolutionService.setOpenAIBot(instance.evolutionInstanceId, {
          enabled: false,
          openaibot: {
            enabled: false,
            botType: 'chatCompletion', // Required field
          },
        });
      }
    } catch (error) {
      console.error('Failed to disable bot in Evolution API:', error);
    }
  }

  private async endAllBotSessions(botId: string): Promise<void> {
    await prisma.botSession.updateMany({
      where: {
        botId,
        status: SessionStatus.ACTIVE,
      },
      data: {
        status: SessionStatus.ENDED,
        endedAt: new Date(),
        updatedAt: new Date(),
      },
    });
  }

  private async getBotStats(botId: string): Promise<BotStats> {
    const cacheKey = `${this.REDIS_PREFIX}stats:${botId}`;
    
    // Try to get from cache first
    const cached = await redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    // Calculate stats
    const now = new Date();
    const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const [totalSessions, activeSessions, totalMessages, lastActivity] = await Promise.all([
      prisma.botSession.count({ where: { botId } }),
      prisma.botSession.count({ where: { botId, status: SessionStatus.ACTIVE } }),
      prisma.botMessage.count({ where: { session: { botId } } }),
      prisma.botSession.findFirst({
        where: { botId },
        orderBy: { updatedAt: 'desc' },
        select: { updatedAt: true },
      }),
    ]);

    // Calculate average response time (simplified)
    const avgResponseTime = 1500; // Mock value - would need more complex calculation
    const successRate = 0.95; // Mock value - would need more complex calculation

    const stats: BotStats = {
      totalSessions,
      activeSessions,
      totalMessages,
      avgResponseTime,
      successRate,
      lastActivity: lastActivity?.updatedAt || null,
    };

    // Cache for 5 minutes
    await redis.setex(cacheKey, this.STATS_TTL, JSON.stringify(stats));

    return stats;
  }

  private async getBotTrends(botId: string, period: string, startDate: Date): Promise<Array<{ date: string; sessions: number; messages: number; responseTime: number }>> {
    // This would implement trend calculation based on period
    // For now, return mock data
    const trends = [];
    const days = period === '24h' ? 1 : period === '7d' ? 7 : 30;
    
    for (let i = 0; i < days; i++) {
      const date = new Date(startDate.getTime() + i * 24 * 60 * 60 * 1000);
      trends.push({
        date: date.toISOString().split('T')[0],
        sessions: Math.floor(Math.random() * 50),
        messages: Math.floor(Math.random() * 200),
        responseTime: Math.floor(Math.random() * 2000) + 500,
      });
    }

    return trends;
  }

  private async getBotTopUsers(botId: string, startDate: Date): Promise<Array<{ phoneNumber: string; sessionCount: number; messageCount: number; lastActivity: Date }>> {
    const topUsers = await prisma.botSession.groupBy({
      by: ['phoneNumber'],
      where: {
        botId,
        startedAt: { gte: startDate },
      },
      _count: {
        id: true,
      },
      _max: {
        updatedAt: true,
      },
      orderBy: {
        _count: {
          id: 'desc',
        },
      },
      take: 10,
    });

    const result = await Promise.all(
      topUsers.map(async (user) => {
        const messageCount = await prisma.botMessage.count({
          where: {
            session: {
              botId,
              phoneNumber: user.phoneNumber,
              startedAt: { gte: startDate },
            },
          },
        });

        return {
          phoneNumber: user.phoneNumber,
          sessionCount: user._count.id,
          messageCount,
          lastActivity: user._max.updatedAt || new Date(),
        };
      })
    );

    return result;
  }

  private async calculateBotPerformance(botId: string, startDate: Date): Promise<{ avgResponseTime: number; successRate: number; errorRate: number }> {
    // This would implement actual performance calculation
    // For now, return mock data
    return {
      avgResponseTime: 1500,
      successRate: 0.95,
      errorRate: 0.05,
    };
  }

  private async simulateTypebotResponse(bot: Bot, message: string): Promise<string> {
    // This would integrate with actual Typebot API for testing
    // For now, return a mock response
    const config = bot.config as any;
    return `Typebot response from ${config.typebotId}: Thank you for your message "${message}". This is a test response.`;
  }

  private async simulateOpenAIResponse(bot: Bot, message: string): Promise<string> {
    // This would integrate with actual OpenAI API for testing
    // For now, return a mock response
    const config = bot.config as any;
    return `OpenAI ${config.model} response: I received your message "${message}". This is a test response based on the system prompt: "${config.systemPrompt.substring(0, 50)}..."`;
  }

  private async cacheBotData(bot: Bot): Promise<void> {
    const key = `${this.REDIS_PREFIX}${bot.id}`;
    await redis.setex(key, 3600, JSON.stringify(bot)); // Cache for 1 hour
  }

  private async removeCachedBotData(botId: string): Promise<void> {
    const key = `${this.REDIS_PREFIX}${botId}`;
    await redis.del(key);
  }

  private async removeActiveSession(botId: string, sessionId: string): Promise<void> {
    const key = `${this.SESSION_PREFIX}active:${botId}`;
    await redis.srem(key, sessionId);
  }

  private async logAuditEvent(tenantId: string, action: string, resourceId: string, metadata: any): Promise<void> {
    // This would log audit events - implementation depends on audit requirements
    console.log(`Audit: ${action} on ${resourceId} for tenant ${tenantId}`, metadata);
    
    // Could implement actual audit logging here
    try {
      await prisma.auditLog.create({
        data: {
          action,
          resource: 'bot',
          resourceId,
          metadata,
          tenantId,
          userId: 'system', // Would get from context
        },
      });
    } catch (error) {
      console.error('Failed to log audit event:', error);
    }
  }
}

// Singleton instance
export const botService = new BotService();