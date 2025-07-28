import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { proxyService, ProxyRequest } from '../../../services/proxyService';
import { ZapinError, ErrorCodes } from '../../../types';
import { z } from 'zod';

// Request validation schemas
const CreateGroupSchema = z.object({
  instanceName: z.string().min(1),
  subject: z.string().min(1).max(25),
  description: z.string().max(512).optional(),
  participants: z.array(z.string()).min(1)
});

const UpdateGroupSubjectSchema = z.object({
  instanceName: z.string().min(1),
  groupId: z.string(),
  subject: z.string().min(1).max(25)
});

const UpdateGroupDescriptionSchema = z.object({
  instanceName: z.string().min(1),
  groupId: z.string(),
  description: z.string().max(512)
});

const UpdateGroupPictureSchema = z.object({
  instanceName: z.string().min(1),
  groupId: z.string(),
  image: z.string().min(1)
});

const ManageParticipantsSchema = z.object({
  instanceName: z.string().min(1),
  groupId: z.string(),
  participants: z.array(z.string()).min(1)
});

const UpdateGroupSettingsSchema = z.object({
  instanceName: z.string().min(1),
  groupId: z.string(),
  action: z.enum(['announcement', 'not_announcement', 'locked', 'unlocked'])
});

const GroupActionSchema = z.object({
  instanceName: z.string().min(1),
  groupId: z.string()
});

const InstanceNameSchema = z.object({
  instanceName: z.string().min(1)
});

