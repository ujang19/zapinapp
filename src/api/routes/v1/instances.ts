import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { proxyService, ProxyRequest } from '../../../services/proxyService';
import { ZapinError, ErrorCodes } from '../../../types';
import { z } from 'zod';

// Request validation schemas
const CreateInstanceSchema = z.object({
  instanceName: z.string().min(1).max(50),
  integration: z.enum(['WHATSAPP-BAILEYS']).optional(),
  qrcode: z.boolean().optional(),
  webhook: z.object({
    url: z.string().url(),
    byEvents: z.boolean(),
    base64: z.boolean(),
    events: z.array(z.string())
  }).optional(),
  settings: z.object({
    rejectCall: z.boolean().optional(),
    msgCall: z.string().optional(),
    groupsIgnore: z.boolean().optional(),
    alwaysOnline: z.boolean().optional(),
    readMessages: z.boolean().optional(),
    readStatus: z.boolean().optional(),
    syncFullHistory: z.boolean().optional()
  }).optional()
});

const UpdateInstanceSettingsSchema = z.object({
  instanceName: z.string().min(1),
  rejectCall: z.boolean().optional(),
  msgCall: z.string().optional(),
  groupsIgnore: z.boolean().optional(),
  alwaysOnline: z.boolean().optional(),
  readMessages: z.boolean().optional(),
  readStatus: z.boolean().optional(),
  syncFullHistory: z.boolean().optional()
});

const InstanceNameSchema = z.object({
  instanceName: z.string().min(1)
});

