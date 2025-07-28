import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { webhookService, WebhookPayload, WebhookEventType } from '../../services/webhookService';
import { ZapinError, ErrorCodes } from '../../types';
import { authMiddleware } from '../middleware/auth';
import { webhookSecurityMiddleware, verifyWebhookSignature, sanitizeWebhookPayload } from '../middleware/webhookSecurity';
import { prisma } from '../../lib/prisma';
import { redis } from '../../lib/redis';
import crypto from 'crypto';
import { z } from 'zod';

// Webhook payload validation schema
const webhookPayloadSchema = z.object({
  event: z.nativeEnum(WebhookEventType),
  instance: z.string().min(1),
  data: z.any(),
  destination: z.string().optional(),
  date_time: z.string(),
  sender: z.string().optional(),
  server_url: z.string().optional(),
  apikey: z.string().optional()
});

// Webhook configuration schema
const webhookConfigSchema = z.object({
  url: z.string().url(),
  events: z.array(z.nativeEnum(WebhookEventType)),
  secret: z.string().optional(),
  isActive: z.boolean().default(true),
  retryAttempts: z.number().min(0).max(10).default(3),
  retryDelay: z.number().min(1000).max(300000).default(5000),
  timeout: z.number().min(1000).max(60000).default(30000),
  headers: z.record(z.string()).optional()
});

// Rate limiting configuration
const WEBHOOK_RATE_LIMIT = {
  max: 1000, // requests per window
  timeWindow: 60000, // 1 minute
  skipSuccessfulRequests: false,
  skipOnError: false
};

