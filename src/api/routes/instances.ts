import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { instanceService, CreateInstanceRequest, UpdateInstanceRequest } from '../../services/instanceService';
import { ZapinError, ErrorCodes } from '../../types';
import { authMiddleware } from '../middleware/auth';
import { z } from 'zod';

// Request schemas
const CreateInstanceSchema = z.object({
  name: z.string().min(1).max(50).regex(/^[a-zA-Z0-9_-]+$/, 'Name can only contain letters, numbers, hyphens, and underscores'),
  webhookUrl: z.string().url().optional(),
  settings: z.object({
    rejectCall: z.boolean().default(false),
    msgCall: z.string().optional(),
    groupsIgnore: z.boolean().default(false),
    alwaysOnline: z.boolean().default(false),
    readMessages: z.boolean().default(false),
    readStatus: z.boolean().default(false),
    syncFullHistory: z.boolean().default(false),
  }).optional(),
});

const UpdateInstanceSchema = z.object({
  name: z.string().min(1).max(50).regex(/^[a-zA-Z0-9_-]+$/).optional(),
  webhookUrl: z.string().url().nullable().optional(),
  settings: z.object({
    rejectCall: z.boolean().optional(),
    msgCall: z.string().optional(),
    groupsIgnore: z.boolean().optional(),
    alwaysOnline: z.boolean().optional(),
    readMessages: z.boolean().optional(),
    readStatus: z.boolean().optional(),
    syncFullHistory: z.boolean().optional(),
  }).optional(),
  isActive: z.boolean().optional(),
});

const InstanceParamsSchema = z.object({
  id: z.string().cuid(),
});

// Type definitions for requests
interface AuthenticatedRequest extends FastifyRequest {
  user?: any;
  tenant?: any;
  apiKey?: any;
  authType?: 'jwt' | 'api_key';
}

interface CreateInstanceBody {
  name: string;
  webhookUrl?: string;
  settings?: {
    rejectCall?: boolean;
    msgCall?: string;
    groupsIgnore?: boolean;
    alwaysOnline?: boolean;
    readMessages?: boolean;
    readStatus?: boolean;
    syncFullHistory?: boolean;
  };
}

interface UpdateInstanceBody {
  name?: string;
  webhookUrl?: string | null;
  settings?: {
    rejectCall?: boolean;
    msgCall?: string;
    groupsIgnore?: boolean;
    alwaysOnline?: boolean;
    readMessages?: boolean;
    readStatus?: boolean;
    syncFullHistory?: boolean;
  };
  isActive?: boolean;
}

interface InstanceParams {
  id: string;
}

// Helper function to get tenant ID from authenticated request
function getTenantId(request: AuthenticatedRequest): string {
  const tenantId = request.tenant?.id || request.user?.tenantId;
  if (!tenantId) {
    throw new ZapinError(ErrorCodes.UNAUTHORIZED, 'Tenant ID not found', 401);
  }
  return tenantId;
}

