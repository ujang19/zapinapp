import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { proxyService, ProxyRequest } from '../../../services/proxyService';
import { authMiddleware } from '../../middleware/auth';
import { quotaMiddleware } from '../../middleware/quota';
import { ZapinError, ErrorCodes } from '../../../types';

// Import specific route modules
import messageRoutes from './messages';
import instanceRoutes from './instances';
import groupRoutes from './groups';
import chatRoutes from './chats';
import botRoutes from './bots';

// Extend FastifyRequest to include auth and tenant info
declare module 'fastify' {
  interface FastifyRequest {
    user?: any;
    tenant?: any;
    apiKey?: any;
    authType?: 'jwt' | 'api_key';
    quotaInfo?: any;
  }
}

export default async function v1Routes(fastify: FastifyInstance) {
  // Apply global middleware to all v1 routes
  fastify.addHook('preHandler', authMiddleware);
  fastify.addHook('preHandler', quotaMiddleware);

  // Register specific route modules
  await fastify.register(messageRoutes, { prefix: '/messages' });
  await fastify.register(instanceRoutes, { prefix: '/instances' });
  await fastify.register(groupRoutes, { prefix: '/groups' });
  await fastify.register(chatRoutes, { prefix: '/chats' });
  await fastify.register(botRoutes, { prefix: '/bots' });

  // Universal catch-all proxy handler for any unmapped endpoints
  fastify.all('/*', {
    schema: {
      description: 'Universal proxy handler for Evolution API endpoints',
      tags: ['proxy'],
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        properties: {
          '*': { type: 'string' }
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
      // Extract endpoint information from URL
      const urlPath = request.url.replace('/api/v1/', '');
      const pathParts = urlPath.split('/');
      
      // Try to map URL to endpoint key
      const endpointKey = mapUrlToEndpointKey(urlPath, request.method as string);
      
      if (!endpointKey) {
        throw new ZapinError(
          ErrorCodes.VALIDATION_ERROR,
          `Unsupported endpoint: ${request.method} ${urlPath}`,
          404
        );
      }

      // Extract instance name from path if present
      const instanceName = extractInstanceName(pathParts);

      // Build proxy request
      const proxyRequest: ProxyRequest = {
        endpointKey,
        instanceName,
        body: request.body,
        query: request.query as Record<string, any>,
        params: request.params as Record<string, any>,
        tenantId: request.tenant.id,
        userId: request.user?.id,
        apiKeyId: request.apiKey?.id
      };

      // Execute proxy request
      const result = await proxyService.proxyRequest(proxyRequest);

      if (!result.success) {
        return reply.code(400).send(result);
      }

      return reply.send(result);

    } catch (error) {
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

  // Health check endpoint
  fastify.get('/health', {
    schema: {
      description: 'Health check endpoint',
      tags: ['system'],
      response: {
        200: {
          type: 'object',
          properties: {
            status: { type: 'string' },
            timestamp: { type: 'string' },
            version: { type: 'string' }
          }
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    return reply.send({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: '1.0.0'
    });
  });

  // Get available endpoints
  fastify.get('/endpoints', {
    schema: {
      description: 'Get all available Evolution API endpoints',
      tags: ['system'],
      security: [{ bearerAuth: [] }],
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: {
              type: 'object',
              additionalProperties: {
                type: 'object',
                properties: {
                  path: { type: 'string' },
                  method: { type: 'string' },
                  quotaWeight: { type: 'number' },
                  quotaType: { type: 'string' },
                  requiresInstance: { type: 'boolean' },
                  cacheable: { type: 'boolean' }
                }
              }
            }
          }
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const endpoints = proxyService.getAvailableEndpoints();
    
    // Filter out sensitive information and format for public consumption
    const publicEndpoints = Object.entries(endpoints).reduce((acc, [key, config]) => {
      acc[key] = {
        path: config.path,
        method: config.method,
        quotaWeight: config.quotaWeight,
        quotaType: config.quotaType,
        requiresInstance: config.requiresInstance,
        cacheable: config.cacheable,
        description: getEndpointDescription(key)
      };
      return acc;
    }, {} as Record<string, any>);

    return reply.send({
      success: true,
      data: publicEndpoints
    });
  });
}

/**
 * Map URL path to endpoint key
 */
function mapUrlToEndpointKey(urlPath: string, method: string): string | null {
  // Remove query parameters
  const cleanPath = urlPath.split('?')[0];
  const pathParts = cleanPath.split('/').filter(Boolean);

  // Common patterns for Evolution API endpoints
  const patterns = [
    // Instance management
    { pattern: /^instance\/create$/, key: 'instance.create', method: 'POST' },
    { pattern: /^instance\/fetchInstances$/, key: 'instance.fetchInstances', method: 'GET' },
    { pattern: /^instance\/connect\/(.+)$/, key: 'instance.connect', method: 'GET' },
    { pattern: /^instance\/connectionState\/(.+)$/, key: 'instance.connectionState', method: 'GET' },
    { pattern: /^instance\/restart\/(.+)$/, key: 'instance.restart', method: 'PUT' },
    { pattern: /^instance\/delete\/(.+)$/, key: 'instance.delete', method: 'DELETE' },
    { pattern: /^instance\/logout\/(.+)$/, key: 'instance.logout', method: 'DELETE' },
    { pattern: /^instance\/settings\/(.+)$/, key: 'instance.settings', method: 'PUT' },

    // Message operations
    { pattern: /^message\/sendText\/(.+)$/, key: 'message.sendText', method: 'POST' },
    { pattern: /^message\/sendMedia\/(.+)$/, key: 'message.sendMedia', method: 'POST' },
    { pattern: /^message\/sendAudio\/(.+)$/, key: 'message.sendAudio', method: 'POST' },
    { pattern: /^message\/sendLocation\/(.+)$/, key: 'message.sendLocation', method: 'POST' },
    { pattern: /^message\/sendContact\/(.+)$/, key: 'message.sendContact', method: 'POST' },
    { pattern: /^message\/sendReaction\/(.+)$/, key: 'message.sendReaction', method: 'POST' },
    { pattern: /^message\/sendSticker\/(.+)$/, key: 'message.sendSticker', method: 'POST' },
    { pattern: /^message\/sendPoll\/(.+)$/, key: 'message.sendPoll', method: 'POST' },
    { pattern: /^message\/sendList\/(.+)$/, key: 'message.sendList', method: 'POST' },
    { pattern: /^message\/sendButton\/(.+)$/, key: 'message.sendButton', method: 'POST' },

    // Chat operations
    { pattern: /^chat\/fetchChats\/(.+)$/, key: 'chat.fetchChats', method: 'GET' },
    { pattern: /^chat\/fetchMessages\/(.+)$/, key: 'chat.fetchMessages', method: 'GET' },
    { pattern: /^chat\/markMessageAsRead\/(.+)$/, key: 'chat.markMessageAsRead', method: 'PUT' },
    { pattern: /^chat\/archiveChat\/(.+)$/, key: 'chat.archiveChat', method: 'PUT' },
    { pattern: /^chat\/deleteMessage\/(.+)$/, key: 'chat.deleteMessage', method: 'DELETE' },
    { pattern: /^chat\/fetchProfile\/(.+)$/, key: 'chat.fetchProfile', method: 'GET' },
    { pattern: /^chat\/updateProfileName\/(.+)$/, key: 'chat.updateProfileName', method: 'PUT' },
    { pattern: /^chat\/updateProfileStatus\/(.+)$/, key: 'chat.updateProfileStatus', method: 'PUT' },
    { pattern: /^chat\/updateProfilePicture\/(.+)$/, key: 'chat.updateProfilePicture', method: 'PUT' },
    { pattern: /^chat\/removeProfilePicture\/(.+)$/, key: 'chat.removeProfilePicture', method: 'DELETE' },
    { pattern: /^chat\/fetchProfilePicture\/(.+)$/, key: 'chat.fetchProfilePicture', method: 'GET' },
    { pattern: /^chat\/fetchContacts\/(.+)$/, key: 'chat.fetchContacts', method: 'GET' },
    { pattern: /^chat\/whatsappNumbers\/(.+)$/, key: 'chat.whatsappNumbers', method: 'POST' },
    { pattern: /^chat\/updatePrivacySettings\/(.+)$/, key: 'chat.updatePrivacySettings', method: 'PUT' },
    { pattern: /^chat\/fetchPrivacySettings\/(.+)$/, key: 'chat.fetchPrivacySettings', method: 'GET' },
    { pattern: /^chat\/updateBusinessProfile\/(.+)$/, key: 'chat.updateBusinessProfile', method: 'PUT' },
    { pattern: /^chat\/fetchBusinessProfile\/(.+)$/, key: 'chat.fetchBusinessProfile', method: 'GET' },

    // Group operations
    { pattern: /^group\/create\/(.+)$/, key: 'group.create', method: 'POST' },
    { pattern: /^group\/fetchGroupInfo\/(.+)$/, key: 'group.fetchGroupInfo', method: 'GET' },
    { pattern: /^group\/updateGroupSubject\/(.+)$/, key: 'group.updateGroupSubject', method: 'PUT' },
    { pattern: /^group\/updateGroupDescription\/(.+)$/, key: 'group.updateGroupDescription', method: 'PUT' },
    { pattern: /^group\/updateGroupPicture\/(.+)$/, key: 'group.updateGroupPicture', method: 'PUT' },
    { pattern: /^group\/addParticipant\/(.+)$/, key: 'group.addParticipant', method: 'PUT' },
    { pattern: /^group\/removeParticipant\/(.+)$/, key: 'group.removeParticipant', method: 'PUT' },
    { pattern: /^group\/promoteParticipant\/(.+)$/, key: 'group.promoteParticipant', method: 'PUT' },
    { pattern: /^group\/demoteParticipant\/(.+)$/, key: 'group.demoteParticipant', method: 'PUT' },
    { pattern: /^group\/leaveGroup\/(.+)$/, key: 'group.leaveGroup', method: 'DELETE' },
    { pattern: /^group\/updateGroupSettings\/(.+)$/, key: 'group.updateGroupSettings', method: 'PUT' },
    { pattern: /^group\/inviteCode\/(.+)$/, key: 'group.inviteCode', method: 'GET' },
    { pattern: /^group\/revokeInviteCode\/(.+)$/, key: 'group.revokeInviteCode', method: 'PUT' },

    // Bot management
    { pattern: /^typebot\/set\/(.+)$/, key: 'typebot.set', method: 'POST' },
    { pattern: /^typebot\/find\/(.+)$/, key: 'typebot.find', method: 'GET' },
    { pattern: /^openaibot\/set\/(.+)$/, key: 'openaibot.set', method: 'POST' },
    { pattern: /^openaibot\/find\/(.+)$/, key: 'openaibot.find', method: 'GET' },

    // Webhook management
    { pattern: /^webhook\/set\/(.+)$/, key: 'webhook.set', method: 'POST' },
    { pattern: /^webhook\/find\/(.+)$/, key: 'webhook.find', method: 'GET' }
  ];

  // Find matching pattern
  for (const { pattern, key, method: expectedMethod } of patterns) {
    if (pattern.test(cleanPath) && method === expectedMethod) {
      return key;
    }
  }

  return null;
}

/**
 * Extract instance name from path parts
 */
function extractInstanceName(pathParts: string[]): string | undefined {
  // Instance name is typically the last part of the path for most endpoints
  // or the part after specific keywords
  const instanceKeywords = ['instance', 'message', 'chat', 'group', 'typebot', 'openaibot', 'webhook'];
  
  for (let i = 0; i < pathParts.length; i++) {
    if (instanceKeywords.includes(pathParts[i]) && i + 2 < pathParts.length) {
      return pathParts[i + 2]; // Skip the action part
    }
  }

  // Fallback: return last part if it looks like an instance name
  const lastPart = pathParts[pathParts.length - 1];
  if (lastPart && lastPart.length > 0 && !lastPart.includes('?')) {
    return lastPart;
  }

  return undefined;
}

/**
 * Get human-readable description for endpoint
 */
function getEndpointDescription(endpointKey: string): string {
  const descriptions: Record<string, string> = {
    // Instance management
    'instance.create': 'Create a new WhatsApp instance',
    'instance.fetchInstances': 'Get all instances',
    'instance.connect': 'Connect instance to WhatsApp',
    'instance.connectionState': 'Get instance connection state',
    'instance.restart': 'Restart an instance',
    'instance.delete': 'Delete an instance',
    'instance.logout': 'Logout instance from WhatsApp',
    'instance.settings': 'Update instance settings',

    // Message operations
    'message.sendText': 'Send text message',
    'message.sendMedia': 'Send media message (image, video, document)',
    'message.sendAudio': 'Send audio message',
    'message.sendLocation': 'Send location message',
    'message.sendContact': 'Send contact message',
    'message.sendReaction': 'Send reaction to message',
    'message.sendSticker': 'Send sticker message',
    'message.sendPoll': 'Send poll message',
    'message.sendList': 'Send list message',
    'message.sendButton': 'Send button message',

    // Chat operations
    'chat.fetchChats': 'Get all chats',
    'chat.fetchMessages': 'Get messages from chat',
    'chat.markMessageAsRead': 'Mark messages as read',
    'chat.archiveChat': 'Archive or unarchive chat',
    'chat.deleteMessage': 'Delete message',
    'chat.fetchProfile': 'Get contact profile',
    'chat.updateProfileName': 'Update profile name',
    'chat.updateProfileStatus': 'Update profile status',
    'chat.updateProfilePicture': 'Update profile picture',
    'chat.removeProfilePicture': 'Remove profile picture',
    'chat.fetchProfilePicture': 'Get profile picture',
    'chat.fetchContacts': 'Get all contacts',
    'chat.whatsappNumbers': 'Check if numbers have WhatsApp',
    'chat.updatePrivacySettings': 'Update privacy settings',
    'chat.fetchPrivacySettings': 'Get privacy settings',
    'chat.updateBusinessProfile': 'Update business profile',
    'chat.fetchBusinessProfile': 'Get business profile',

    // Group operations
    'group.create': 'Create new group',
    'group.fetchGroupInfo': 'Get group information',
    'group.updateGroupSubject': 'Update group subject',
    'group.updateGroupDescription': 'Update group description',
    'group.updateGroupPicture': 'Update group picture',
    'group.addParticipant': 'Add participants to group',
    'group.removeParticipant': 'Remove participants from group',
    'group.promoteParticipant': 'Promote participants to admin',
    'group.demoteParticipant': 'Demote participants from admin',
    'group.leaveGroup': 'Leave group',
    'group.updateGroupSettings': 'Update group settings',
    'group.inviteCode': 'Get group invite code',
    'group.revokeInviteCode': 'Revoke group invite code',

    // Bot management
    'typebot.set': 'Configure Typebot integration',
    'typebot.find': 'Get Typebot configuration',
    'openaibot.set': 'Configure OpenAI bot integration',
    'openaibot.find': 'Get OpenAI bot configuration',

    // Webhook management
    'webhook.set': 'Configure webhook',
    'webhook.find': 'Get webhook configuration'
  };

  return descriptions[endpointKey] || 'Evolution API endpoint';
}