import { FastifyRequest, FastifyReply } from 'fastify';
import { evolutionService } from './evolutionService';
import { prisma } from '../lib/prisma';
import { redis } from '../lib/redis';
import { ZapinError, ErrorCodes } from '../types';
import { consumeQuota } from '../api/middleware/quota';
import { z } from 'zod';

// Evolution API endpoint mapping configuration
export interface EndpointConfig {
  path: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  quotaWeight: number;
  quotaType: 'messages' | 'api_calls' | 'instances' | 'bots';
  requiresInstance: boolean;
  cacheable: boolean;
  cacheTime?: number;
  validation?: z.ZodSchema;
  transformRequest?: (body: any, params: any, query: any) => any;
  transformResponse?: (data: any) => any;
}

// Complete Evolution API v2.2.x endpoint mapping
export const EVOLUTION_ENDPOINTS: Record<string, EndpointConfig> = {
  // Instance Management
  'instance.create': {
    path: '/instance/create',
    method: 'POST',
    quotaWeight: 5,
    quotaType: 'instances',
    requiresInstance: false,
    cacheable: false,
    validation: z.object({
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
    })
  },
  'instance.fetchInstances': {
    path: '/instance/fetchInstances',
    method: 'GET',
    quotaWeight: 1,
    quotaType: 'api_calls',
    requiresInstance: false,
    cacheable: true,
    cacheTime: 30
  },
  'instance.connect': {
    path: '/instance/connect/{instanceName}',
    method: 'GET',
    quotaWeight: 2,
    quotaType: 'api_calls',
    requiresInstance: true,
    cacheable: false
  },
  'instance.connectionState': {
    path: '/instance/connectionState/{instanceName}',
    method: 'GET',
    quotaWeight: 1,
    quotaType: 'api_calls',
    requiresInstance: true,
    cacheable: true,
    cacheTime: 10
  },
  'instance.restart': {
    path: '/instance/restart/{instanceName}',
    method: 'PUT',
    quotaWeight: 3,
    quotaType: 'api_calls',
    requiresInstance: true,
    cacheable: false
  },
  'instance.delete': {
    path: '/instance/delete/{instanceName}',
    method: 'DELETE',
    quotaWeight: 5,
    quotaType: 'instances',
    requiresInstance: true,
    cacheable: false
  },
  'instance.logout': {
    path: '/instance/logout/{instanceName}',
    method: 'DELETE',
    quotaWeight: 2,
    quotaType: 'api_calls',
    requiresInstance: true,
    cacheable: false
  },
  'instance.settings': {
    path: '/instance/settings/{instanceName}',
    method: 'PUT',
    quotaWeight: 1,
    quotaType: 'api_calls',
    requiresInstance: true,
    cacheable: false
  },

  // Message Operations
  'message.sendText': {
    path: '/message/sendText/{instanceName}',
    method: 'POST',
    quotaWeight: 1,
    quotaType: 'messages',
    requiresInstance: true,
    cacheable: false,
    validation: z.object({
      number: z.string().min(1),
      text: z.string().min(1).max(4096),
      delay: z.number().optional(),
      quoted: z.object({
        key: z.object({
          id: z.string()
        })
      }).optional(),
      mentionsEveryOne: z.boolean().optional(),
      mentioned: z.array(z.string()).optional()
    })
  },
  'message.sendMedia': {
    path: '/message/sendMedia/{instanceName}',
    method: 'POST',
    quotaWeight: 2,
    quotaType: 'messages',
    requiresInstance: true,
    cacheable: false,
    validation: z.object({
      number: z.string().min(1),
      mediatype: z.enum(['image', 'video', 'audio', 'document']),
      media: z.string().min(1),
      caption: z.string().optional(),
      fileName: z.string().optional(),
      delay: z.number().optional()
    })
  },
  'message.sendAudio': {
    path: '/message/sendAudio/{instanceName}',
    method: 'POST',
    quotaWeight: 2,
    quotaType: 'messages',
    requiresInstance: true,
    cacheable: false,
    validation: z.object({
      number: z.string().min(1),
      audio: z.string().min(1),
      delay: z.number().optional(),
      encoding: z.boolean().optional()
    })
  },
  'message.sendLocation': {
    path: '/message/sendLocation/{instanceName}',
    method: 'POST',
    quotaWeight: 1,
    quotaType: 'messages',
    requiresInstance: true,
    cacheable: false,
    validation: z.object({
      number: z.string().min(1),
      latitude: z.number(),
      longitude: z.number(),
      name: z.string().optional(),
      address: z.string().optional()
    })
  },
  'message.sendContact': {
    path: '/message/sendContact/{instanceName}',
    method: 'POST',
    quotaWeight: 1,
    quotaType: 'messages',
    requiresInstance: true,
    cacheable: false,
    validation: z.object({
      number: z.string().min(1),
      contact: z.object({
        fullName: z.string(),
        wuid: z.string(),
        phoneNumber: z.string(),
        organization: z.string().optional(),
        email: z.string().email().optional(),
        url: z.string().url().optional()
      })
    })
  },
  'message.sendReaction': {
    path: '/message/sendReaction/{instanceName}',
    method: 'POST',
    quotaWeight: 1,
    quotaType: 'messages',
    requiresInstance: true,
    cacheable: false,
    validation: z.object({
      reactionMessage: z.object({
        key: z.object({
          id: z.string()
        }),
        reaction: z.string()
      })
    })
  },
  'message.sendSticker': {
    path: '/message/sendSticker/{instanceName}',
    method: 'POST',
    quotaWeight: 2,
    quotaType: 'messages',
    requiresInstance: true,
    cacheable: false,
    validation: z.object({
      number: z.string().min(1),
      sticker: z.string().min(1),
      delay: z.number().optional()
    })
  },
  'message.sendPoll': {
    path: '/message/sendPoll/{instanceName}',
    method: 'POST',
    quotaWeight: 1,
    quotaType: 'messages',
    requiresInstance: true,
    cacheable: false,
    validation: z.object({
      number: z.string().min(1),
      name: z.string().min(1),
      selectableCount: z.number().min(1),
      values: z.array(z.string()).min(2)
    })
  },
  'message.sendList': {
    path: '/message/sendList/{instanceName}',
    method: 'POST',
    quotaWeight: 1,
    quotaType: 'messages',
    requiresInstance: true,
    cacheable: false,
    validation: z.object({
      number: z.string().min(1),
      title: z.string().min(1),
      description: z.string().optional(),
      buttonText: z.string().min(1),
      footerText: z.string().optional(),
      sections: z.array(z.object({
        title: z.string(),
        rows: z.array(z.object({
          title: z.string(),
          description: z.string().optional(),
          rowId: z.string()
        }))
      }))
    })
  },
  'message.sendButton': {
    path: '/message/sendButton/{instanceName}',
    method: 'POST',
    quotaWeight: 1,
    quotaType: 'messages',
    requiresInstance: true,
    cacheable: false,
    validation: z.object({
      number: z.string().min(1),
      text: z.string().min(1),
      buttons: z.array(z.object({
        buttonId: z.string(),
        buttonText: z.object({
          displayText: z.string()
        }),
        type: z.number()
      })),
      headerText: z.string().optional(),
      footerText: z.string().optional()
    })
  },

  // Chat Operations
  'chat.fetchChats': {
    path: '/chat/fetchChats/{instanceName}',
    method: 'GET',
    quotaWeight: 1,
    quotaType: 'api_calls',
    requiresInstance: true,
    cacheable: true,
    cacheTime: 60
  },
  'chat.fetchMessages': {
    path: '/chat/fetchMessages/{instanceName}',
    method: 'GET',
    quotaWeight: 1,
    quotaType: 'api_calls',
    requiresInstance: true,
    cacheable: true,
    cacheTime: 30
  },
  'chat.markMessageAsRead': {
    path: '/chat/markMessageAsRead/{instanceName}',
    method: 'PUT',
    quotaWeight: 1,
    quotaType: 'api_calls',
    requiresInstance: true,
    cacheable: false,
    validation: z.object({
      readMessages: z.array(z.object({
        id: z.string(),
        fromMe: z.boolean(),
        remoteJid: z.string()
      }))
    })
  },
  'chat.archiveChat': {
    path: '/chat/archiveChat/{instanceName}',
    method: 'PUT',
    quotaWeight: 1,
    quotaType: 'api_calls',
    requiresInstance: true,
    cacheable: false,
    validation: z.object({
      chat: z.string(),
      archive: z.boolean()
    })
  },
  'chat.deleteMessage': {
    path: '/chat/deleteMessage/{instanceName}',
    method: 'DELETE',
    quotaWeight: 1,
    quotaType: 'api_calls',
    requiresInstance: true,
    cacheable: false,
    validation: z.object({
      id: z.string(),
      fromMe: z.boolean(),
      remoteJid: z.string()
    })
  },
  'chat.fetchProfile': {
    path: '/chat/fetchProfile/{instanceName}',
    method: 'GET',
    quotaWeight: 1,
    quotaType: 'api_calls',
    requiresInstance: true,
    cacheable: true,
    cacheTime: 300
  },
  'chat.updateProfileName': {
    path: '/chat/updateProfileName/{instanceName}',
    method: 'PUT',
    quotaWeight: 1,
    quotaType: 'api_calls',
    requiresInstance: true,
    cacheable: false,
    validation: z.object({
      name: z.string().min(1).max(25)
    })
  },
  'chat.updateProfileStatus': {
    path: '/chat/updateProfileStatus/{instanceName}',
    method: 'PUT',
    quotaWeight: 1,
    quotaType: 'api_calls',
    requiresInstance: true,
    cacheable: false,
    validation: z.object({
      status: z.string().max(139)
    })
  },
  'chat.updateProfilePicture': {
    path: '/chat/updateProfilePicture/{instanceName}',
    method: 'PUT',
    quotaWeight: 2,
    quotaType: 'api_calls',
    requiresInstance: true,
    cacheable: false,
    validation: z.object({
      picture: z.string().min(1)
    })
  },
  'chat.removeProfilePicture': {
    path: '/chat/removeProfilePicture/{instanceName}',
    method: 'DELETE',
    quotaWeight: 1,
    quotaType: 'api_calls',
    requiresInstance: true,
    cacheable: false
  },
  'chat.fetchProfilePicture': {
    path: '/chat/fetchProfilePicture/{instanceName}',
    method: 'GET',
    quotaWeight: 1,
    quotaType: 'api_calls',
    requiresInstance: true,
    cacheable: true,
    cacheTime: 300
  },
  'chat.fetchContacts': {
    path: '/chat/fetchContacts/{instanceName}',
    method: 'GET',
    quotaWeight: 2,
    quotaType: 'api_calls',
    requiresInstance: true,
    cacheable: true,
    cacheTime: 300
  },
  'chat.whatsappNumbers': {
    path: '/chat/whatsappNumbers/{instanceName}',
    method: 'POST',
    quotaWeight: 1,
    quotaType: 'api_calls',
    requiresInstance: true,
    cacheable: true,
    cacheTime: 600,
    validation: z.object({
      numbers: z.array(z.string()).min(1).max(50)
    })
  },
  'chat.updatePrivacySettings': {
    path: '/chat/updatePrivacySettings/{instanceName}',
    method: 'PUT',
    quotaWeight: 1,
    quotaType: 'api_calls',
    requiresInstance: true,
    cacheable: false,
    validation: z.object({
      readreceipts: z.enum(['all', 'none']).optional(),
      profile: z.enum(['all', 'contacts', 'contact_blacklist', 'none']).optional(),
      status: z.enum(['all', 'contacts', 'contact_blacklist', 'none']).optional(),
      online: z.enum(['all', 'match_last_seen']).optional(),
      last: z.enum(['all', 'contacts', 'contact_blacklist', 'none']).optional(),
      groupadd: z.enum(['all', 'contacts', 'contact_blacklist', 'none']).optional()
    })
  },
  'chat.fetchPrivacySettings': {
    path: '/chat/fetchPrivacySettings/{instanceName}',
    method: 'GET',
    quotaWeight: 1,
    quotaType: 'api_calls',
    requiresInstance: true,
    cacheable: true,
    cacheTime: 300
  },
  'chat.updateBusinessProfile': {
    path: '/chat/updateBusinessProfile/{instanceName}',
    method: 'PUT',
    quotaWeight: 1,
    quotaType: 'api_calls',
    requiresInstance: true,
    cacheable: false,
    validation: z.object({
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
    })
  },
  'chat.fetchBusinessProfile': {
    path: '/chat/fetchBusinessProfile/{instanceName}',
    method: 'GET',
    quotaWeight: 1,
    quotaType: 'api_calls',
    requiresInstance: true,
    cacheable: true,
    cacheTime: 300
  },

  // Group Operations
  'group.create': {
    path: '/group/create/{instanceName}',
    method: 'POST',
    quotaWeight: 2,
    quotaType: 'api_calls',
    requiresInstance: true,
    cacheable: false,
    validation: z.object({
      subject: z.string().min(1).max(25),
      description: z.string().max(512).optional(),
      participants: z.array(z.string()).min(1)
    })
  },
  'group.fetchGroupInfo': {
    path: '/group/fetchGroupInfo/{instanceName}',
    method: 'GET',
    quotaWeight: 1,
    quotaType: 'api_calls',
    requiresInstance: true,
    cacheable: true,
    cacheTime: 300
  },
  'group.updateGroupSubject': {
    path: '/group/updateGroupSubject/{instanceName}',
    method: 'PUT',
    quotaWeight: 1,
    quotaType: 'api_calls',
    requiresInstance: true,
    cacheable: false,
    validation: z.object({
      groupId: z.string(),
      subject: z.string().min(1).max(25)
    })
  },
  'group.updateGroupDescription': {
    path: '/group/updateGroupDescription/{instanceName}',
    method: 'PUT',
    quotaWeight: 1,
    quotaType: 'api_calls',
    requiresInstance: true,
    cacheable: false,
    validation: z.object({
      groupId: z.string(),
      description: z.string().max(512)
    })
  },
  'group.updateGroupPicture': {
    path: '/group/updateGroupPicture/{instanceName}',
    method: 'PUT',
    quotaWeight: 2,
    quotaType: 'api_calls',
    requiresInstance: true,
    cacheable: false,
    validation: z.object({
      groupId: z.string(),
      image: z.string().min(1)
    })
  },
  'group.addParticipant': {
    path: '/group/addParticipant/{instanceName}',
    method: 'PUT',
    quotaWeight: 1,
    quotaType: 'api_calls',
    requiresInstance: true,
    cacheable: false,
    validation: z.object({
      groupId: z.string(),
      participants: z.array(z.string()).min(1)
    })
  },
  'group.removeParticipant': {
    path: '/group/removeParticipant/{instanceName}',
    method: 'PUT',
    quotaWeight: 1,
    quotaType: 'api_calls',
    requiresInstance: true,
    cacheable: false,
    validation: z.object({
      groupId: z.string(),
      participants: z.array(z.string()).min(1)
    })
  },
  'group.promoteParticipant': {
    path: '/group/promoteParticipant/{instanceName}',
    method: 'PUT',
    quotaWeight: 1,
    quotaType: 'api_calls',
    requiresInstance: true,
    cacheable: false,
    validation: z.object({
      groupId: z.string(),
      participants: z.array(z.string()).min(1)
    })
  },
  'group.demoteParticipant': {
    path: '/group/demoteParticipant/{instanceName}',
    method: 'PUT',
    quotaWeight: 1,
    quotaType: 'api_calls',
    requiresInstance: true,
    cacheable: false,
    validation: z.object({
      groupId: z.string(),
      participants: z.array(z.string()).min(1)
    })
  },
  'group.leaveGroup': {
    path: '/group/leaveGroup/{instanceName}',
    method: 'DELETE',
    quotaWeight: 1,
    quotaType: 'api_calls',
    requiresInstance: true,
    cacheable: false,
    validation: z.object({
      groupId: z.string()
    })
  },
  'group.updateGroupSettings': {
    path: '/group/updateGroupSettings/{instanceName}',
    method: 'PUT',
    quotaWeight: 1,
    quotaType: 'api_calls',
    requiresInstance: true,
    cacheable: false,
    validation: z.object({
      groupId: z.string(),
      action: z.enum(['announcement', 'not_announcement', 'locked', 'unlocked'])
    })
  },
  'group.inviteCode': {
    path: '/group/inviteCode/{instanceName}',
    method: 'GET',
    quotaWeight: 1,
    quotaType: 'api_calls',
    requiresInstance: true,
    cacheable: true,
    cacheTime: 300
  },
  'group.revokeInviteCode': {
    path: '/group/revokeInviteCode/{instanceName}',
    method: 'PUT',
    quotaWeight: 1,
    quotaType: 'api_calls',
    requiresInstance: true,
    cacheable: false,
    validation: z.object({
      groupId: z.string()
    })
  },

  // Bot Management
  'typebot.set': {
    path: '/typebot/set/{instanceName}',
    method: 'POST',
    quotaWeight: 3,
    quotaType: 'bots',
    requiresInstance: true,
    cacheable: false,
    validation: z.object({
      enabled: z.boolean(),
      description: z.string().optional(),
      url: z.string().url().optional(),
      typebot: z.object({
        url: z.string().url(),
        typebot: z.string(),
        expire: z.number().optional(),
        keywordFinish: z.string().optional(),
        delayMessage: z.number().optional(),
        unknownMessage: z.string().optional(),
        listeningFromMe: z.boolean().optional(),
        stopBotFromMe: z.boolean().optional(),
        keepOpen: z.boolean().optional(),
        debounceTime: z.number().optional()
      }).optional()
    })
  },
  'typebot.find': {
    path: '/typebot/find/{instanceName}',
    method: 'GET',
    quotaWeight: 1,
    quotaType: 'api_calls',
    requiresInstance: true,
    cacheable: true,
    cacheTime: 60
  },
  'openaibot.set': {
    path: '/openaibot/set/{instanceName}',
    method: 'POST',
    quotaWeight: 3,
    quotaType: 'bots',
    requiresInstance: true,
    cacheable: false,
    validation: z.object({
      enabled: z.boolean(),
      description: z.string().optional(),
      botType: z.enum(['assistant', 'chatCompletion']),
      assistantId: z.string().optional(),
      functionUrl: z.string().url().optional(),
      model: z.string().optional(),
      systemMessages: z.array(z.object({
        role: z.string(),
        content: z.string()
      })).optional(),
      assistantMessages: z.array(z.object({
        role: z.string(),
        content: z.string()
      })).optional(),
      userMessages: z.array(z.object({
        role: z.string(),
        content: z.string()
      })).optional(),
      maxTokens: z.number().optional(),
      expire: z.number().optional(),
      keywordFinish: z.string().optional(),
      delayMessage: z.number().optional(),
      unknownMessage: z.string().optional(),
      listeningFromMe: z.boolean().optional(),
      stopBotFromMe: z.boolean().optional(),
      keepOpen: z.boolean().optional(),
      debounceTime: z.number().optional(),
      openaiCredsId: z.string().optional()
    })
  },
  'openaibot.find': {
    path: '/openaibot/find/{instanceName}',
    method: 'GET',
    quotaWeight: 1,
    quotaType: 'api_calls',
    requiresInstance: true,
    cacheable: true,
    cacheTime: 60
  },

  // Webhook Management
  'webhook.set': {
    path: '/webhook/set/{instanceName}',
    method: 'POST',
    quotaWeight: 1,
    quotaType: 'api_calls',
    requiresInstance: true,
    cacheable: false,
    validation: z.object({
      url: z.string().url(),
      byEvents: z.boolean(),
      base64: z.boolean(),
      events: z.array(z.string())
    })
  },
  'webhook.find': {
    path: '/webhook/find/{instanceName}',
    method: 'GET',
    quotaWeight: 1,
    quotaType: 'api_calls',
    requiresInstance: true,
    cacheable: true,
    cacheTime: 60
  }
};