export default async function instanceRoutes(fastify: FastifyInstance) {
  // Apply authentication middleware to all routes
  fastify.addHook('preHandler', authMiddleware);

  // GET /instances - List all instances for tenant
  fastify.get('/', {
    schema: {
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
                  name: { type: 'string' },
                  evolutionInstanceId: { type: 'string' },
                  phoneNumber: { type: 'string', nullable: true },
                  status: { type: 'string' },
                  webhookUrl: { type: 'string', nullable: true },
                  isActive: { type: 'boolean' },
                  lastConnectedAt: { type: 'string', nullable: true },
                  createdAt: { type: 'string' },
                  updatedAt: { type: 'string' },
                  _count: {
                    type: 'object',
                    properties: {
                      messageLogs: { type: 'number' },
                      bots: { type: 'number' },
                    },
                  },
                  tenant: {
                    type: 'object',
                    properties: {
                      name: { type: 'string' },
                      plan: { type: 'string' },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  }, async (request: AuthenticatedRequest, reply: FastifyReply) => {
    try {
      const tenantId = getTenantId(request);
      const instances = await instanceService.getInstancesByTenant(tenantId);
      
      return reply.send({
        success: true,
        data: instances,
      });
    } catch (error) {
      if (error instanceof ZapinError) {
        return reply.status(error.statusCode).send({
          success: false,
          error: {
            code: error.code,
            message: error.message,
            details: error.details,
          },
        });
      }

      return reply.status(500).send({
        success: false,
        error: {
          code: ErrorCodes.INTERNAL_ERROR,
          message: 'Internal server error',
        },
      });
    }
  });

  // POST /instances - Create new instance
  fastify.post<{ Body: CreateInstanceBody }>('/', {
    schema: {
      body: {
        type: 'object',
        required: ['name'],
        properties: {
          name: { 
            type: 'string',
            minLength: 1,
            maxLength: 50,
            pattern: '^[a-zA-Z0-9_-]+$',
            description: 'Instance name (alphanumeric, hyphens, underscores only)',
          },
          webhookUrl: { 
            type: 'string',
            format: 'uri',
            description: 'Custom webhook URL (optional)',
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
              syncFullHistory: { type: 'boolean', default: false },
            },
          },
        },
      },
      response: {
        201: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                name: { type: 'string' },
                evolutionInstanceId: { type: 'string' },
                status: { type: 'string' },
                webhookUrl: { type: 'string', nullable: true },
                createdAt: { type: 'string' },
              },
            },
          },
        },
      },
    },
  }, async (request: AuthenticatedRequest, reply: FastifyReply) => {
    try {
      // Validate request body
      const validatedData = CreateInstanceSchema.parse(request.body);

      // Create instance
      const tenantId = getTenantId(request);
      const instance = await instanceService.createInstance(tenantId, validatedData);

      return reply.status(201).send({
        success: true,
        data: {
          id: instance.id,
          name: instance.name,
          evolutionInstanceId: instance.evolutionInstanceId,
          status: instance.status,
          webhookUrl: instance.webhookUrl,
          createdAt: instance.createdAt,
        },
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({
          success: false,
          error: {
            code: ErrorCodes.VALIDATION_ERROR,
            message: 'Validation failed',
            details: error.errors,
          },
        });
      }

      if (error instanceof ZapinError) {
        return reply.status(error.statusCode).send({
          success: false,
          error: {
            code: error.code,
            message: error.message,
            details: error.details,
          },
        });
      }

      return reply.status(500).send({
        success: false,
        error: {
          code: ErrorCodes.INTERNAL_ERROR,
          message: 'Internal server error',
        },
      });
    }
  });

  // GET /instances/:id - Get specific instance
  fastify.get<{ Params: InstanceParams }>('/:id', {
    schema: {
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string', description: 'Instance ID' },
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
                id: { type: 'string' },
                name: { type: 'string' },
                evolutionInstanceId: { type: 'string' },
                phoneNumber: { type: 'string', nullable: true },
                status: { type: 'string' },
                settings: { type: 'object' },
                webhookUrl: { type: 'string', nullable: true },
                isActive: { type: 'boolean' },
                lastConnectedAt: { type: 'string', nullable: true },
                createdAt: { type: 'string' },
                updatedAt: { type: 'string' },
                _count: {
                  type: 'object',
                  properties: {
                    messageLogs: { type: 'number' },
                    bots: { type: 'number' },
                  },
                },
                tenant: {
                  type: 'object',
                  properties: {
                    name: { type: 'string' },
                    plan: { type: 'string' },
                  },
                },
              },
            },
          },
        },
      },
    },
  }, async (request: AuthenticatedRequest, reply: FastifyReply) => {
    try {
      // Validate params
      const { id } = InstanceParamsSchema.parse(request.params);

      // Get instance
      const tenantId = getTenantId(request);
      const instance = await instanceService.getInstanceById(tenantId, id);

      if (!instance) {
        return reply.status(404).send({
          success: false,
          error: {
            code: ErrorCodes.INSTANCE_NOT_FOUND,
            message: 'Instance not found',
          },
        });
      }

      return reply.send({
        success: true,
        data: instance,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({
          success: false,
          error: {
            code: ErrorCodes.VALIDATION_ERROR,
            message: 'Invalid instance ID',
            details: error.errors,
          },
        });
      }

      if (error instanceof ZapinError) {
        return reply.status(error.statusCode).send({
          success: false,
          error: {
            code: error.code,
            message: error.message,
            details: error.details,
          },
        });
      }

      return reply.status(500).send({
        success: false,
        error: {
          code: ErrorCodes.INTERNAL_ERROR,
          message: 'Internal server error',
        },
      });
    }
  });

  // PUT /instances/:id - Update instance
  fastify.put<{ Params: InstanceParams; Body: UpdateInstanceBody }>('/:id', {
    schema: {
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string', description: 'Instance ID' },
        },
      },
      body: {
        type: 'object',
        properties: {
          name: { 
            type: 'string',
            minLength: 1,
            maxLength: 50,
            pattern: '^[a-zA-Z0-9_-]+$',
          },
          webhookUrl: { 
            type: 'string',
            format: 'uri',
            nullable: true,
          },
          settings: {
            type: 'object',
            properties: {
              rejectCall: { type: 'boolean' },
              msgCall: { type: 'string' },
              groupsIgnore: { type: 'boolean' },
              alwaysOnline: { type: 'boolean' },
              readMessages: { type: 'boolean' },
              readStatus: { type: 'boolean' },
              syncFullHistory: { type: 'boolean' },
            },
          },
          isActive: { type: 'boolean' },
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
                id: { type: 'string' },
                name: { type: 'string' },
                evolutionInstanceId: { type: 'string' },
                status: { type: 'string' },
                webhookUrl: { type: 'string', nullable: true },
                updatedAt: { type: 'string' },
              },
            },
          },
        },
      },
    },
  }, async (request: AuthenticatedRequest, reply: FastifyReply) => {
    try {
      // Validate params and body
      const { id } = InstanceParamsSchema.parse(request.params);
      const validatedData = UpdateInstanceSchema.parse(request.body);

      // Update instance
      const tenantId = getTenantId(request);
      const instance = await instanceService.updateInstance(tenantId, id, validatedData);

      return reply.send({
        success: true,
        data: {
          id: instance.id,
          name: instance.name,
          evolutionInstanceId: instance.evolutionInstanceId,
          status: instance.status,
          webhookUrl: instance.webhookUrl,
          updatedAt: instance.updatedAt,
        },
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({
          success: false,
          error: {
            code: ErrorCodes.VALIDATION_ERROR,
            message: 'Validation failed',
            details: error.errors,
          },
        });
      }

      if (error instanceof ZapinError) {
        return reply.status(error.statusCode).send({
          success: false,
          error: {
            code: error.code,
            message: error.message,
            details: error.details,
          },
        });
      }

      return reply.status(500).send({
        success: false,
        error: {
          code: ErrorCodes.INTERNAL_ERROR,
          message: 'Internal server error',
        },
      });
    }
  });

  // DELETE /instances/:id - Delete instance
  fastify.delete<{ Params: InstanceParams }>('/:id', {
    schema: {
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string', description: 'Instance ID' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' },
          },
        },
      },
    },
  }, async (request: AuthenticatedRequest, reply: FastifyReply) => {
    try {
      // Validate params
      const { id } = InstanceParamsSchema.parse(request.params);

      // Delete instance
      const tenantId = getTenantId(request);
      await instanceService.deleteInstance(tenantId, id);

      return reply.send({
        success: true,
        message: 'Instance deleted successfully',
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({
          success: false,
          error: {
            code: ErrorCodes.VALIDATION_ERROR,
            message: 'Invalid instance ID',
            details: error.errors,
          },
        });
      }

      if (error instanceof ZapinError) {
        return reply.status(error.statusCode).send({
          success: false,
          error: {
            code: error.code,
            message: error.message,
            details: error.details,
          },
        });
      }

      return reply.status(500).send({
        success: false,
        error: {
          code: ErrorCodes.INTERNAL_ERROR,
          message: 'Internal server error',
        },
      });
    }
  });

  // POST /instances/:id/connect - Connect instance
  fastify.post<{ Params: InstanceParams }>('/:id/connect', {
    schema: {
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string', description: 'Instance ID' },
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
                status: { type: 'string' },
                qrCode: {
                  type: 'object',
                  nullable: true,
                  properties: {
                    base64: { type: 'string' },
                    code: { type: 'string' },
                    expiresAt: { type: 'string' },
                  },
                },
              },
            },
          },
        },
      },
    },
  }, async (request: AuthenticatedRequest, reply: FastifyReply) => {
    try {
      // Validate params
      const { id } = InstanceParamsSchema.parse(request.params);

      // Connect instance
      const tenantId = getTenantId(request);
      const connectionInfo = await instanceService.connectInstance(tenantId, id);

      return reply.send({
        success: true,
        data: connectionInfo,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({
          success: false,
          error: {
            code: ErrorCodes.VALIDATION_ERROR,
            message: 'Invalid instance ID',
            details: error.errors,
          },
        });
      }

      if (error instanceof ZapinError) {
        return reply.status(error.statusCode).send({
          success: false,
          error: {
            code: error.code,
            message: error.message,
            details: error.details,
          },
        });
      }

      return reply.status(500).send({
        success: false,
        error: {
          code: ErrorCodes.INTERNAL_ERROR,
          message: 'Internal server error',
        },
      });
    }
  });

  // POST /instances/:id/restart - Restart instance
  fastify.post<{ Params: InstanceParams }>('/:id/restart', {
    schema: {
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string', description: 'Instance ID' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' },
          },
        },
      },
    },
  }, async (request: AuthenticatedRequest, reply: FastifyReply) => {
    try {
      // Validate params
      const { id } = InstanceParamsSchema.parse(request.params);

      // Restart instance
      const tenantId = getTenantId(request);
      await instanceService.restartInstance(tenantId, id);

      return reply.send({
        success: true,
        message: 'Instance restarted successfully',
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({
          success: false,
          error: {
            code: ErrorCodes.VALIDATION_ERROR,
            message: 'Invalid instance ID',
            details: error.errors,
          },
        });
      }

      if (error instanceof ZapinError) {
        return reply.status(error.statusCode).send({
          success: false,
          error: {
            code: error.code,
            message: error.message,
            details: error.details,
          },
        });
      }

      return reply.status(500).send({
        success: false,
        error: {
          code: ErrorCodes.INTERNAL_ERROR,
          message: 'Internal server error',
        },
      });
    }
  });

  // POST /instances/:id/logout - Logout instance
  fastify.post<{ Params: InstanceParams }>('/:id/logout', {
    schema: {
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string', description: 'Instance ID' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' },
          },
        },
      },
    },
  }, async (request: AuthenticatedRequest, reply: FastifyReply) => {
    try {
      // Validate params
      const { id } = InstanceParamsSchema.parse(request.params);

      // Logout instance
      const tenantId = getTenantId(request);
      await instanceService.logoutInstance(tenantId, id);

      return reply.send({
        success: true,
        message: 'Instance logged out successfully',
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({
          success: false,
          error: {
            code: ErrorCodes.VALIDATION_ERROR,
            message: 'Invalid instance ID',
            details: error.errors,
          },
        });
      }

      if (error instanceof ZapinError) {
        return reply.status(error.statusCode).send({
          success: false,
          error: {
            code: error.code,
            message: error.message,
            details: error.details,
          },
        });
      }

      return reply.status(500).send({
        success: false,
        error: {
          code: ErrorCodes.INTERNAL_ERROR,
          message: 'Internal server error',
        },
      });
    }
  });

  // GET /instances/:id/connection - Get connection state
  fastify.get<{ Params: InstanceParams }>('/:id/connection', {
    schema: {
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string', description: 'Instance ID' },
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
                status: { type: 'string' },
                phoneNumber: { type: 'string', nullable: true },
                lastConnectedAt: { type: 'string', nullable: true },
                qrCode: {
                  type: 'object',
                  nullable: true,
                  properties: {
                    base64: { type: 'string' },
                    code: { type: 'string' },
                    expiresAt: { type: 'string' },
                  },
                },
              },
            },
          },
        },
      },
    },
  }, async (request: AuthenticatedRequest, reply: FastifyReply) => {
    try {
      // Validate params
      const { id } = InstanceParamsSchema.parse(request.params);

      // Get connection state
      const tenantId = getTenantId(request);
      const connectionInfo = await instanceService.getConnectionState(tenantId, id);

      return reply.send({
        success: true,
        data: connectionInfo,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({
          success: false,
          error: {
            code: ErrorCodes.VALIDATION_ERROR,
            message: 'Invalid instance ID',
            details: error.errors,
          },
        });
      }

      if (error instanceof ZapinError) {
        return reply.status(error.statusCode).send({
          success: false,
          error: {
            code: error.code,
            message: error.message,
            details: error.details,
          },
        });
      }

      return reply.status(500).send({
        success: false,
        error: {
          code: ErrorCodes.INTERNAL_ERROR,
          message: 'Internal server error',
        },
      });
    }
  });

  // POST /instances/:id/qr-refresh - Refresh QR code
  fastify.post<{ Params: InstanceParams }>('/:id/qr-refresh', {
    schema: {
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string', description: 'Instance ID' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: {
              type: 'object',
              nullable: true,
              properties: {
                base64: { type: 'string' },
                code: { type: 'string' },
                expiresAt: { type: 'string' },
              },
            },
          },
        },
      },
    },
  }, async (request: AuthenticatedRequest, reply: FastifyReply) => {
    try {
      // Validate params
      const { id } = InstanceParamsSchema.parse(request.params);

      // Refresh QR code
      const tenantId = getTenantId(request);
      const qrCodeData = await instanceService.refreshQRCode(tenantId, id);

      return reply.send({
        success: true,
        data: qrCodeData,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({
          success: false,
          error: {
            code: ErrorCodes.VALIDATION_ERROR,
            message: 'Invalid instance ID',
            details: error.errors,
          },
        });
      }

      if (error instanceof ZapinError) {
        return reply.status(error.statusCode).send({
          success: false,
          error: {
            code: error.code,
            message: error.message,
            details: error.details,
          },
        });
      }

      return reply.status(500).send({
        success: false,
        error: {
          code: ErrorCodes.INTERNAL_ERROR,
          message: 'Internal server error',
        },
      });
    }
  });
}