export default async function webhookRoutes(fastify: FastifyInstance) {
  // Apply webhook security middleware to all webhook routes
  fastify.addHook('preHandler', webhookSecurityMiddleware);

  // Rate limiting for webhook endpoints
  await fastify.register(import('@fastify/rate-limit'), {
    ...WEBHOOK_RATE_LIMIT,
    keyGenerator: (request) => {
      // Rate limit by instance or IP
      const payload = request.body as any;
      return payload?.instance || request.ip || 'anonymous';
    }
  });

  /**
   * Main webhook endpoint for Evolution API callbacks
   * This is the endpoint that Evolution API will call
   */
  fastify.post('/webhook/evolution', {
    schema: {
      description: 'Receive webhook events from Evolution API',
      tags: ['webhooks'],
      body: {
        type: 'object',
        properties: {
          event: { type: 'string' },
          instance: { type: 'string' },
          data: { type: 'object' },
          destination: { type: 'string' },
          date_time: { type: 'string' },
          sender: { type: 'string' },
          server_url: { type: 'string' },
          apikey: { type: 'string' }
        },
        required: ['event', 'instance', 'data', 'date_time']
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            eventId: { type: 'string' },
            message: { type: 'string' }
          }
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const startTime = Date.now();
    
    try {
      // Validate webhook payload
      const validationResult = webhookPayloadSchema.safeParse(request.body);
      if (!validationResult.success) {
        throw new ZapinError(
          ErrorCodes.VALIDATION_ERROR,
          'Invalid webhook payload',
          400,
          validationResult.error.errors
        );
      }

      let payload = validationResult.data as WebhookPayload;

      // Verify webhook authenticity (optional signature verification)
      await verifyWebhookSignatureFromRequest(request, payload);

      // Sanitize payload to prevent XSS and injection attacks
      payload = sanitizeWebhookPayload(payload);

      // Process the webhook event
      const processedEvent = await webhookService.processWebhookEvent(payload);

      const processingTime = Date.now() - startTime;

      // Log successful processing
      request.log.info({
        eventId: processedEvent.id,
        eventType: payload.event,
        instance: payload.instance,
        processingTime
      }, 'Webhook event processed successfully');

      return reply.send({
        success: true,
        eventId: processedEvent.id,
        message: 'Webhook processed successfully'
      });

    } catch (error) {
      const processingTime = Date.now() - startTime;
      
      // Log error
      request.log.error({
        error: error instanceof Error ? error.message : 'Unknown error',
        body: request.body,
        processingTime
      }, 'Webhook processing failed');

      if (error instanceof ZapinError) {
        return reply.code(error.statusCode).send({
          success: false,
          error: {
            code: error.code,
            message: error.message,
            details: error.details
          }
        });
      }

      return reply.code(500).send({
        success: false,
        error: {
          code: ErrorCodes.INTERNAL_ERROR,
          message: 'Internal server error'
        }
      });
    }
  });

  /**
   * Webhook configuration management endpoints
   * These require authentication
   */
  
  // Get webhook configurations for tenant
  fastify.get('/webhook/configs', {
    preHandler: [authMiddleware],
    schema: {
      description: 'Get webhook configurations for tenant',
      tags: ['webhooks'],
      security: [{ bearerAuth: [] }],
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  url: { type: 'string' },
                  events: { type: 'array', items: { type: 'string' } },
                  isActive: { type: 'boolean' },
                  retryAttempts: { type: 'number' },
                  retryDelay: { type: 'number' },
                  timeout: { type: 'number' },
                  createdAt: { type: 'string' },
                  updatedAt: { type: 'string' }
                }
              }
            }
          }
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const tenantId = (request as any).tenant.id;
      
      const configs = await getWebhookConfigs(tenantId);
      
      return reply.send({
        success: true,
        data: configs
      });
    } catch (error) {
      throw new ZapinError(
        ErrorCodes.INTERNAL_ERROR,
        'Failed to fetch webhook configurations',
        500
      );
    }
  });

  // Create webhook configuration
  fastify.post('/webhook/configs', {
    preHandler: [authMiddleware],
    schema: {
      description: 'Create webhook configuration',
      tags: ['webhooks'],
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        properties: {
          url: { type: 'string', format: 'uri' },
          events: { type: 'array', items: { type: 'string' } },
          secret: { type: 'string' },
          isActive: { type: 'boolean' },
          retryAttempts: { type: 'number', minimum: 0, maximum: 10 },
          retryDelay: { type: 'number', minimum: 1000, maximum: 300000 },
          timeout: { type: 'number', minimum: 1000, maximum: 60000 },
          headers: { type: 'object' }
        },
        required: ['url', 'events']
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const tenantId = (request as any).tenant.id;
      const validationResult = webhookConfigSchema.safeParse(request.body);
      
      if (!validationResult.success) {
        throw new ZapinError(
          ErrorCodes.VALIDATION_ERROR,
          'Invalid webhook configuration',
          400,
          validationResult.error.errors
        );
      }

      const config = await createWebhookConfig(tenantId, validationResult.data);
      
      return reply.code(201).send({
        success: true,
        data: config
      });
    } catch (error) {
      if (error instanceof ZapinError) {
        throw error;
      }
      throw new ZapinError(
        ErrorCodes.INTERNAL_ERROR,
        'Failed to create webhook configuration',
        500
      );
    }
  });

  // Update webhook configuration
  fastify.put('/webhook/configs/:configId', {
    preHandler: [authMiddleware],
    schema: {
      description: 'Update webhook configuration',
      tags: ['webhooks'],
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        properties: {
          configId: { type: 'string' }
        },
        required: ['configId']
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const tenantId = (request as any).tenant.id;
      const { configId } = request.params as { configId: string };
      
      const validationResult = webhookConfigSchema.partial().safeParse(request.body);
      if (!validationResult.success) {
        throw new ZapinError(
          ErrorCodes.VALIDATION_ERROR,
          'Invalid webhook configuration',
          400,
          validationResult.error.errors
        );
      }

      const config = await updateWebhookConfig(tenantId, configId, validationResult.data);
      
      return reply.send({
        success: true,
        data: config
      });
    } catch (error) {
      if (error instanceof ZapinError) {
        throw error;
      }
      throw new ZapinError(
        ErrorCodes.INTERNAL_ERROR,
        'Failed to update webhook configuration',
        500
      );
    }
  });

  // Delete webhook configuration
  fastify.delete('/webhook/configs/:configId', {
    preHandler: [authMiddleware],
    schema: {
      description: 'Delete webhook configuration',
      tags: ['webhooks'],
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        properties: {
          configId: { type: 'string' }
        },
        required: ['configId']
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const tenantId = (request as any).tenant.id;
      const { configId } = request.params as { configId: string };
      
      await deleteWebhookConfig(tenantId, configId);
      
      return reply.send({
        success: true,
        message: 'Webhook configuration deleted'
      });
    } catch (error) {
      if (error instanceof ZapinError) {
        throw error;
      }
      throw new ZapinError(
        ErrorCodes.INTERNAL_ERROR,
        'Failed to delete webhook configuration',
        500
      );
    }
  });

  // Test webhook configuration
  fastify.post('/webhook/configs/:configId/test', {
    preHandler: [authMiddleware],
    schema: {
      description: 'Test webhook configuration',
      tags: ['webhooks'],
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        properties: {
          configId: { type: 'string' }
        },
        required: ['configId']
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const tenantId = (request as any).tenant.id;
      const { configId } = request.params as { configId: string };
      
      const result = await testWebhookConfig(tenantId, configId);
      
      return reply.send({
        success: true,
        data: result
      });
    } catch (error) {
      if (error instanceof ZapinError) {
        throw error;
      }
      throw new ZapinError(
        ErrorCodes.INTERNAL_ERROR,
        'Failed to test webhook configuration',
        500
      );
    }
  });

  // Get webhook statistics
  fastify.get('/webhook/stats', {
    preHandler: [authMiddleware],
    schema: {
      description: 'Get webhook processing statistics',
      tags: ['webhooks'],
      security: [{ bearerAuth: [] }],
      querystring: {
        type: 'object',
        properties: {
          period: { type: 'string', enum: ['24h', '7d', '30d'] }
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const tenantId = (request as any).tenant.id;
      const { period = '24h' } = request.query as { period?: '24h' | '7d' | '30d' };
      
      const stats = await webhookService.getWebhookStats(tenantId, period);
      
      return reply.send({
        success: true,
        data: stats
      });
    } catch (error) {
      throw new ZapinError(
        ErrorCodes.INTERNAL_ERROR,
        'Failed to fetch webhook statistics',
        500
      );
    }
  });

  // Get recent webhook events
  fastify.get('/webhook/events', {
    preHandler: [authMiddleware],
    schema: {
      description: 'Get recent webhook events',
      tags: ['webhooks'],
      security: [{ bearerAuth: [] }],
      querystring: {
        type: 'object',
        properties: {
          limit: { type: 'number', minimum: 1, maximum: 100 }
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const tenantId = (request as any).tenant.id;
      const { limit = 50 } = request.query as { limit?: number };
      
      const events = await webhookService.getRecentEvents(tenantId, limit);
      
      return reply.send({
        success: true,
        data: events
      });
    } catch (error) {
      throw new ZapinError(
        ErrorCodes.INTERNAL_ERROR,
        'Failed to fetch webhook events',
        500
      );
    }
  });
}

/**
 * Verify webhook signature for security
 */
async function verifyWebhookSignatureFromRequest(request: FastifyRequest, payload: WebhookPayload): Promise<void> {
  const signature = request.headers['x-evolution-signature'] as string;
  const secret = process.env.EVOLUTION_WEBHOOK_SECRET;
  
  // Skip verification if no secret is configured
  if (!secret || !signature) {
    return;
  }

  const payloadString = JSON.stringify(payload);
  const isValid = verifyWebhookSignature(payloadString, signature, secret);

  if (!isValid) {
    throw new ZapinError(
      ErrorCodes.UNAUTHORIZED,
      'Invalid webhook signature',
      401
    );
  }
}

/**
 * Get webhook configurations for tenant
 */
async function getWebhookConfigs(tenantId: string): Promise<any[]> {
  // For now, we'll store webhook configs in Redis
  // In a production system, you might want to use a dedicated table
  const configsKey = `webhook:configs:${tenantId}`;
  const configIds = await redis.smembers(configsKey);
  
  const configs: any[] = [];
  for (const configId of configIds) {
    const configKey = `webhook:config:${configId}`;
    const configData = await redis.hgetall(configKey);
    
    if (configData.id) {
      configs.push({
        id: configData.id,
        url: configData.url,
        events: JSON.parse(configData.events || '[]'),
        isActive: configData.isActive === 'true',
        retryAttempts: parseInt(configData.retryAttempts || '3'),
        retryDelay: parseInt(configData.retryDelay || '5000'),
        timeout: parseInt(configData.timeout || '30000'),
        createdAt: configData.createdAt,
        updatedAt: configData.updatedAt
      });
    }
  }
  
  return configs;
}

/**
 * Create webhook configuration
 */
async function createWebhookConfig(tenantId: string, config: any): Promise<any> {
  const configId = crypto.randomUUID();
  const now = new Date().toISOString();
  
  const configData = {
    id: configId,
    tenantId,
    url: config.url,
    events: JSON.stringify(config.events),
    secret: config.secret || '',
    isActive: config.isActive ? 'true' : 'false',
    retryAttempts: config.retryAttempts?.toString() || '3',
    retryDelay: config.retryDelay?.toString() || '5000',
    timeout: config.timeout?.toString() || '30000',
    headers: JSON.stringify(config.headers || {}),
    createdAt: now,
    updatedAt: now
  };
  
  // Store config
  const configKey = `webhook:config:${configId}`;
  await redis.hmset(configKey, configData);
  
  // Add to tenant's config set
  const configsKey = `webhook:configs:${tenantId}`;
  await redis.sadd(configsKey, configId);
  
  return {
    id: configId,
    url: config.url,
    events: config.events,
    isActive: config.isActive,
    retryAttempts: config.retryAttempts || 3,
    retryDelay: config.retryDelay || 5000,
    timeout: config.timeout || 30000,
    createdAt: now,
    updatedAt: now
  };
}

/**
 * Update webhook configuration
 */
async function updateWebhookConfig(tenantId: string, configId: string, updates: any): Promise<any> {
  const configKey = `webhook:config:${configId}`;
  const existingConfig = await redis.hgetall(configKey);
  
  if (!existingConfig.id || existingConfig.tenantId !== tenantId) {
    throw new ZapinError(
      ErrorCodes.VALIDATION_ERROR,
      'Webhook configuration not found',
      404
    );
  }
  
  const now = new Date().toISOString();
  const updatedConfig = { ...existingConfig };
  
  if (updates.url) updatedConfig.url = updates.url;
  if (updates.events) updatedConfig.events = JSON.stringify(updates.events);
  if (updates.secret !== undefined) updatedConfig.secret = updates.secret;
  if (updates.isActive !== undefined) updatedConfig.isActive = updates.isActive ? 'true' : 'false';
  if (updates.retryAttempts !== undefined) updatedConfig.retryAttempts = updates.retryAttempts.toString();
  if (updates.retryDelay !== undefined) updatedConfig.retryDelay = updates.retryDelay.toString();
  if (updates.timeout !== undefined) updatedConfig.timeout = updates.timeout.toString();
  if (updates.headers) updatedConfig.headers = JSON.stringify(updates.headers);
  updatedConfig.updatedAt = now;
  
  await redis.hmset(configKey, updatedConfig);
  
  return {
    id: configId,
    url: updatedConfig.url,
    events: JSON.parse(updatedConfig.events),
    isActive: updatedConfig.isActive === 'true',
    retryAttempts: parseInt(updatedConfig.retryAttempts),
    retryDelay: parseInt(updatedConfig.retryDelay),
    timeout: parseInt(updatedConfig.timeout),
    createdAt: updatedConfig.createdAt,
    updatedAt: updatedConfig.updatedAt
  };
}

/**
 * Delete webhook configuration
 */
async function deleteWebhookConfig(tenantId: string, configId: string): Promise<void> {
  const configKey = `webhook:config:${configId}`;
  const existingConfig = await redis.hgetall(configKey);
  
  if (!existingConfig.id || existingConfig.tenantId !== tenantId) {
    throw new ZapinError(
      ErrorCodes.VALIDATION_ERROR,
      'Webhook configuration not found',
      404
    );
  }
  
  // Remove from tenant's config set
  const configsKey = `webhook:configs:${tenantId}`;
  await redis.srem(configsKey, configId);
  
  // Delete config
  await redis.del(configKey);
}

/**
 * Test webhook configuration
 */
async function testWebhookConfig(tenantId: string, configId: string): Promise<any> {
  const configKey = `webhook:config:${configId}`;
  const configData = await redis.hgetall(configKey);
  
  if (!configData.id || configData.tenantId !== tenantId) {
    throw new ZapinError(
      ErrorCodes.VALIDATION_ERROR,
      'Webhook configuration not found',
      404
    );
  }
  
  // Create test payload
  const testPayload: WebhookPayload = {
    event: WebhookEventType.CONNECTION_UPDATE,
    instance: 'test-instance',
    data: { state: 'open', test: true },
    destination: 'test',
    date_time: new Date().toISOString(),
    sender: 'zapin-test',
    server_url: 'https://test.zapin.tech'
  };
  
  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'User-Agent': 'Zapin-Webhook-Test/1.0',
      ...JSON.parse(configData.headers || '{}')
    };
    
    // Add signature if secret is configured
    if (configData.secret) {
      const signature = crypto
        .createHmac('sha256', configData.secret)
        .update(JSON.stringify(testPayload))
        .digest('hex');
      headers['X-Zapin-Signature'] = signature;
    }
    
    const controller = new AbortController();
    const timeout = parseInt(configData.timeout || '30000');
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    
    const startTime = Date.now();
    const response = await fetch(configData.url, {
      method: 'POST',
      headers,
      body: JSON.stringify(testPayload),
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    const responseTime = Date.now() - startTime;
    
    return {
      success: response.ok,
      status: response.status,
      statusText: response.statusText,
      responseTime,
      headers: Object.fromEntries(response.headers.entries())
    };
    
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      responseTime: 0
    };
  }
}