export interface ProxyRequest {
  endpointKey: string;
  instanceName?: string;
  body?: any;
  query?: Record<string, any>;
  params?: Record<string, any>;
  tenantId: string;
  userId?: string;
  apiKeyId?: string;
}

export interface ProxyResponse {
  success: boolean;
  data?: any;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
  meta?: {
    cached: boolean;
    executionTime: number;
    quotaConsumed: number;
  };
}

export class ProxyService {
  private readonly timeout = 30000;
  private readonly maxRetries = 3;

  /**
   * Universal proxy handler for all Evolution API endpoints
   */
  async proxyRequest(request: ProxyRequest): Promise<ProxyResponse> {
    const startTime = Date.now();
    
    try {
      // Get endpoint configuration
      const config = EVOLUTION_ENDPOINTS[request.endpointKey];
      if (!config) {
        throw new ZapinError(
          ErrorCodes.VALIDATION_ERROR,
          `Unknown endpoint: ${request.endpointKey}`,
          400
        );
      }

      // Validate instance access if required
      if (config.requiresInstance && request.instanceName) {
        await this.validateInstanceAccess(request.tenantId, request.instanceName);
      }

      // Validate request data
      if (config.validation && request.body) {
        try {
          config.validation.parse(request.body);
        } catch (error) {
          if (error instanceof z.ZodError) {
            throw new ZapinError(
              ErrorCodes.VALIDATION_ERROR,
              'Request validation failed',
              400,
              error.errors
            );
          }
          throw error;
        }
      }

      // Check cache first
      const cacheKey = this.generateCacheKey(request);
      if (config.cacheable && config.method === 'GET') {
        const cached = await this.getFromCache(cacheKey);
        if (cached) {
          return {
            success: true,
            data: cached,
            meta: {
              cached: true,
              executionTime: Date.now() - startTime,
              quotaConsumed: 0
            }
          };
        }
      }

      // Transform request if needed
      let transformedBody = request.body;
      if (config.transformRequest) {
        transformedBody = config.transformRequest(
          request.body,
          request.params,
          request.query
        );
      }

      // Build Evolution API path
      let evolutionPath = config.path;
      if (request.instanceName) {
        evolutionPath = evolutionPath.replace('{instanceName}', request.instanceName);
      }

      // Add query parameters
      if (request.query && Object.keys(request.query).length > 0) {
        const queryString = new URLSearchParams(request.query).toString();
        evolutionPath += `?${queryString}`;
      }

      // Make request to Evolution API
      const response = await this.makeEvolutionRequest(
        evolutionPath,
        config.method,
        transformedBody
      );

      // Transform response if needed
      let transformedData = response;
      if (config.transformResponse) {
        transformedData = config.transformResponse(response);
      }

      // Cache response if cacheable
      if (config.cacheable && config.cacheTime) {
        await this.setCache(cacheKey, transformedData, config.cacheTime);
      }

      // Log usage
      await this.logUsage(request, config, response);

      // Consume quota
      await consumeQuota(
        request.tenantId,
        request.endpointKey,
        config.method
      );

      return {
        success: true,
        data: transformedData,
        meta: {
          cached: false,
          executionTime: Date.now() - startTime,
          quotaConsumed: config.quotaWeight
        }
      };

    } catch (error) {
      // Log error
      await this.logError(request, error);

      if (error instanceof ZapinError) {
        return {
          success: false,
          error: {
            code: error.code,
            message: error.message,
            details: error.details
          },
          meta: {
            cached: false,
            executionTime: Date.now() - startTime,
            quotaConsumed: 0
          }
        };
      }

      return {
        success: false,
        error: {
          code: ErrorCodes.INTERNAL_ERROR,
          message: 'Proxy request failed',
          details: error instanceof Error ? error.message : 'Unknown error'
        },
        meta: {
          cached: false,
          executionTime: Date.now() - startTime,
          quotaConsumed: 0
        }
      };
    }
  }

