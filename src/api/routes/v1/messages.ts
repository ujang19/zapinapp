import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { proxyService, ProxyRequest } from '../../../services/proxyService';
import { ZapinError, ErrorCodes } from '../../../types';
import { z } from 'zod';

// Request validation schemas
const SendTextMessageSchema = z.object({
  instanceName: z.string().min(1),
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
});

const SendMediaMessageSchema = z.object({
  instanceName: z.string().min(1),
  number: z.string().min(1),
  mediatype: z.enum(['image', 'video', 'audio', 'document']),
  media: z.string().min(1),
  caption: z.string().optional(),
  fileName: z.string().optional(),
  delay: z.number().optional()
});

const SendLocationMessageSchema = z.object({
  instanceName: z.string().min(1),
  number: z.string().min(1),
  latitude: z.number(),
  longitude: z.number(),
  name: z.string().optional(),
  address: z.string().optional()
});

const SendContactMessageSchema = z.object({
  instanceName: z.string().min(1),
  number: z.string().min(1),
  contact: z.object({
    fullName: z.string(),
    wuid: z.string(),
    phoneNumber: z.string(),
    organization: z.string().optional(),
    email: z.string().email().optional(),
    url: z.string().url().optional()
  })
});

const SendReactionSchema = z.object({
  instanceName: z.string().min(1),
  reactionMessage: z.object({
    key: z.object({
      id: z.string()
    }),
    reaction: z.string()
  })
});

const SendStickerSchema = z.object({
  instanceName: z.string().min(1),
  number: z.string().min(1),
  sticker: z.string().min(1),
  delay: z.number().optional()
});

const SendPollSchema = z.object({
  instanceName: z.string().min(1),
  number: z.string().min(1),
  name: z.string().min(1),
  selectableCount: z.number().min(1),
  values: z.array(z.string()).min(2)
});

const SendListSchema = z.object({
  instanceName: z.string().min(1),
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
});

const SendButtonSchema = z.object({
  instanceName: z.string().min(1),
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
});

