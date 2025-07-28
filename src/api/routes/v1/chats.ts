import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { proxyService, ProxyRequest } from '../../../services/proxyService';
import { ZapinError, ErrorCodes } from '../../../types';
import { z } from 'zod';

// Request validation schemas
const MarkMessageAsReadSchema = z.object({
  instanceName: z.string().min(1),
  readMessages: z.array(z.object({
    id: z.string(),
    fromMe: z.boolean(),
    remoteJid: z.string()
  }))
});

const ArchiveChatSchema = z.object({
  instanceName: z.string().min(1),
  chat: z.string(),
  archive: z.boolean()
});

const DeleteMessageSchema = z.object({
  instanceName: z.string().min(1),
  id: z.string(),
  fromMe: z.boolean(),
  remoteJid: z.string()
});

const UpdateProfileNameSchema = z.object({
  instanceName: z.string().min(1),
  name: z.string().min(1).max(25)
});

const UpdateProfileStatusSchema = z.object({
  instanceName: z.string().min(1),
  status: z.string().max(139)
});

const UpdateProfilePictureSchema = z.object({
  instanceName: z.string().min(1),
  picture: z.string().min(1)
});

const CheckWhatsAppNumbersSchema = z.object({
  instanceName: z.string().min(1),
  numbers: z.array(z.string()).min(1).max(50)
});

const UpdatePrivacySettingsSchema = z.object({
  instanceName: z.string().min(1),
  readreceipts: z.enum(['all', 'none']).optional(),
  profile: z.enum(['all', 'contacts', 'contact_blacklist', 'none']).optional(),
  status: z.enum(['all', 'contacts', 'contact_blacklist', 'none']).optional(),
  online: z.enum(['all', 'match_last_seen']).optional(),
  last: z.enum(['all', 'contacts', 'contact_blacklist', 'none']).optional(),
  groupadd: z.enum(['all', 'contacts', 'contact_blacklist', 'none']).optional()
});

const UpdateBusinessProfileSchema = z.object({
  instanceName: z.string().min(1),
  description: z.string().optional(),
  category: z.string().optional(),
  email: z.string().email().optional(),
  websites: z.array(z.string().url()).optional(),
  address: z.object({
    street: z.string().optional(),
    city: z.string().optional(),
    state: z.string().optional(),
    zip: z.string().optional(),
    country: z.string().optional()
  }).optional()
});