  /**
   * Validate that tenant has access to the specified instance
   */
  private async validateInstanceAccess(tenantId: string, instanceName: string): Promise<void> {
    const instance = await prisma.instance.findFirst({
      where: {
        evolutionInstanceId: instanceName,
        tenantId: tenantId,
        isActive: true
      }
    });

    if (!instance) {
      throw new ZapinError(
        ErrorCodes.INSTANCE_ACCESS_DENIED,
        'Instance not found or access denied',
        403
      );
    }
  }

  /**
   * Generate cache key for request
   */
  private generateCacheKey(request: ProxyRequest): string {
    const parts = [
      request.endpointKey,
      request.instanceName || '',
      JSON.stringify(request.query || {}),
      JSON.stringify(request.params || {})
    ];
    return `proxy:${parts.join(':')}`;
  }

  /**
   * Get data from cache
   */
  private async getFromCache(key: string): Promise<any | null> {
    try {
      const cached = await redis.get(key);
      return cached ? JSON.parse(cached) : null;
    } catch (error) {
      // Log cache error but don't fail the request
      console.error('Cache get error:', error);
      return null;
    }
  }

  /**
   * Set data in cache
   */
  private async setCache(key: string, data: any, ttl: number): Promise<void> {
    try {
      await redis.setex(key, ttl, JSON.stringify(data));
    } catch (error) {
      // Log cache error but don't fail the request
      console.error('Cache set error:', error);
    }
  }