export default async function messageRoutes(fastify: FastifyInstance) {
  
  // POST /messages/send-text - Send text message
  fastify.post('/send-text', {
    schema: {
      description: 'Send a text message',
      tags: ['messages'],
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        required: ['instanceName', 'number', 'text'],
        properties: {
          instanceName: { type: 'string', description: 'Instance name' },
          number: { type: 'string', description: 'Recipient phone number' },
          text: { type: 'string', maxLength: 4096, description: 'Message text' },
          delay: { type: 'number', description: 'Delay in milliseconds' },
          quoted: {
            type: 'object',
            properties: {
              key: {
                type: 'object',
                properties: {
                  id: { type: 'string' }
                }
              }
            }
          },
          mentionsEveryOne: { type: 'boolean' },
          mentioned: { type: 'array', items: { type: 'string' } }
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
      const validatedData = SendTextMessageSchema.parse(request.body);
      
      const proxyRequest: ProxyRequest = {
        endpointKey: 'message.sendText',
        instanceName: validatedData.instanceName,
        body: {
          number: validatedData.number,
          text: validatedData.text,
          delay: validatedData.delay,
          quoted: validatedData.quoted,
          mentionsEveryOne: validatedData.mentionsEveryOne,
          mentioned: validatedData.mentioned
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

  // POST /messages/send-media - Send media message
  fastify.post('/send-media', {
    schema: {
      description: 'Send a media message (image, video, audio, document)',
      tags: ['messages'],
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        required: ['instanceName', 'number', 'mediatype', 'media'],
        properties: {
          instanceName: { type: 'string' },
          number: { type: 'string' },
          mediatype: { type: 'string', enum: ['image', 'video', 'audio', 'document'] },
          media: { type: 'string', description: 'Base64 encoded media or URL' },
          caption: { type: 'string' },
          fileName: { type: 'string' },
          delay: { type: 'number' }
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const validatedData = SendMediaMessageSchema.parse(request.body);
      
      const proxyRequest: ProxyRequest = {
        endpointKey: 'message.sendMedia',
        instanceName: validatedData.instanceName,
        body: {
          number: validatedData.number,
          mediatype: validatedData.mediatype,
          media: validatedData.media,
          caption: validatedData.caption,
          fileName: validatedData.fileName,
          delay: validatedData.delay
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

  // POST /messages/send-location - Send location message
  fastify.post('/send-location', {
    schema: {
      description: 'Send a location message',
      tags: ['messages'],
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        required: ['instanceName', 'number', 'latitude', 'longitude'],
        properties: {
          instanceName: { type: 'string' },
          number: { type: 'string' },
          latitude: { type: 'number' },
          longitude: { type: 'number' },
          name: { type: 'string' },
          address: { type: 'string' }
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const validatedData = SendLocationMessageSchema.parse(request.body);
      
      const proxyRequest: ProxyRequest = {
        endpointKey: 'message.sendLocation',
        instanceName: validatedData.instanceName,
        body: {
          number: validatedData.number,
          latitude: validatedData.latitude,
          longitude: validatedData.longitude,
          name: validatedData.name,
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

  // POST /messages/send-contact - Send contact message
  fastify.post('/send-contact', {
    schema: {
      description: 'Send a contact message',
      tags: ['messages'],
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        required: ['instanceName', 'number', 'contact'],
        properties: {
          instanceName: { type: 'string' },
          number: { type: 'string' },
          contact: {
            type: 'object',
            required: ['fullName', 'wuid', 'phoneNumber'],
            properties: {
              fullName: { type: 'string' },
              wuid: { type: 'string' },
              phoneNumber: { type: 'string' },
              organization: { type: 'string' },
              email: { type: 'string', format: 'email' },
              url: { type: 'string', format: 'uri' }
            }
          }
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const validatedData = SendContactMessageSchema.parse(request.body);
      
      const proxyRequest: ProxyRequest = {
        endpointKey: 'message.sendContact',
        instanceName: validatedData.instanceName,
        body: {
          number: validatedData.number,
          contact: validatedData.contact
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

  // POST /messages/send-reaction - Send reaction
  fastify.post('/send-reaction', {
    schema: {
      description: 'Send a reaction to a message',
      tags: ['messages'],
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        required: ['instanceName', 'reactionMessage'],
        properties: {
          instanceName: { type: 'string' },
          reactionMessage: {
            type: 'object',
            required: ['key', 'reaction'],
            properties: {
              key: {
                type: 'object',
                required: ['id'],
                properties: {
                  id: { type: 'string' }
                }
              },
              reaction: { type: 'string' }
            }
          }
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const validatedData = SendReactionSchema.parse(request.body);
      
      const proxyRequest: ProxyRequest = {
        endpointKey: 'message.sendReaction',
        instanceName: validatedData.instanceName,
        body: {
          reactionMessage: validatedData.reactionMessage
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

  // POST /messages/send-sticker - Send sticker
  fastify.post('/send-sticker', {
    schema: {
      description: 'Send a sticker message',
      tags: ['messages'],
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        required: ['instanceName', 'number', 'sticker'],
        properties: {
          instanceName: { type: 'string' },
          number: { type: 'string' },
          sticker: { type: 'string', description: 'Base64 encoded sticker or URL' },
          delay: { type: 'number' }
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const validatedData = SendStickerSchema.parse(request.body);
      
      const proxyRequest: ProxyRequest = {
        endpointKey: 'message.sendSticker',
        instanceName: validatedData.instanceName,
        body: {
          number: validatedData.number,
          sticker: validatedData.sticker,
          delay: validatedData.delay
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

  // POST /messages/send-poll - Send poll
  fastify.post('/send-poll', {
    schema: {
      description: 'Send a poll message',
      tags: ['messages'],
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        required: ['instanceName', 'number', 'name', 'selectableCount', 'values'],
        properties: {
          instanceName: { type: 'string' },
          number: { type: 'string' },
          name: { type: 'string' },
          selectableCount: { type: 'number', minimum: 1 },
          values: { type: 'array', items: { type: 'string' }, minItems: 2 }
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const validatedData = SendPollSchema.parse(request.body);
      
      const proxyRequest: ProxyRequest = {
        endpointKey: 'message.sendPoll',
        instanceName: validatedData.instanceName,
        body: {
          number: validatedData.number,
          name: validatedData.name,
          selectableCount: validatedData.selectableCount,
          values: validatedData.values
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

  // POST /messages/send-list - Send list message
  fastify.post('/send-list', {
    schema: {
      description: 'Send a list message',
      tags: ['messages'],
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        required: ['instanceName', 'number', 'title', 'buttonText', 'sections'],
        properties: {
          instanceName: { type: 'string' },
          number: { type: 'string' },
          title: { type: 'string' },
          description: { type: 'string' },
          buttonText: { type: 'string' },
          footerText: { type: 'string' },
          sections: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                title: { type: 'string' },
                rows: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      title: { type: 'string' },
                      description: { type: 'string' },
                      rowId: { type: 'string' }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const validatedData = SendListSchema.parse(request.body);
      
      const proxyRequest: ProxyRequest = {
        endpointKey: 'message.sendList',
        instanceName: validatedData.instanceName,
        body: {
          number: validatedData.number,
          title: validatedData.title,
          description: validatedData.description,
          buttonText: validatedData.buttonText,
          footerText: validatedData.footerText,
          sections: validatedData.sections
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

  // POST /messages/send-button - Send button message
  fastify.post('/send-button', {
    schema: {
      description: 'Send a button message',
      tags: ['messages'],
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        required: ['instanceName', 'number', 'text', 'buttons'],
        properties: {
          instanceName: { type: 'string' },
          number: { type: 'string' },
          text: { type: 'string' },
          buttons: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                buttonId: { type: 'string' },
                buttonText: {
                  type: 'object',
                  properties: {
                    displayText: { type: 'string' }
                  }
                },
                type: { type: 'number' }
              }
            }
          },
          headerText: { type: 'string' },
          footerText: { type: 'string' }
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const validatedData = SendButtonSchema.parse(request.body);
      
      const proxyRequest: ProxyRequest = {
        endpointKey: 'message.sendButton',
        instanceName: validatedData.instanceName,
        body: {
          number: validatedData.number,
          text: validatedData.text,
          buttons: validatedData.buttons,
          headerText: validatedData.headerText,
          footerText: validatedData.footerText
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