export default async function groupRoutes(fastify: FastifyInstance) {
  
  // POST /groups/create - Create new group
  fastify.post('/create', {
    schema: {
      description: 'Create a new WhatsApp group',
      tags: ['groups'],
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        required: ['instanceName', 'subject', 'participants'],
        properties: {
          instanceName: { type: 'string', description: 'Instance name' },
          subject: { type: 'string', minLength: 1, maxLength: 25, description: 'Group subject' },
          description: { type: 'string', maxLength: 512, description: 'Group description' },
          participants: { 
            type: 'array', 
            items: { type: 'string' }, 
            minItems: 1,
            description: 'Array of participant phone numbers'
          }
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const validatedData = CreateGroupSchema.parse(request.body);
      
      const proxyRequest: ProxyRequest = {
        endpointKey: 'group.create',
        instanceName: validatedData.instanceName,
        body: {
          subject: validatedData.subject,
          description: validatedData.description,
          participants: validatedData.participants
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

  // GET /groups/:instanceName/:groupId/info - Get group info
  fastify.get('/:instanceName/:groupId/info', {
    schema: {
      description: 'Get group information',
      tags: ['groups'],
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        required: ['instanceName', 'groupId'],
        properties: {
          instanceName: { type: 'string', description: 'Instance name' },
          groupId: { type: 'string', description: 'Group ID' }
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const params = request.params as { instanceName: string; groupId: string };
      
      const proxyRequest: ProxyRequest = {
        endpointKey: 'group.fetchGroupInfo',
        instanceName: params.instanceName,
        query: { groupId: params.groupId },
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

  // PUT /groups/update-subject - Update group subject
  fastify.put('/update-subject', {
    schema: {
      description: 'Update group subject',
      tags: ['groups'],
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        required: ['instanceName', 'groupId', 'subject'],
        properties: {
          instanceName: { type: 'string' },
          groupId: { type: 'string' },
          subject: { type: 'string', minLength: 1, maxLength: 25 }
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const validatedData = UpdateGroupSubjectSchema.parse(request.body);
      
      const proxyRequest: ProxyRequest = {
        endpointKey: 'group.updateGroupSubject',
        instanceName: validatedData.instanceName,
        body: {
          groupId: validatedData.groupId,
          subject: validatedData.subject
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

  // PUT /groups/update-description - Update group description
  fastify.put('/update-description', {
    schema: {
      description: 'Update group description',
      tags: ['groups'],
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        required: ['instanceName', 'groupId', 'description'],
        properties: {
          instanceName: { type: 'string' },
          groupId: { type: 'string' },
          description: { type: 'string', maxLength: 512 }
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const validatedData = UpdateGroupDescriptionSchema.parse(request.body);
      
      const proxyRequest: ProxyRequest = {
        endpointKey: 'group.updateGroupDescription',
        instanceName: validatedData.instanceName,
        body: {
          groupId: validatedData.groupId,
          description: validatedData.description
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

  // PUT /groups/update-picture - Update group picture
  fastify.put('/update-picture', {
    schema: {
      description: 'Update group picture',
      tags: ['groups'],
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        required: ['instanceName', 'groupId', 'image'],
        properties: {
          instanceName: { type: 'string' },
          groupId: { type: 'string' },
          image: { type: 'string', description: 'Base64 encoded image' }
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const validatedData = UpdateGroupPictureSchema.parse(request.body);
      
      const proxyRequest: ProxyRequest = {
        endpointKey: 'group.updateGroupPicture',
        instanceName: validatedData.instanceName,
        body: {
          groupId: validatedData.groupId,
          image: validatedData.image
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

  // PUT /groups/add-participants - Add participants to group
  fastify.put('/add-participants', {
    schema: {
      description: 'Add participants to group',
      tags: ['groups'],
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        required: ['instanceName', 'groupId', 'participants'],
        properties: {
          instanceName: { type: 'string' },
          groupId: { type: 'string' },
          participants: { 
            type: 'array', 
            items: { type: 'string' }, 
            minItems: 1 
          }
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const validatedData = ManageParticipantsSchema.parse(request.body);
      
      const proxyRequest: ProxyRequest = {
        endpointKey: 'group.addParticipant',
        instanceName: validatedData.instanceName,
        body: {
          groupId: validatedData.groupId,
          participants: validatedData.participants
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

  // PUT /groups/remove-participants - Remove participants from group
  fastify.put('/remove-participants', {
    schema: {
      description: 'Remove participants from group',
      tags: ['groups'],
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        required: ['instanceName', 'groupId', 'participants'],
        properties: {
          instanceName: { type: 'string' },
          groupId: { type: 'string' },
          participants: { 
            type: 'array', 
            items: { type: 'string' }, 
            minItems: 1 
          }
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const validatedData = ManageParticipantsSchema.parse(request.body);
      
      const proxyRequest: ProxyRequest = {
        endpointKey: 'group.removeParticipant',
        instanceName: validatedData.instanceName,
        body: {
          groupId: validatedData.groupId,
          participants: validatedData.participants
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

  // PUT /groups/promote-participants - Promote participants to admin
  fastify.put('/promote-participants', {
    schema: {
      description: 'Promote participants to admin',
      tags: ['groups'],
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        required: ['instanceName', 'groupId', 'participants'],
        properties: {
          instanceName: { type: 'string' },
          groupId: { type: 'string' },
          participants: { 
            type: 'array', 
            items: { type: 'string' }, 
            minItems: 1 
          }
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const validatedData = ManageParticipantsSchema.parse(request.body);
      
      const proxyRequest: ProxyRequest = {
        endpointKey: 'group.promoteParticipant',
        instanceName: validatedData.instanceName,
        body: {
          groupId: validatedData.groupId,
          participants: validatedData.participants
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

  // PUT /groups/demote-participants - Demote participants from admin
  fastify.put('/demote-participants', {
    schema: {
      description: 'Demote participants from admin',
      tags: ['groups'],
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        required: ['instanceName', 'groupId', 'participants'],
        properties: {
          instanceName: { type: 'string' },
          groupId: { type: 'string' },
          participants: { 
            type: 'array', 
            items: { type: 'string' }, 
            minItems: 1 
          }
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const validatedData = ManageParticipantsSchema.parse(request.body);
      
      const proxyRequest: ProxyRequest = {
        endpointKey: 'group.demoteParticipant',
        instanceName: validatedData.instanceName,
        body: {
          groupId: validatedData.groupId,
          participants: validatedData.participants
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

  // DELETE /groups/leave - Leave group
  fastify.delete('/leave', {
    schema: {
      description: 'Leave a group',
      tags: ['groups'],
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        required: ['instanceName', 'groupId'],
        properties: {
          instanceName: { type: 'string' },
          groupId: { type: 'string' }
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const validatedData = GroupActionSchema.parse(request.body);
      
      const proxyRequest: ProxyRequest = {
        endpointKey: 'group.leaveGroup',
        instanceName: validatedData.instanceName,
        body: {
          groupId: validatedData.groupId
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

  // PUT /groups/update-settings - Update group settings
  fastify.put('/update-settings', {
    schema: {
      description: 'Update group settings (announcement/locked)',
      tags: ['groups'],
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        required: ['instanceName', 'groupId', 'action'],
        properties: {
          instanceName: { type: 'string' },
          groupId: { type: 'string' },
          action: { 
            type: 'string', 
            enum: ['announcement', 'not_announcement', 'locked', 'unlocked'] 
          }
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const validatedData = UpdateGroupSettingsSchema.parse(request.body);
      
      const proxyRequest: ProxyRequest = {
        endpointKey: 'group.updateGroupSettings',
        instanceName: validatedData.instanceName,
        body: {
          groupId: validatedData.groupId,
          action: validatedData.action
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

  // GET /groups/:instanceName/:groupId/invite-code - Get group invite code
  fastify.get('/:instanceName/:groupId/invite-code', {
    schema: {
      description: 'Get group invite code',
      tags: ['groups'],
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        required: ['instanceName', 'groupId'],
        properties: {
          instanceName: { type: 'string' },
          groupId: { type: 'string' }
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const params = request.params as { instanceName: string; groupId: string };
      
      const proxyRequest: ProxyRequest = {
        endpointKey: 'group.inviteCode',
        instanceName: params.instanceName,
        query: { groupId: params.groupId },
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

  // PUT /groups/revoke-invite-code - Revoke group invite code
  fastify.put('/revoke-invite-code', {
    schema: {
      description: 'Revoke group invite code',
      tags: ['groups'],
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        required: ['instanceName', 'groupId'],
        properties: {
          instanceName: { type: 'string' },
          groupId: { type: 'string' }
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const validatedData = GroupActionSchema.parse(request.body);
      
      const proxyRequest: ProxyRequest = {
        endpointKey: 'group.revokeInviteCode',
        instanceName: validatedData.instanceName,
        body: {
          groupId: validatedData.groupId
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