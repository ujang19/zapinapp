import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { botService } from '../../../services/botService';
import { ZapinError, ErrorCodes } from '../../../types';
import { z } from 'zod';

// Request validation schemas
const CreateTypebotSchema = z.object({
  name: z.string().min(1).max(100),
  instanceId: z.string().cuid(),
  typebotUrl: z.string().url(),
  typebotId: z.string().min(1),
  triggerType: z.enum(['all', 'keyword']),
  triggerValue: z.string().optional(),
  settings: z.object({
    enabled: z.boolean().default(true),
    expire: z.number().min(1).max(1440).optional(),
    keywordFinish: z.string().optional(),
    delayMessage: z.number().min(0).max(10000).optional(),
    unknownMessage: z.string().optional(),
    listeningFromMe: z.boolean().default(false),
    stopBotFromMe: z.boolean().default(true),
    keepOpen: z.boolean().default(false),
    debounceTime: z.number().min(0).max(5000).optional(),
  }),
});

const CreateOpenAIBotSchema = z.object({
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

const UpdateBotSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  config: z.record(z.any()).optional(),
  isActive: z.boolean().optional(),
});

const TestBotSchema = z.object({
  message: z.string().min(1).max(1000),
  phoneNumber: z.string().regex(/^\d{10,15}$/, 'Invalid phone number format'),
});

const GetBotsQuerySchema = z.object({
  instanceId: z.string().cuid().optional(),
  type: z.enum(['TYPEBOT', 'OPENAI']).optional(),
  isActive: z.boolean().optional(),
  limit: z.number().min(1).max(100).default(50),
  offset: z.number().min(0).default(0),
});

const GetAnalyticsQuerySchema = z.object({
  period: z.enum(['24h', '7d', '30d']).default('7d'),
});

const GetSessionsQuerySchema = z.object({
  limit: z.number().min(1).max(100).default(50),
  offset: z.number().min(0).default(0),
  status: z.enum(['ACTIVE', 'ENDED', 'EXPIRED']).optional(),
});

