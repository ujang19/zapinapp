import { FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../../lib/prisma';
import { ZapinError, ErrorCodes, PLAN_CONFIGS } from '../../types';
import { BotType } from '@prisma/client';

interface BotSecurityContext {
  tenantId: string;
  userId?: string;
  apiKeyId?: string;
  userRole?: string;
}

export class BotSecurityService {
  /**
   * Validate bot access permissions
   */
  static async validateBotAccess(
    botId: string,
    context: BotSecurityContext,
    operation: 'read' | 'write' | 'delete' = 'read'
  ): Promise<boolean> {
    try {
      const bot = await prisma.bot.findFirst({
        where: {
          id: botId,
          tenantId: context.tenantId,
        },
        include: {
          instance: {
            select: {
              tenantId: true,
              isActive: true,
            },
          },
        },
      });

      if (!bot) {
        throw new ZapinError(
          ErrorCodes.INSTANCE_NOT_FOUND,
          'Bot not found or access denied',
          404
        );
      }

      // Check if instance belongs to the same tenant
      if (bot.instance.tenantId !== context.tenantId) {
        throw new ZapinError(
          ErrorCodes.INSTANCE_ACCESS_DENIED,
          'Bot instance access denied',
          403
        );
      }

      // For write/delete operations, check if instance is active
      if ((operation === 'write' || operation === 'delete') && !bot.instance.isActive) {
        throw new ZapinError(
          ErrorCodes.INSTANCE_NOT_CONNECTED,
          'Cannot modify bot on inactive instance',
          400
        );
      }

      return true;
    } catch (error) {
      if (error instanceof ZapinError) {
        throw error;
      }
      throw new ZapinError(
        ErrorCodes.DATABASE_ERROR,
        'Failed to validate bot access',
        500
      );
    }
  }

  /**
   * Check bot quota limits
   */
  static async checkBotQuota(tenantId: string): Promise<void> {
    try {
      const tenant = await prisma.tenant.findUnique({
        where: { id: tenantId },
        include: {
          bots: {
            where: { isActive: true },
            select: { id: true },
          },
        },
      });

      if (!tenant) {
        throw new ZapinError(
          ErrorCodes.UNAUTHORIZED,
          'Tenant not found',
          404
        );
      }

      const planConfig = PLAN_CONFIGS[tenant.plan];
      const currentBotCount = tenant.bots.length;

      if (currentBotCount >= planConfig.botsLimit) {
        throw new ZapinError(
          ErrorCodes.QUOTA_EXCEEDED,
          `Bot limit reached. Your ${tenant.plan} plan allows ${planConfig.botsLimit} bots. Current: ${currentBotCount}`,
          403
        );
      }
    } catch (error) {
      if (error instanceof ZapinError) {
        throw error;
      }
      throw new ZapinError(
        ErrorCodes.DATABASE_ERROR,
        'Failed to check bot quota',
        500
      );
    }
  }

  /**
   * Validate bot configuration based on type
   */
  static validateBotConfig(type: BotType, config: any): void {
    if (type === BotType.TYPEBOT) {
      this.validateTypebotConfig(config);
    } else if (type === BotType.OPENAI) {
      this.validateOpenAIConfig(config);
    }
  }

  /**
   * Validate Typebot configuration
   */
  private static validateTypebotConfig(config: any): void {
    const requiredFields = ['typebotUrl', 'typebotId', 'triggerType'];
    const missingFields = requiredFields.filter(field => !config[field]);

    if (missingFields.length > 0) {
      throw new ZapinError(
        ErrorCodes.VALIDATION_ERROR,
        `Missing required Typebot fields: ${missingFields.join(', ')}`,
        400
      );
    }

    // Validate URL format
    try {
      new URL(config.typebotUrl);
    } catch {
      throw new ZapinError(
        ErrorCodes.VALIDATION_ERROR,
        'Invalid Typebot URL format',
        400
      );
    }

    // Validate trigger type
    if (!['all', 'keyword'].includes(config.triggerType)) {
      throw new ZapinError(
        ErrorCodes.VALIDATION_ERROR,
        'Invalid trigger type. Must be "all" or "keyword"',
        400
      );
    }

    // If trigger type is keyword, validate trigger value
    if (config.triggerType === 'keyword' && !config.triggerValue?.trim()) {
      throw new ZapinError(
        ErrorCodes.VALIDATION_ERROR,
        'Trigger value is required when trigger type is "keyword"',
        400
      );
    }

    // Validate numeric settings
    if (config.expire !== undefined && (config.expire < 1 || config.expire > 1440)) {
      throw new ZapinError(
        ErrorCodes.VALIDATION_ERROR,
        'Expire time must be between 1 and 1440 minutes',
        400
      );
    }

    if (config.delayMessage !== undefined && (config.delayMessage < 0 || config.delayMessage > 10000)) {
      throw new ZapinError(
        ErrorCodes.VALIDATION_ERROR,
        'Delay message must be between 0 and 10000 milliseconds',
        400
      );
    }

    if (config.debounceTime !== undefined && (config.debounceTime < 0 || config.debounceTime > 5000)) {
      throw new ZapinError(
        ErrorCodes.VALIDATION_ERROR,
        'Debounce time must be between 0 and 5000 milliseconds',
        400
      );
    }
  }

  /**
   * Validate OpenAI configuration
   */
  private static validateOpenAIConfig(config: any): void {
    const requiredFields = ['model', 'systemPrompt', 'triggerType'];
    const missingFields = requiredFields.filter(field => !config[field]);

    if (missingFields.length > 0) {
      throw new ZapinError(
        ErrorCodes.VALIDATION_ERROR,
        `Missing required OpenAI fields: ${missingFields.join(', ')}`,
        400
      );
    }

    // Validate system prompt length
    if (config.systemPrompt.length > 4000) {
      throw new ZapinError(
        ErrorCodes.VALIDATION_ERROR,
        'System prompt must be 4000 characters or less',
        400
      );
    }

    // Validate trigger type
    if (!['all', 'keyword'].includes(config.triggerType)) {
      throw new ZapinError(
        ErrorCodes.VALIDATION_ERROR,
        'Invalid trigger type. Must be "all" or "keyword"',
        400
      );
    }

    // If trigger type is keyword, validate trigger value
    if (config.triggerType === 'keyword' && !config.triggerValue?.trim()) {
      throw new ZapinError(
        ErrorCodes.VALIDATION_ERROR,
        'Trigger value is required when trigger type is "keyword"',
        400
      );
    }

    // Validate OpenAI-specific settings
    if (config.maxTokens !== undefined && (config.maxTokens < 1 || config.maxTokens > 4096)) {
      throw new ZapinError(
        ErrorCodes.VALIDATION_ERROR,
        'Max tokens must be between 1 and 4096',
        400
      );
    }

    if (config.temperature !== undefined && (config.temperature < 0 || config.temperature > 2)) {
      throw new ZapinError(
        ErrorCodes.VALIDATION_ERROR,
        'Temperature must be between 0 and 2',
        400
      );
    }

    if (config.topP !== undefined && (config.topP < 0 || config.topP > 1)) {
      throw new ZapinError(
        ErrorCodes.VALIDATION_ERROR,
        'Top P must be between 0 and 1',
        400
      );
    }

    if (config.presencePenalty !== undefined && (config.presencePenalty < -2 || config.presencePenalty > 2)) {
      throw new ZapinError(
        ErrorCodes.VALIDATION_ERROR,
        'Presence penalty must be between -2 and 2',
        400
      );
    }

    if (config.frequencyPenalty !== undefined && (config.frequencyPenalty < -2 || config.frequencyPenalty > 2)) {
      throw new ZapinError(
        ErrorCodes.VALIDATION_ERROR,
        'Frequency penalty must be between -2 and 2',
        400
      );
    }

    // Validate bot type
    if (config.botType && !['assistant', 'chatCompletion'].includes(config.botType)) {
      throw new ZapinError(
        ErrorCodes.VALIDATION_ERROR,
        'Invalid bot type. Must be "assistant" or "chatCompletion"',
        400
      );
    }

    // Validate function URL if provided
    if (config.functionUrl) {
      try {
        new URL(config.functionUrl);
      } catch {
        throw new ZapinError(
          ErrorCodes.VALIDATION_ERROR,
          'Invalid function URL format',
          400
        );
      }
    }
  }

  /**
   * Sanitize bot configuration to remove sensitive data
   */
  static sanitizeBotConfig(config: any): any {
    const sanitized = { ...config };
    
    // Remove sensitive fields that shouldn't be exposed in API responses
    const sensitiveFields = ['openaiCredsId', 'apiKey', 'secretKey'];
    sensitiveFields.forEach(field => {
      if (sanitized[field]) {
        delete sanitized[field];
      }
    });

    return sanitized;
  }

  /**
   * Validate bot name uniqueness within tenant
   */
  static async validateBotNameUniqueness(
    tenantId: string,
    name: string,
    excludeBotId?: string
  ): Promise<void> {
    try {
      const existingBot = await prisma.bot.findFirst({
        where: {
          tenantId,
          name: name.trim(),
          ...(excludeBotId && { id: { not: excludeBotId } }),
        },
      });

      if (existingBot) {
        throw new ZapinError(
          ErrorCodes.VALIDATION_ERROR,
          'Bot name already exists in your account',
          400
        );
      }
    } catch (error) {
      if (error instanceof ZapinError) {
        throw error;
      }
      throw new ZapinError(
        ErrorCodes.DATABASE_ERROR,
        'Failed to validate bot name uniqueness',
        500
      );
    }
  }

  /**
   * Rate limiting for bot operations
   */
  static async checkBotOperationRateLimit(
    tenantId: string,
    operation: string,
    windowMs: number = 60000, // 1 minute
    maxOperations: number = 10
  ): Promise<void> {
    // This would integrate with Redis for rate limiting
    // For now, we'll implement a basic check
    const key = `bot_rate_limit:${tenantId}:${operation}`;
    
    // In a real implementation, you would use Redis to track rate limits
    // For now, we'll just log the operation
    console.log(`Rate limit check for ${key}: ${maxOperations} operations per ${windowMs}ms`);
  }

  /**
   * Validate instance compatibility with bot type
   */
  static async validateInstanceCompatibility(
    instanceId: string,
    tenantId: string,
    botType: BotType
  ): Promise<void> {
    try {
      const instance = await prisma.instance.findFirst({
        where: {
          id: instanceId,
          tenantId,
          isActive: true,
        },
        include: {
          bots: {
            where: { isActive: true },
            select: { type: true },
          },
        },
      });

      if (!instance) {
        throw new ZapinError(
          ErrorCodes.INSTANCE_NOT_FOUND,
          'Instance not found or inactive',
          404
        );
      }

      // Check if instance status allows bot creation
      if (instance.status !== 'CONNECTED') {
        throw new ZapinError(
          ErrorCodes.INSTANCE_NOT_CONNECTED,
          'Instance must be connected to create bots',
          400
        );
      }

      // Check for conflicting bot types (if business rules require it)
      const conflictingBots = instance.bots.filter(bot => 
        bot.type !== botType && botType === BotType.TYPEBOT
      );

      if (conflictingBots.length > 0 && botType === BotType.TYPEBOT) {
        // Example business rule: Only one Typebot per instance
        throw new ZapinError(
          ErrorCodes.VALIDATION_ERROR,
          'Only one Typebot is allowed per instance',
          400
        );
      }
    } catch (error) {
      if (error instanceof ZapinError) {
        throw error;
      }
      throw new ZapinError(
        ErrorCodes.DATABASE_ERROR,
        'Failed to validate instance compatibility',
        500
      );
    }
  }
}

/**
 * Middleware to validate bot access
 */
export const validateBotAccess = (operation: 'read' | 'write' | 'delete' = 'read') => {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const botId = (request.params as any).id;
      const context: BotSecurityContext = {
        tenantId: (request as any).tenant.id,
        userId: (request as any).user?.id,
        apiKeyId: (request as any).apiKey?.id,
        userRole: (request as any).user?.role,
      };

      await BotSecurityService.validateBotAccess(botId, context, operation);
    } catch (error) {
      if (error instanceof ZapinError) {
        return reply.code(error.statusCode).send({
          success: false,
          error: {
            code: error.code,
            message: error.message,
            details: error.details,
          },
        });
      }

      return reply.code(500).send({
        success: false,
        error: {
          code: ErrorCodes.INTERNAL_ERROR,
          message: 'Internal server error',
        },
      });
    }
  };
};

/**
 * Middleware to check bot quota
 */
export const checkBotQuota = async (request: FastifyRequest, reply: FastifyReply) => {
  try {
    const tenantId = (request as any).tenant.id;
    await BotSecurityService.checkBotQuota(tenantId);
  } catch (error) {
    if (error instanceof ZapinError) {
      return reply.code(error.statusCode).send({
        success: false,
        error: {
          code: error.code,
          message: error.message,
          details: error.details,
        },
      });
    }

    return reply.code(500).send({
      success: false,
      error: {
        code: ErrorCodes.INTERNAL_ERROR,
        message: 'Internal server error',
      },
    });
  }
};

/**
 * Middleware for bot operation rate limiting
 */
export const rateLimitBotOperations = (operation: string, maxOperations: number = 10) => {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const tenantId = (request as any).tenant.id;
      await BotSecurityService.checkBotOperationRateLimit(tenantId, operation, 60000, maxOperations);
    } catch (error) {
      return reply.code(429).send({
        success: false,
        error: {
          code: ErrorCodes.RATE_LIMIT_EXCEEDED,
          message: 'Rate limit exceeded for bot operations',
        },
      });
    }
  };
};