export default async function chatRoutes(fastify: FastifyInstance) {
  
  // GET /chats/:instanceName - Get all chats
  fastify.get('/:instanceName', {
    schema: {
      description: 'Get all chats for an instance',
      tags: ['chats'],
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
      const params = request.params as { instanceName: string };
      
      const proxyRequest: ProxyRequest = {
        endpointKey: 'chat.fetchChats',
        instanceName: params.instanceName,
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

  // GET /chats/:instanceName/messages - Get messages from chat
  fastify.get('/:instanceName/messages', {
    schema: {
      description: 'Get messages from a chat',
      tags: ['chats'],
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        required: ['instanceName'],
        properties: {
          instanceName: { type: 'string', description: 'Instance name' }
        }
      },
      querystring: {
        type: 'object',
        required: ['remoteJid'],
        properties: {
          remoteJid: { type: 'string', description: 'Chat ID' },
          limit: { type: 'number', default: 20, description: 'Number of messages to fetch' }
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const params = request.params as { instanceName: string };
      const query = request.query as { remoteJid: string; limit?: number };
      
      const proxyRequest: ProxyRequest = {
        endpointKey: 'chat.fetchMessages',
        instanceName: params.instanceName,
        query: {
          remoteJid: query.remoteJid,
          limit: query.limit || 20
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

  // PUT /chats/mark-as-read - Mark messages as read
  fastify.put('/mark-as-read', {
    schema: {
      description: 'Mark messages as read',
      tags: ['chats'],
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        required: ['instanceName', 'readMessages'],
        properties: {
          instanceName: { type: 'string' },
          readMessages: {
            type: 'array',
            items: {
              type: 'object',
              required: ['id', 'fromMe', 'remoteJid'],
              properties: {
                id: { type: 'string' },
                fromMe: { type: 'boolean' },
                remoteJid: { type: 'string' }
              }
            }
          }
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const validatedData = MarkMessageAsReadSchema.parse(request.body);
      
      const proxyRequest: ProxyRequest = {
        endpointKey: 'chat.markMessageAsRead',
        instanceName: validatedData.instanceName,
        body: {
          readMessages: validatedData.readMessages
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

  // PUT /chats/archive - Archive or unarchive chat
  fastify.put('/archive', {
    schema: {
      description: 'Archive or unarchive a chat',
      tags: ['chats'],
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        required: ['instanceName', 'chat', 'archive'],
        properties: {
          instanceName: { type: 'string' },
          chat: { type: 'string', description: 'Chat ID' },
          archive: { type: 'boolean', description: 'True to archive, false to unarchive' }
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const validatedData = ArchiveChatSchema.parse(request.body);
      
      const proxyRequest: ProxyRequest = {
        endpointKey: 'chat.archiveChat',
        instanceName: validatedData.instanceName,
        body: {
          chat: validatedData.chat,
          archive: validatedData.archive
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

  // DELETE /chats/message - Delete message
  fastify.delete('/message', {
    schema: {
      description: 'Delete a message',
      tags: ['chats'],
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        required: ['instanceName', 'id', 'fromMe', 'remoteJid'],
        properties: {
          instanceName: { type: 'string' },
          id: { type: 'string', description: 'Message ID' },
          fromMe: { type: 'boolean' },
          remoteJid: { type: 'string', description: 'Chat ID' }
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const validatedData = DeleteMessageSchema.parse(request.body);
      
      const proxyRequest: ProxyRequest = {
        endpointKey: 'chat.deleteMessage',
        instanceName: validatedData.instanceName,
        body: {
          id: validatedData.id,
          fromMe: validatedData.fromMe,
          remoteJid: validatedData.remoteJid
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

  // GET /chats/:instanceName/profile - Get contact profile
  fastify.get('/:instanceName/profile', {
    schema: {
      description: 'Get contact profile information',
      tags: ['chats'],
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        required: ['instanceName'],
        properties: {
          instanceName: { type: 'string' }
        }
      },
      querystring: {
        type: 'object',
        required: ['number'],
        properties: {
          number: { type: 'string', description: 'Phone number' }
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const params = request.params as { instanceName: string };
      const query = request.query as { number: string };
      
      const proxyRequest: ProxyRequest = {
        endpointKey: 'chat.fetchProfile',
        instanceName: params.instanceName,
        query: { number: query.number },
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

  // PUT /chats/profile/name - Update profile name
  fastify.put('/profile/name', {
    schema: {
      description: 'Update profile name',
      tags: ['chats'],
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        required: ['instanceName', 'name'],
        properties: {
          instanceName: { type: 'string' },
          name: { type: 'string', minLength: 1, maxLength: 25 }
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const validatedData = UpdateProfileNameSchema.parse(request.body);
      
      const proxyRequest: ProxyRequest = {
        endpointKey: 'chat.updateProfileName',
        instanceName: validatedData.instanceName,
        body: {
          name: validatedData.name
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

  // PUT /chats/profile/status - Update profile status
  fastify.put('/profile/status', {
    schema: {
      description: 'Update profile status',
      tags: ['chats'],
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        required: ['instanceName', 'status'],
        properties: {
          instanceName: { type: 'string' },
          status: { type: 'string', maxLength: 139 }
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const validatedData = UpdateProfileStatusSchema.parse(request.body);
      
      const proxyRequest: ProxyRequest = {
        endpointKey: 'chat.updateProfileStatus',
        instanceName: validatedData.instanceName,
        body: {
          status: validatedData.status
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

  // PUT /chats/profile/picture - Update profile picture
  fastify.put('/profile/picture', {
    schema: {
      description: 'Update profile picture',
      tags: ['chats'],
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        required: ['instanceName', 'picture'],
        properties: {
          instanceName: { type: 'string' },
          picture: { type: 'string', description: 'Base64 encoded image' }
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const validatedData = UpdateProfilePictureSchema.parse(request.body);
      
      const proxyRequest: ProxyRequest = {
        endpointKey: 'chat.updateProfilePicture',
        instanceName: validatedData.instanceName,
        body: {
          picture: validatedData.picture
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

  // DELETE /chats/:instanceName/profile/picture - Remove profile picture
  fastify.delete('/:instanceName/profile/picture', {
    schema: {
      description: 'Remove profile picture',
      tags: ['chats'],
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        required: ['instanceName'],
        properties: {
          instanceName: { type: 'string' }
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const params = request.params as { instanceName: string };
      
      const proxyRequest: ProxyRequest = {
        endpointKey: 'chat.removeProfilePicture',
        instanceName: params.instanceName,
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

  // GET /chats/:instanceName/profile/picture - Get profile picture
  fastify.get('/:instanceName/profile/picture', {
    schema: {
      description: 'Get profile picture',
      tags: ['chats'],
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        required: ['instanceName'],
        properties: {
          instanceName: { type: 'string' }
        }
      },
      querystring: {
        type: 'object',
        required: ['number'],
        properties: {
          number: { type: 'string', description: 'Phone number' }
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const params = request.params as { instanceName: string };
      const query = request.query as { number: string };
      
      const proxyRequest: ProxyRequest = {
        endpointKey: 'chat.fetchProfilePicture',
        instanceName: params.instanceName,
        query: { number: query.number },
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

  // GET /chats/:instanceName/contacts - Get all contacts
  fastify.get('/:instanceName/contacts', {
    schema: {
      description: 'Get all contacts',
      tags: ['chats'],
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        required: ['instanceName'],
        properties: {
          instanceName: { type: 'string' }
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const params = request.params as { instanceName: string };
      
      const proxyRequest: ProxyRequest = {
        endpointKey: 'chat.fetchContacts',
        instanceName: params.instanceName,
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

  // POST /chats/check-whatsapp-numbers - Check if numbers have WhatsApp
  fastify.post('/check-whatsapp-numbers', {
    schema: {
      description: 'Check if phone numbers have WhatsApp',
      tags: ['chats'],
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        required: ['instanceName', 'numbers'],
        properties: {
          instanceName: { type: 'string' },
          numbers: { 
            type: 'array', 
            items: { type: 'string' }, 
            minItems: 1, 
            maxItems: 50 
          }
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const validatedData = CheckWhatsAppNumbersSchema.parse(request.body);
      
      const proxyRequest: ProxyRequest = {
        endpointKey: 'chat.whatsappNumbers',
        instanceName: validatedData.instanceName,
        body: {
          numbers: validatedData.numbers
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

  // PUT /chats/privacy-settings - Update privacy settings
  fastify.put('/privacy-settings', {
    schema: {
      description: 'Update privacy settings',
      tags: ['chats'],
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        required: ['instanceName'],
        properties: {
          instanceName: { type: 'string' },
          readreceipts: { type: 'string', enum: ['all', 'none'] },
          profile: { type: 'string', enum: ['all', 'contacts', 'contact_blacklist', 'none'] },
          status: { type: 'string', enum: ['all', 'contacts', 'contact_blacklist', 'none'] },
          online: { type: 'string', enum: ['all', 'match_last_seen'] },
          last: { type: 'string', enum: ['all', 'contacts', 'contact_blacklist', 'none'] },
          groupadd: { type: 'string', enum: ['all', 'contacts', 'contact_blacklist', 'none'] }
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const validatedData = UpdatePrivacySettingsSchema.parse(request.body);
      
      const proxyRequest: ProxyRequest = {
        endpointKey: 'chat.updatePrivacySettings',
        instanceName: validatedData.instanceName,
        body: {
          readreceipts: validatedData.readreceipts,
          profile: validatedData.profile,
          status: validatedData.status,
          online: validatedData.online,
          last: validatedData.last,
          groupadd: validatedData.groupadd
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

  // GET /chats/:instanceName/privacy-settings - Get privacy settings
  fastify.get('/:instanceName/privacy-settings', {
    schema: {
      description: 'Get privacy settings',
      tags: ['chats'],
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        required: ['instanceName'],
        properties: {
          instanceName: { type: 'string' }
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const params = request.params as { instanceName: string };
      
      const proxyRequest: ProxyRequest = {
        endpointKey: 'chat.fetchPrivacySettings',
        instanceName: params.instanceName,
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

  // PUT /chats/business-profile - Update business profile
  fastify.put('/business-profile', {
    schema: {
      description: 'Update business profile',
      tags: ['chats'],
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        required: ['instanceName'],
        properties: {
          instanceName: { type: 'string' },
          description: { type: 'string' },
          category: { type: 'string' },
          email: { type: 'string', format: 'email' },
          websites: { type: 'array', items: { type: 'string', format: 'uri' } },
          address: {
            type: 'object',
            properties: {
              street: { type: 'string' },
              city: { type: 'string' },
              state: { type: 'string' },
              zip: { type: 'string' },
              country: { type: 'string' }
            }
          }
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const validatedData = UpdateBusinessProfileSchema.parse(request.body);
      
      const proxyRequest: ProxyRequest = {
        endpointKey: 'chat.updateBusinessProfile',
        instanceName: validatedData.instanceName,
        body: {
          description: validatedData.description,
          category: validatedData.category,
          email: validatedData.email,
          websites: validatedData.websites,
          address: validatedData.address
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

  // GET /chats/:instanceName/business-profile - Get business profile
  fastify.get('/:instanceName/business-profile', {
    schema: {
      description: 'Get business profile',
      tags: ['chats'],
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        required: ['instanceName'],
        properties: {
          instanceName: { type: 'string' }
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const params = request.params as { instanceName: string };
      
      const proxyRequest: ProxyRequest = {
        endpointKey: 'chat.fetchBusinessProfile',
        instanceName: params.instanceName,
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