export default async function instanceRoutes(fastify: FastifyInstance) {
  
  // POST /instances/create - Create new instance
  fastify.post('/create', {
    schema: {
      description: 'Create a new WhatsApp instance',
      tags: ['instances'],
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        required: ['instanceName'],
        properties: {
          instanceName: { 
            type: 'string',
            minLength: 1,
            maxLength: 50,
            description: 'Unique instance name'
          },
          integration: { 
            type: 'string',
            enum: ['WHATSAPP-BAILEYS'],
            default: 'WHATSAPP-BAILEYS'
          },
          qrcode: { 
            type: 'boolean',
            default: true,
            description: 'Generate QR code for connection'
          },
          webhook: {
            type: 'object',
            properties: {
              url: { type: 'string', format: 'uri' },
              byEvents: { type: 'boolean' },
              base64: { type: 'boolean' },
              events: { type: 'array', items: { type: 'string' } }
            }
          },
          settings: {
            type: 'object',
            properties: {
              rejectCall: { type: 'boolean', default: false },
              msgCall: { type: 'string' },
              groupsIgnore: { type: 'boolean', default: false },
              alwaysOnline: { type: 'boolean', default: false },
              readMessages: { type: 'boolean', default: false },
              readStatus: { type: 'boolean', default: false },
              syncFullHistory: { type: 'boolean', default: false }
            }
          }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: { type: 'object' },
            meta: {
              type: 'object',
              properties: {
                cached: { type: 'boolean' },
                executionTime: { type: 'number' },
                quotaConsumed: { type: 'number' }
              }
            }
          }
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const validatedData = CreateInstanceSchema.parse(request.body);
      
      const proxyRequest: ProxyRequest = {
        endpointKey: 'instance.create',
        body: validatedData,
        tenantId: (request as any).tenant.id,
        userId: (request as any).user?.id,
        apiKeyId: (request as any).apiKey?.id
      };

      const result = await proxyService.proxyRequest(proxyRequest);
      
      if (!result.success) {
        return reply.code(400).send(result);
      }

      return reply.send(result);
    } catch (error) {
      return handleRouteError(error, reply);
    }
  });

  // GET /instances - Get all instances
  fastify.get('/', {
    schema: {
      description: 'Get all WhatsApp instances',
      tags: ['instances'],
      security: [{ bearerAuth: [] }],
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: { type: 'array', items: { type: 'object' } },
            meta: {
              type: 'object',
              properties: {
                cached: { type: 'boolean' },
                executionTime: { type: 'number' },
                quotaConsumed: { type: 'number' }
              }
            }
          }
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const proxyRequest: ProxyRequest = {
        endpointKey: 'instance.fetchInstances',
        tenantId: (request as any).tenant.id,
        userId: (request as any).user?.id,
        apiKeyId: (request as any).apiKey?.id
      };

      const result = await proxyService.proxyRequest(proxyRequest);
      
      if (!result.success) {
        return reply.code(400).send(result);
      }

      return reply.send(result);
    } catch (error) {
      return handleRouteError(error, reply);
    }
  });

  // GET /instances/:instanceName/connect - Connect instance
  fastify.get('/:instanceName/connect', {
    schema: {
      description: 'Connect instance to WhatsApp',
      tags: ['instances'],
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        required: ['instanceName'],
        properties: {
          instanceName: { type: 'string', description: 'Instance name' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: { type: 'object' },
            meta: {
              type: 'object',
              properties: {
                cached: { type: 'boolean' },
                executionTime: { type: 'number' },
                quotaConsumed: { type: 'number' }
              }
            }
          }
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { instanceName } = InstanceNameSchema.parse(request.params);
      
      const proxyRequest: ProxyRequest = {
        endpointKey: 'instance.connect',
        instanceName,
        tenantId: (request as any).tenant.id,
        userId: (request as any).user?.id,
        apiKeyId: (request as any).apiKey?.id
      };

      const result = await proxyService.proxyRequest(proxyRequest);
      
      if (!result.success) {
        return reply.code(400).send(result);
      }

      return reply.send(result);
    } catch (error) {
      return handleRouteError(error, reply);
    }
  });

  // GET /instances/:instanceName/connection-state - Get connection state
  fastify.get('/:instanceName/connection-state', {
    schema: {
      description: 'Get instance connection state',
      tags: ['instances'],
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        required: ['instanceName'],
        properties: {
          instanceName: { type: 'string', description: 'Instance name' }
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { instanceName } = InstanceNameSchema.parse(request.params);
      
      const proxyRequest: ProxyRequest = {
        endpointKey: 'instance.connectionState',
        instanceName,
        tenantId: (request as any).tenant.id,
        userId: (request as any).user?.id,
        apiKeyId: (request as any).apiKey?.id
      };

      const result = await proxyService.proxyRequest(proxyRequest);
      
      if (!result.success) {
        return reply.code(400).send(result);
      }

      return reply.send(result);
    } catch (error) {
      return handleRouteError(error, reply);
    }
  });

  // PUT /instances/:instanceName/restart - Restart instance
  fastify.put('/:instanceName/restart', {
    schema: {
      description: 'Restart an instance',
      tags: ['instances'],
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        required: ['instanceName'],
        properties: {
          instanceName: { type: 'string', description: 'Instance name' }
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { instanceName } = InstanceNameSchema.parse(request.params);
      
      const proxyRequest: ProxyRequest = {
        endpointKey: 'instance.restart',
        instanceName,
        tenantId: (request as any).tenant.id,
        userId: (request as any).user?.id,
        apiKeyId: (request as any).apiKey?.id
      };

      const result = await proxyService.proxyRequest(proxyRequest);
      
      if (!result.success) {
        return reply.code(400).send(result);
      }

      return reply.send(result);
    } catch (error) {
      return handleRouteError(error, reply);
    }
  });

  // DELETE /instances/:instanceName - Delete instance
  fastify.delete('/:instanceName', {
    schema: {
      description: 'Delete an instance',
      tags: ['instances'],
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        required: ['instanceName'],
        properties: {
          instanceName: { type: 'string', description: 'Instance name' }
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { instanceName } = InstanceNameSchema.parse(request.params);
      
      const proxyRequest: ProxyRequest = {
        endpointKey: 'instance.delete',
        instanceName,
        tenantId: (request as any).tenant.id,
        userId: (request as any).user?.id,
        apiKeyId: (request as any).apiKey?.id
      };

      const result = await proxyService.proxyRequest(proxyRequest);
      
      if (!result.success) {
        return reply.code(400).send(result);
      }

      return reply.send(result);
    } catch (error) {
      return handleRouteError(error, reply);
    }
  });

  // DELETE /instances/:instanceName/logout - Logout instance
  fastify.delete('/:instanceName/logout', {
    schema: {
      description: 'Logout instance from WhatsApp',
      tags: ['instances'],
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        required: ['instanceName'],
        properties: {
          instanceName: { type: 'string', description: 'Instance name' }
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { instanceName } = InstanceNameSchema.parse(request.params);
      
      const proxyRequest: ProxyRequest = {
        endpointKey: 'instance.logout',
        instanceName,
        tenantId: (request as any).tenant.id,
        userId: (request as any).user?.id,
        apiKeyId: (request as any).apiKey?.id
      };

      const result = await proxyService.proxyRequest(proxyRequest);
      
      if (!result.success) {
        return reply.code(400).send(result);
      }

      return reply.send(result);
    } catch (error) {
      return handleRouteError(error, reply);
    }
  });

  // PUT /instances/:instanceName/settings - Update instance settings
  fastify.put('/:instanceName/settings', {
    schema: {
      description: 'Update instance settings',
      tags: ['instances'],
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        required: ['instanceName'],
        properties: {
          instanceName: { type: 'string', description: 'Instance name' }
        }
      },
      body: {
        type: 'object',
        properties: {
          rejectCall: { type: 'boolean' },
          msgCall: { type: 'string' },
          groupsIgnore: { type: 'boolean' },
          alwaysOnline: { type: 'boolean' },
          readMessages: { type: 'boolean' },
          readStatus: { type: 'boolean' },
          syncFullHistory: { type: 'boolean' }
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { instanceName } = InstanceNameSchema.parse(request.params);
      const settings = UpdateInstanceSettingsSchema.parse({
        instanceName,
        ...(request.body as any)
      });
      
      const proxyRequest: ProxyRequest = {
        endpointKey: 'instance.settings',
        instanceName,
        body: {
          rejectCall: settings.rejectCall,
          msgCall: settings.msgCall,
          groupsIgnore: settings.groupsIgnore,
          alwaysOnline: settings.alwaysOnline,
          readMessages: settings.readMessages,
          readStatus: settings.readStatus,
          syncFullHistory: settings.syncFullHistory
        },
        tenantId: (request as any).tenant.id,
        userId: (request as any).user?.id,
        apiKeyId: (request as any).apiKey?.id
      };

      const result = await proxyService.proxyRequest(proxyRequest);
      
      if (!result.success) {
        return reply.code(400).send(result);
      }

      return reply.send(result);
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
        details: error.errors
      }
    });
  }

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
      