export default async function botRoutes(fastify: FastifyInstance) {
  
  // GET /bots - List all bots for tenant
  fastify.get('/', {
    schema: {
      description: 'Get all bots for the authenticated tenant',
      tags: ['bots'],
      security: [{ bearerAuth: [] }],
      querystring: {
        type: 'object',
        properties: {
          instanceId: { type: 'string', description: 'Filter by instance ID' },
          type: { type: 'string', enum: ['TYPEBOT', 'OPENAI'], description: 'Filter by bot type' },
          isActive: { type: 'boolean', description: 'Filter by active status' },
          limit: { type: 'number', minimum: 1, maximum: 100, default: 50 },
          offset: { type: 'number', minimum: 0, default: 0 },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: {
              type: 'object',
              properties: {
                bots: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      id: { type: 'string' },
                      name: { type: 'string' },
                      type: { type: 'string', enum: ['TYPEBOT', 'OPENAI'] },
                      isActive: { type: 'boolean' },
                      createdAt: { type: 'string', format: 'date-time' },
                      updatedAt: { type: 'string', format: 'date-time' },
                      instance: {
                        type: 'object',
                        properties: {
                          id: { type: 'string' },
                          name: { type: 'string' },
                          status: { type: 'string' },
                          phoneNumber: { type: 'string', nullable: true },
                        },
                      },
                      stats: {
                        type: 'object',
                        properties: {
                          totalSessions: { type: 'number' },
                          activeSessions: { type: 'number' },
                          totalMessages: { type: 'number' },
                          avgResponseTime: { type: 'number' },
                          successRate: { type: 'number' },
                          lastActivity: { type: 'string', format: 'date-time', nullable: true },
                        },
                      },
                    },
                  },
                },
                total: { type: 'number' },
                limit: { type: 'number' },
                offset: { type: 'number' },
              },
            },
          },
        },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const query = GetBotsQuerySchema.parse(request.query);
      const tenantId = (request as any).tenant.id;

      let bots;
      if (query.instanceId) {
        bots = await botService.getBotsByInstance(tenantId, query.instanceId);
      } else {
        bots = await botService.getBotsByTenant(tenantId);
      }

      // Apply filters
      let filteredBots = bots;
      if (query.type) {
        filteredBots = filteredBots.filter(bot => bot.type === query.type);
      }
      if (query.isActive !== undefined) {
        filteredBots = filteredBots.filter(bot => bot.isActive === query.isActive);
      }

      // Apply pagination
      const total = filteredBots.length;
      const paginatedBots = filteredBots.slice(query.offset, query.offset + query.limit);

      return reply.send({
        success: true,
        data: {
          bots: paginatedBots,
          total,
          limit: query.limit,
          offset: query.offset,
        },
      });
    } catch (error) {
      return handleRouteError(error, reply);
    }
  });

  // GET /bots/:id - Get bot by ID
  fastify.get('/:id', {
    schema: {
      description: 'Get bot details by ID',
      tags: ['bots'],
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string', description: 'Bot ID' },
        },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const params = request.params as { id: string };
      const tenantId = (request as any).tenant.id;

      const bot = await botService.getBotById(tenantId, params.id);
      if (!bot) {
        return reply.code(404).send({
          success: false,
          error: {
            code: ErrorCodes.INSTANCE_NOT_FOUND,
            message: 'Bot not found',
          },
        });
      }

      return reply.send({
        success: true,
        data: { bot },
      });
    } catch (error) {
      return handleRouteError(error, reply);
    }
  });

  // POST /bots/typebot - Create Typebot
  fastify.post('/typebot', {
    schema: {
      description: 'Create a new Typebot',
      tags: ['bots'],
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        required: ['name', 'instanceId', 'typebotUrl', 'typebotId', 'triggerType', 'settings'],
        properties: {
          name: { type: 'string', minLength: 1, maxLength: 100 },
          instanceId: { type: 'string' },
          typebotUrl: { type: 'string', format: 'uri' },
          typebotId: { type: 'string', minLength: 1 },
          triggerType: { type: 'string', enum: ['all', 'keyword'] },
          triggerValue: { type: 'string' },
          settings: {
            type: 'object',
            properties: {
              enabled: { type: 'boolean', default: true },
              expire: { type: 'number', minimum: 1, maximum: 1440 },
              keywordFinish: { type: 'string' },
              delayMessage: { type: 'number', minimum: 0, maximum: 10000 },
              unknownMessage: { type: 'string' },
              listeningFromMe: { type: 'boolean', default: false },
              stopBotFromMe: { type: 'boolean', default: true },
              keepOpen: { type: 'boolean', default: false },
              debounceTime: { type: 'number', minimum: 0, maximum: 5000 },
            },
          },
        },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const validatedData = CreateTypebotSchema.parse(request.body);
      const tenantId = (request as any).tenant.id;

      const bot = await botService.createTypebot(tenantId, validatedData);

      return reply.code(201).send({
        success: true,
        data: { bot },
      });
    } catch (error) {
      return handleRouteError(error, reply);
    }
  });

  // POST /bots/openai - Create OpenAI Bot
  fastify.post('/openai', {
    schema: {
      description: 'Create a new OpenAI bot',
      tags: ['bots'],
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        required: ['name', 'instanceId', 'model', 'systemPrompt', 'triggerType', 'settings'],
        properties: {
          name: { type: 'string', minLength: 1, maxLength: 100 },
          instanceId: { type: 'string' },
          model: { type: 'string', minLength: 1 },
          systemPrompt: { type: 'string', minLength: 1, maxLength: 4000 },
          triggerType: { type: 'string', enum: ['all', 'keyword'] },
          triggerValue: { type: 'string' },
          settings: {
            type: 'object',
            properties: {
              enabled: { type: 'boolean', default: true },
              botType: { type: 'string', enum: ['assistant', 'chatCompletion'], default: 'chatCompletion' },
              assistantId: { type: 'string' },
              functionUrl: { type: 'string', format: 'uri' },
              maxTokens: { type: 'number', minimum: 1, maximum: 4096 },
              temperature: { type: 'number', minimum: 0, maximum: 2 },
              topP: { type: 'number', minimum: 0, maximum: 1 },
              presencePenalty: { type: 'number', minimum: -2, maximum: 2 },
              frequencyPenalty: { type: 'number', minimum: -2, maximum: 2 },
              expire: { type: 'number', minimum: 1, maximum: 1440 },
              keywordFinish: { type: 'string' },
              delayMessage: { type: 'number', minimum: 0, maximum: 10000 },
              unknownMessage: { type: 'string' },
              listeningFromMe: { type: 'boolean', default: false },
              stopBotFromMe: { type: 'boolean', default: true },
              keepOpen: { type: 'boolean', default: false },
              debounceTime: { type: 'number', minimum: 0, maximum: 5000 },
              openaiCredsId: { type: 'string' },
            },
          },
        },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const validatedData = CreateOpenAIBotSchema.parse(request.body);
      const tenantId = (request as any).tenant.id;

      const bot = await botService.createOpenAIBot(tenantId, validatedData);

      return reply.code(201).send({
        success: true,
        data: { bot },
      });
    } catch (error) {
      return handleRouteError(error, reply);
    }
  });

  // PUT /bots/:id - Update bot
  fastify.put('/:id', {
    schema: {
      description: 'Update bot configuration',
      tags: ['bots'],
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string', description: 'Bot ID' },
        },
      },
      body: {
        type: 'object',
        properties: {
          name: { type: 'string', minLength: 1, maxLength: 100 },
          config: { type: 'object' },
          isActive: { type: 'boolean' },
        },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const params = request.params as { id: string };
      const validatedData = UpdateBotSchema.parse(request.body);
      const tenantId = (request as any).tenant.id;

      const bot = await botService.updateBot(tenantId, params.id, validatedData);

      return reply.send({
        success: true,
        data: { bot },
      });
    } catch (error) {
      return handleRouteError(error, reply);
    }
  });

  // DELETE /bots/:id - Delete bot
  fastify.delete('/:id', {
    schema: {
      description: 'Delete bot',
      tags: ['bots'],
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string', description: 'Bot ID' },
        },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const params = request.params as { id: string };
      const tenantId = (request as any).tenant.id;

      await botService.deleteBot(tenantId, params.id);

      return reply.send({
        success: true,
        data: { message: 'Bot deleted successfully' },
      });
    } catch (error) {
      return handleRouteError(error, reply);
    }
  });

  // POST /bots/:id/test - Test bot
  fastify.post('/:id/test', {
    schema: {
      description: 'Test bot with a message',
      tags: ['bots'],
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string', description: 'Bot ID' },
        },
      },
      body: {
        type: 'object',
        required: ['message', 'phoneNumber'],
        properties: {
          message: { type: 'string', minLength: 1, maxLength: 1000 },
          phoneNumber: { type: 'string', pattern: '^\\d{10,15}$' },
        },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const params = request.params as { id: string };
      const validatedData = TestBotSchema.parse(request.body);
      const tenantId = (request as any).tenant.id;

      const result = await botService.testBot(
        tenantId,
        params.id,
        validatedData.message,
        validatedData.phoneNumber
      );

      return reply.send({
        success: true,
        data: result,
      });
    } catch (error) {
      return handleRouteError(error, reply);
    }
  });

  // GET /bots/:id/analytics - Get bot analytics
  fastify.get('/:id/analytics', {
    schema: {
      description: 'Get bot analytics and performance metrics',
      tags: ['bots'],
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string', description: 'Bot ID' },
        },
      },
      querystring: {
        type: 'object',
        properties: {
          period: { type: 'string', enum: ['24h', '7d', '30d'], default: '7d' },
        },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const params = request.params as { id: string };
      const query = GetAnalyticsQuerySchema.parse(request.query);
      const tenantId = (request as any).tenant.id;

      const analytics = await botService.getBotAnalytics(tenantId, params.id, query.period);

      return reply.send({
        success: true,
        data: { analytics },
      });
    } catch (error) {
      return handleRouteError(error, reply);
    }
  });

  // GET /bots/:id/sessions - Get bot sessions
  fastify.get('/:id/sessions', {
    schema: {
      description: 'Get bot sessions with messages',
      tags: ['bots'],
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string', description: 'Bot ID' },
        },
      },
      querystring: {
        type: 'object',
        properties: {
          limit: { type: 'number', minimum: 1, maximum: 100, default: 50 },
          offset: { type: 'number', minimum: 0, default: 0 },
          status: { type: 'string', enum: ['ACTIVE', 'ENDED', 'EXPIRED'] },
        },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const params = request.params as { id: string };
      const query = GetSessionsQuerySchema.parse(request.query);
      const tenantId = (request as any).tenant.id;

      const sessions = await botService.getBotSessions(
        tenantId,
        params.id,
        query.limit,
        query.offset
      );

      // Apply status filter if provided
      let filteredSessions = sessions;
      if (query.status) {
        filteredSessions = sessions.filter(session => session.status === query.status);
      }

      return reply.send({
        success: true,
        data: {
          sessions: filteredSessions,
          total: filteredSessions.length,
          limit: query.limit,
          offset: query.offset,
        },
      });
    } catch (error) {
      return handleRouteError(error, reply);
    }
  });

  // GET /bots/sessions/:sessionId - Get specific bot session
  fastify.get('/sessions/:sessionId', {
    schema: {
      description: 'Get specific bot session with messages',
      tags: ['bots'],
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        required: ['sessionId'],
        properties: {
          sessionId: { type: 'string', description: 'Session ID' },
        },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const params = request.params as { sessionId: string };
      const tenantId = (request as any).tenant.id;

      const session = await botService.getBotSessionById(tenantId, params.sessionId);
      if (!session) {
        return reply.code(404).send({
          success: false,
          error: {
            code: ErrorCodes.INSTANCE_NOT_FOUND,
            message: 'Bot session not found',
          },
        });
      }

      return reply.send({
        success: true,
        data: { session },
      });
    } catch (error) {
      return handleRouteError(error, reply);
    }
  });

  // POST /bots/sessions/:sessionId/end - End bot session
  fastify.post('/sessions/:sessionId/end', {
    schema: {
      description: 'End an active bot session',
      tags: ['bots'],
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        required: ['sessionId'],
        properties: {
          sessionId: { type: 'string', description: 'Session ID' },
        },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const params = request.params as { sessionId: string };
      const tenantId = (request as any).tenant.id;

      await botService.endBotSession(tenantId, params.sessionId);

      return reply.send({
        success: true,
        data: { message: 'Bot session ended successfully' },
      });
    } catch (error) {
      return handleRouteError(error, reply);
    }
  });

  // GET /bots/available-models - Get available OpenAI models
  fastify.get('/available-models', {
    schema: {
      description: 'Get list of available OpenAI models',
      tags: ['bots'],
      security: [{ bearerAuth: [] }],
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: {
              type: 'object',
              properties: {
                models: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      id: { type: 'string' },
                      name: { type: 'string' },
                      description: { type: 'string' },
                      maxTokens: { type: 'number' },
                      category: { type: 'string' },
                      pricing: {
                        type: 'object',
                        properties: {
                          input: { type: 'number' },
                          output: { type: 'number' },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const models = [
        {
          id: 'gpt-4',
          name: 'GPT-4',
          description: 'Most capable GPT-4 model, great for complex tasks',
          maxTokens: 8192,
          category: 'chat',
          pricing: { input: 0.03, output: 0.06 },
        },
        {
          id: 'gpt-4-turbo',
          name: 'GPT-4 Turbo',
          description: 'Latest GPT-4 model with improved performance and larger context',
          maxTokens: 128000,
          category: 'chat',
          pricing: { input: 0.01, output: 0.03 },
        },
        {
          id: 'gpt-4o',
          name: 'GPT-4o',
          description: 'High-intelligence flagship model for complex, multi-step tasks',
          maxTokens: 128000,
          category: 'chat',
          pricing: { input: 0.005, output: 0.015 },
        },
        {
          id: 'gpt-4o-mini',
          name: 'GPT-4o Mini',
          description: 'Affordable and intelligent small model for fast, lightweight tasks',
          maxTokens: 128000,
          category: 'chat',
          pricing: { input: 0.00015, output: 0.0006 },
        },
        {
          id: 'gpt-3.5-turbo',
          name: 'GPT-3.5 Turbo',
          description: 'Fast and efficient model for most conversational tasks',
          maxTokens: 4096,
          category: 'chat',
          pricing: { input: 0.0015, output: 0.002 },
        },
        {
          id: 'gpt-3.5-turbo-16k',
          name: 'GPT-3.5 Turbo 16K',
          description: 'GPT-3.5 with extended context length',
          maxTokens: 16384,
          category: 'chat',
          pricing: { input: 0.003, output: 0.004 },
        },
      ];

      return reply.send({
        success: true,
        data: { models },
      });
    } catch (error) {
      return handleRouteError(error, reply);
    }
  });

  // GET /bots/webhook-events - Get available webhook events
  fastify.get('/webhook-events', {
    schema: {
      description: 'Get list of available webhook events for bot triggers',
      tags: ['bots'],
      security: [{ bearerAuth: [] }],
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: {
              type: 'object',
              properties: {
                events: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      name: { type: 'string' },
                      description: { type: 'string' },
                      category: { type: 'string' },
                      supported: { type: 'array', items: { type: 'string' } },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const events = [
        {
          name: 'messages.upsert',
          description: 'New message received or sent',
          category: 'messages',
          supported: ['TYPEBOT', 'OPENAI'],
        },
        {
          name: 'messages.update',
          description: 'Message status updated (delivered, read, etc.)',
          category: 'messages',
          supported: ['TYPEBOT', 'OPENAI'],
        },
        {
          name: 'connection.update',
          description: 'Connection status changed',
          category: 'connection',
          supported: ['TYPEBOT', 'OPENAI'],
        },
        {
          name: 'presence.update',
          description: 'Contact presence updated (online, offline, typing)',
          category: 'presence',
          supported: ['TYPEBOT', 'OPENAI'],
        },
        {
          name: 'chats.upsert',
          description: 'Chat created or updated',
          category: 'chats',
          supported: ['TYPEBOT', 'OPENAI'],
        },
        {
          name: 'groups.upsert',
          description: 'Group created or updated',
          category: 'groups',
          supported: ['TYPEBOT', 'OPENAI'],
        },
        {
          name: 'contacts.upsert',
          description: 'Contact added or updated',
          category: 'contacts',
          supported: ['TYPEBOT', 'OPENAI'],
        },
      ];

      return reply.send({
        success: true,
        data: { events },
      });
    } catch (error) {
      return handleRouteError(error, reply);
    }
  });
}

/**
 * Handle route errors consistently
 */
function handleRouteError(error: any, reply: FastifyReply) {
  if (error instanceof z.ZodError) {
    return reply.code(400).send({
      success: false,
      error: {
        code: ErrorCodes.VALIDATION_ERROR,
        message: 'Validation failed',
        details: error.errors,
      },
    });
  }

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

  console.error('Unhandled bot route error:', error);
  return reply.code(500).send({
    success: false,
    error: {
      code: ErrorCodes.INTERNAL_ERROR,
      message: 'Internal server error',
    },
  });
}