  /**
   * Make request to Evolution API
   */
  private async makeEvolutionRequest(
    path: string,
    method: string,
    body?: any
  ): Promise<any> {
    const baseUrl = process.env.EVOLUTION_API_BASE_URL || 'https://core.zapin.tech/v2';
    const globalApiKey = process.env.EVOLUTION_GLOBAL_API_KEY;

    if (!globalApiKey) {
      throw new ZapinError(
        ErrorCodes.EVOLUTION_API_ERROR,
        'Evolution API key not configured',
        500
      );
    }

    const url = `${baseUrl}${path}`;
    const headers = {
      'Content-Type': 'application/json',
      'apikey': globalApiKey,
    };

    let lastError: Error;
    
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.timeout);

        const response = await fetch(url, {
          method,
          headers,
          body: body ? JSON.stringify(body) : undefined,
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new ZapinError(
            ErrorCodes.EVOLUTION_API_ERROR,
            `Evolution API error: ${response.status} - ${errorData.message || response.statusText}`,
            response.status,
            errorData
          );
        }

        return await response.json();
      } catch (error) {
        lastError = error as Error;
        
        if (error instanceof ZapinError) {
          throw error;
        }

        if (error instanceof Error && error.name === 'AbortError') {
          throw new ZapinError(
            ErrorCodes.EVOLUTION_API_TIMEOUT,
            'Evolution API request timeout',
            408
          );
        }

        if (attempt === this.maxRetries) {
          throw new ZapinError(
            ErrorCodes.EVOLUTION_API_UNAVAILABLE,
            `Evolution API unavailable after ${this.maxRetries} attempts: ${lastError.message}`,
            503
          );
        }

        // Wait before retry with exponential backoff
        await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
      }
    }

    throw lastError!;
  }

  /**
   * Log API usage for analytics
   */
  private async logUsage(
    request: ProxyRequest,
    config: EndpointConfig,
    response: any
  ): Promise<void> {
    try {
      const instanceId = request.instanceName ? await this.getInstanceId(request.tenantId, request.instanceName) : undefined;
      
      if (!instanceId && config.requiresInstance) {
        // Skip logging if instance is required but not found
        return;
      }

      await prisma.messageLog.create({
        data: {
          tenantId: request.tenantId,
          instanceId: instanceId || '', // Use empty string as fallback since it's required
          endpoint: request.endpointKey,
          method: config.method,
          status: 'SENT', // Use valid MessageStatus enum value
          phoneNumber: this.extractPhoneNumber(request.body),
          content: request.body ? JSON.stringify(request.body) : null,
          metadata: {
            quotaConsumed: config.quotaWeight,
            responseData: response,
            userId: request.userId,
            apiKeyId: request.apiKeyId
          }
        }
      });
    } catch (error) {
      // Log error but don't fail the request
      console.error('Usage logging error:', error);
    }
  }

  /**
   * Log API errors
   */
  private async logError(request: ProxyRequest, error: any): Promise<void> {
    try {
      const instanceId = request.instanceName ? await this.getInstanceId(request.tenantId, request.instanceName) : undefined;
      
      await prisma.messageLog.create({
        data: {
          tenantId: request.tenantId,
          instanceId: instanceId || '', // Use empty string as fallback
          endpoint: request.endpointKey,
          method: 'POST', // Default method
          status: 'FAILED', // Use valid MessageStatus enum value
          phoneNumber: this.extractPhoneNumber(request.body),
          content: request.body ? JSON.stringify(request.body) : null,
          metadata: {
            error: error instanceof Error ? error.message : 'Unknown error',
            userId: request.userId,
            apiKeyId: request.apiKeyId
          }
        }
      });
    } catch (logError) {
      // Log error but don't fail the request
      console.error('Error logging error:', logError);
    }
  }

  /**
   * Extract phone number from request body for logging
   */
  private extractPhoneNumber(body: any): string | null {
    if (!body) return null;
    
    // Try common phone number fields
    return body.number || body.recipient || body.phoneNumber || null;
  }

  /**
   * Get instance ID from instance name
   */
  private async getInstanceId(tenantId: string, instanceName: string): Promise<string | null> {
    try {
      const instance = await prisma.instance.findFirst({
        where: {
          evolutionInstanceId: instanceName,
          tenantId: tenantId
        },
        select: { id: true }
      });
      return instance?.id || null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Get all available endpoints
   */
  getAvailableEndpoints(): Record<string, EndpointConfig> {
    return EVOLUTION_ENDPOINTS;
  }

  /**
   * Get endpoint configuration by key
   */
  getEndpointConfig(endpointKey: string): EndpointConfig | null {
    return EVOLUTION_ENDPOINTS[endpointKey] || null;
  }

  /**
   * Validate endpoint exists and is accessible
   */
  validateEndpoint(endpointKey: string, method: string): boolean {
    const config = EVOLUTION_ENDPOINTS[endpointKey];
    return config && config.method === method;
  }
}

// Singleton instance
export const proxyService = new ProxyService();
      