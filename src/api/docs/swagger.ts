import { FastifyInstance } from 'fastify';
import { EVOLUTION_ENDPOINTS } from '../../services/proxyService';

export const swaggerOptions = {
  swagger: {
    info: {
      title: 'Zapin Evolution API Proxy',
      description: `
# Zapin Evolution API Proxy

A comprehensive WhatsApp API proxy service built on top of Evolution API v2.2.x, providing:

- **Multi-tenant isolation** - Secure tenant-based access control
- **Quota management** - Built-in rate limiting and usage tracking
- **Universal proxy** - Complete coverage of all Evolution API endpoints
- **Caching & Performance** - Intelligent caching for improved response times
- **Usage analytics** - Detailed logging and metrics collection
- **Security** - JWT and API key authentication with permission scopes

## Authentication

This API supports two authentication methods:

### 1. JWT Bearer Token
For user-based authentication (dashboard access):
\`\`\`
Authorization: Bearer <jwt_token>
\`\`\`

### 2. API Key
For programmatic access:
\`\`\`
Authorization: Bearer <api_key>
\`\`\`

## Rate Limiting

All endpoints are subject to rate limiting based on your plan:

- **Basic Plan**: 100 messages/hour, 500 API calls/hour
- **Pro Plan**: 1,000 messages/hour, 5,000 API calls/hour  
- **Enterprise Plan**: 10,000 messages/hour, 50,000 API calls/hour

Rate limit information is included in response headers:
- \`X-RateLimit-Limit-Hourly\`: Hourly limit
- \`X-RateLimit-Remaining-Hourly\`: Remaining requests this hour
- \`X-RateLimit-Reset-Hourly\`: Unix timestamp when limit resets

## Error Handling

All errors follow a consistent format:

\`\`\`json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human readable error message",
    "details": {}
  }
}
\`\`\`

Common error codes:
- \`UNAUTHORIZED\`: Invalid or missing authentication
- \`QUOTA_EXCEEDED\`: Rate limit exceeded
- \`INSTANCE_NOT_FOUND\`: WhatsApp instance not found
- \`VALIDATION_ERROR\`: Request validation failed
- \`EVOLUTION_API_ERROR\`: Upstream Evolution API error

## Quota Information

Successful responses include quota information in the \`meta\` field:

\`\`\`json
{
  "success": true,
  "data": {},
  "meta": {
    "cached": false,
    "executionTime": 150,
    "quotaConsumed": 1
  }
}
\`\`\`

## Instance Management

Before sending messages, you need to create and connect a WhatsApp instance:

1. **Create Instance**: \`POST /api/v1/instances/create\`
2. **Connect Instance**: \`GET /api/v1/instances/{instanceName}/connect\`
3. **Check Connection**: \`GET /api/v1/instances/{instanceName}/connection-state\`

## Message Types

The API supports all WhatsApp message types:

- **Text Messages**: Simple text with optional mentions
- **Media Messages**: Images, videos, audio, documents
- **Location Messages**: GPS coordinates with optional details
- **Contact Messages**: vCard contact sharing
- **Interactive Messages**: Buttons, lists, polls
- **Stickers**: Animated and static stickers
- **Reactions**: Emoji reactions to messages

## Webhook Events

Configure webhooks to receive real-time updates:

- \`messages.upsert\`: New messages received/sent
- \`messages.update\`: Message status changes
- \`connection.update\`: Connection status changes
- \`presence.update\`: Contact online/offline status
- \`groups.update\`: Group information changes

## Bot Integration

Integrate with popular bot platforms:

- **Typebot**: Visual chatbot builder integration
- **OpenAI**: GPT-powered conversational AI
- **Custom Webhooks**: Build your own bot logic

## SDKs and Libraries

Official SDKs available for:
- JavaScript/Node.js
- Python
- PHP
- Go
- Java

## Support

- **Documentation**: https://docs.zapin.tech
- **Support**: support@zapin.tech
- **Status Page**: https://status.zapin.tech
      `,
      version: '1.0.0',
      contact: {
        name: 'Zapin Support',
        email: 'support@zapin.tech',
        url: 'https://zapin.tech'
      },
      license: {
        name: 'MIT',
        url: 'https://opensource.org/licenses/MIT'
      }
    },
    host: process.env.API_HOST || 'api.zapin.tech',
    schemes: ['https', 'http'],
    consumes: ['application/json'],
    produces: ['application/json'],
    securityDefinitions: {
      bearerAuth: {
        type: 'apiKey',
        name: 'Authorization',
        in: 'header',
        description: 'Enter your JWT token or API key in the format: Bearer <token>'
      }
    },
    security: [
      { bearerAuth: [] }
    ],
    tags: [
      {
        name: 'system',
        description: 'System endpoints for health checks and information'
      },
      {
        name: 'instances',
        description: 'WhatsApp instance management'
      },
      {
        name: 'messages',
        description: 'Message sending and management'
      },
      {
        name: 'chats',
        description: 'Chat and contact management'
      },
      {
        name: 'groups',
        description: 'WhatsApp group management'
      },
      {
        name: 'bots',
        description: 'Bot and webhook configuration'
      },
      {
        name: 'proxy',
        description: 'Universal proxy endpoints'
      }
    ],
    definitions: {
      Error: {
        type: 'object',
        required: ['success', 'error'],
        properties: {
          success: {
            type: 'boolean',
            example: false
          },
          error: {
            type: 'object',
            required: ['code', 'message'],
            properties: {
              code: {
                type: 'string',
                example: 'VALIDATION_ERROR'
              },
              message: {
                type: 'string',
                example: 'Request validation failed'
              },
              details: {
                type: 'object',
                description: 'Additional error details'
              }
            }
          }
        }
      },
      Success: {
        type: 'object',
        required: ['success'],
        properties: {
          success: {
            type: 'boolean',
            example: true
          },
          data: {
            type: 'object',
            description: 'Response data'
          },
          meta: {
            type: 'object',
            properties: {
              cached: {
                type: 'boolean',
                description: 'Whether response was served from cache'
              },
              executionTime: {
                type: 'number',
                description: 'Request execution time in milliseconds'
              },
              quotaConsumed: {
                type: 'number',
                description: 'Quota units consumed by this request'
              }
            }
          }
        }
      },
      QuotaInfo: {
        type: 'object',
        properties: {
          hourly: {
            type: 'object',
            properties: {
              remaining: { type: 'number' },
              limit: { type: 'number' },
              resetAt: { type: 'string', format: 'date-time' }
            }
          },
          daily: {
            type: 'object',
            properties: {
              remaining: { type: 'number' },
              limit: { type: 'number' },
              resetAt: { type: 'string', format: 'date-time' }
            }
          },
          monthly: {
            type: 'object',
            properties: {
              remaining: { type: 'number' },
              limit: { type: 'number' },
              resetAt: { type: 'string', format: 'date-time' }
            }
          }
        }
      },
      MessageKey: {
        type: 'object',
        required: ['id'],
        properties: {
          id: {
            type: 'string',
            description: 'Message ID'
          },
          fromMe: {
            type: 'boolean',
            description: 'Whether message was sent by this instance'
          },
          remoteJid: {
            type: 'string',
            description: 'Chat/contact ID'
          }
        }
      },
      Contact: {
        type: 'object',
        required: ['fullName', 'wuid', 'phoneNumber'],
        properties: {
          fullName: {
            type: 'string',
            description: 'Contact full name'
          },
          wuid: {
            type: 'string',
            description: 'WhatsApp user ID'
          },
          phoneNumber: {
            type: 'string',
            description: 'Phone number with country code'
          },
          organization: {
            type: 'string',
            description: 'Organization name'
          },
          email: {
            type: 'string',
            format: 'email',
            description: 'Email address'
          },
          url: {
            type: 'string',
            format: 'uri',
            description: 'Website URL'
          }
        }
      },
      InstanceInfo: {
        type: 'object',
        properties: {
          instanceName: {
            type: 'string',
            description: 'Instance name'
          },
          status: {
            type: 'string',
            enum: ['open', 'connecting', 'close'],
            description: 'Connection status'
          },
          serverUrl: {
            type: 'string',
            description: 'Evolution API server URL'
          },
          profileName: {
            type: 'string',
            description: 'WhatsApp profile name'
          },
          profilePictureUrl: {
            type: 'string',
            description: 'Profile picture URL'
          },
          phoneNumber: {
            type: 'string',
            description: 'Connected phone number'
          }
        }
      }
    }
  }
};

export const swaggerUiOptions = {
  routePrefix: '/docs',
  uiConfig: {
    docExpansion: 'list',
    deepLinking: true,
    defaultModelsExpandDepth: 2,
    defaultModelExpandDepth: 2,
    displayOperationId: false,
    displayRequestDuration: true,
    filter: true,
    showExtensions: true,
    showCommonExtensions: true,
    tryItOutEnabled: true
  },
  uiHooks: {
    onRequest: function (request: any, reply: any, next: any) {
      next();
    },
    preHandler: function (request: any, reply: any, next: any) {
      next();
    }
  },
  staticCSP: true,
  transformStaticCSP: (header: string) => header,
  exposeRoute: true
};

/**
 * Generate endpoint documentation from Evolution API mapping
 */
export function generateEndpointDocs() {
  const endpointDocs: Record<string, any> = {};

  Object.entries(EVOLUTION_ENDPOINTS).forEach(([key, config]) => {
    const category = key.split('.')[0];
    const operation = key.split('.')[1];
    
    endpointDocs[key] = {
      summary: `${operation} - ${category}`,
      description: getEndpointDescription(key),
      tags: [category],
      security: [{ bearerAuth: [] }],
      parameters: config.requiresInstance ? [
        {
          name: 'instanceName',
          in: 'path',
          required: true,
          type: 'string',
          description: 'WhatsApp instance name'
        }
      ] : [],
      responses: {
        200: {
          description: 'Success',
          schema: { $ref: '#/definitions/Success' }
        },
        400: {
          description: 'Bad Request',
          schema: { $ref: '#/definitions/Error' }
        },
        401: {
          description: 'Unauthorized',
          schema: { $ref: '#/definitions/Error' }
        },
        403: {
          description: 'Forbidden',
          schema: { $ref: '#/definitions/Error' }
        },
        429: {
          description: 'Rate Limited',
          schema: {
            allOf: [
              { $ref: '#/definitions/Error' },
              {
                type: 'object',
                properties: {
                  quota: { $ref: '#/definitions/QuotaInfo' }
                }
              }
            ]
          }
        },
        500: {
          description: 'Internal Server Error',
          schema: { $ref: '#/definitions/Error' }
        }
      },
      'x-quota-weight': config.quotaWeight,
      'x-quota-type': config.quotaType,
      'x-cacheable': config.cacheable,
      'x-cache-time': config.cacheTime || 0
    };

    // Add request body schema for POST/PUT methods
    if (['POST', 'PUT'].includes(config.method) && config.validation) {
      endpointDocs[key].parameters.push({
        name: 'body',
        in: 'body',
        required: true,
        schema: {
          type: 'object',
          description: 'Request payload'
        }
      });
    }
  });

  return endpointDocs;
}

function getEndpointDescription(endpointKey: string): string {
  const descriptions: Record<string, string> = {
    // Instance management
    'instance.create': 'Create a new WhatsApp instance with optional webhook and settings configuration',
    'instance.fetchInstances': 'Retrieve all WhatsApp instances associated with your account',
    'instance.connect': 'Initiate connection to WhatsApp for the specified instance',
    'instance.connectionState': 'Get current connection status and QR code if needed',
    'instance.restart': 'Restart a WhatsApp instance to resolve connection issues',
    'instance.delete': 'Permanently delete a WhatsApp instance and all associated data',
    'instance.logout': 'Logout instance from WhatsApp without deleting it',
    'instance.settings': 'Update instance behavior settings like auto-read, call rejection, etc.',

    // Message operations
    'message.sendText': 'Send a text message with optional mentions and quoted message',
    'message.sendMedia': 'Send media files (images, videos, audio, documents) with optional caption',
    'message.sendAudio': 'Send audio messages with optional voice encoding',
    'message.sendLocation': 'Send GPS location with optional name and address details',
    'message.sendContact': 'Share contact information as vCard format',
    'message.sendReaction': 'React to a message with emoji',
    'message.sendSticker': 'Send animated or static sticker messages',
    'message.sendPoll': 'Create interactive polls with multiple choice options',
    'message.sendList': 'Send interactive list messages with selectable options',
    'message.sendButton': 'Send messages with interactive buttons',

    // Chat operations
    'chat.fetchChats': 'Get all active chats and conversations',
    'chat.fetchMessages': 'Retrieve message history from a specific chat',
    'chat.markMessageAsRead': 'Mark one or more messages as read',
    'chat.archiveChat': 'Archive or unarchive a chat conversation',
    'chat.deleteMessage': 'Delete a message from chat (for everyone or just you)',
    'chat.fetchProfile': 'Get contact profile information and status',
    'chat.updateProfileName': 'Update your WhatsApp profile display name',
    'chat.updateProfileStatus': 'Update your WhatsApp status message',
    'chat.updateProfilePicture': 'Update your profile picture',
    'chat.removeProfilePicture': 'Remove your current profile picture',
    'chat.fetchProfilePicture': 'Get profile picture URL for any contact',
    'chat.fetchContacts': 'Get all contacts from your WhatsApp',
    'chat.whatsappNumbers': 'Check which phone numbers have WhatsApp accounts',
    'chat.updatePrivacySettings': 'Configure privacy settings for profile, status, etc.',
    'chat.fetchPrivacySettings': 'Get current privacy settings configuration',
    'chat.updateBusinessProfile': 'Update WhatsApp Business profile information',
    'chat.fetchBusinessProfile': 'Get WhatsApp Business profile details',

    // Group operations
    'group.create': 'Create a new WhatsApp group with participants',
    'group.fetchGroupInfo': 'Get detailed information about a group',
    'group.updateGroupSubject': 'Change group name/subject',
    'group.updateGroupDescription': 'Update group description',
    'group.updateGroupPicture': 'Change group profile picture',
    'group.addParticipant': 'Add new members to a group',
    'group.removeParticipant': 'Remove members from a group',
    'group.promoteParticipant': 'Promote members to group admin',
    'group.demoteParticipant': 'Remove admin privileges from members',
    'group.leaveGroup': 'Leave a group conversation',
    'group.updateGroupSettings': 'Configure group settings (who can send messages, edit info)',
    'group.inviteCode': 'Get group invite link',
    'group.revokeInviteCode': 'Generate new invite link (invalidate old one)',

    // Bot management
    'typebot.set': 'Configure Typebot chatbot integration for automated conversations',
    'typebot.find': 'Get current Typebot configuration and status',
    'openaibot.set': 'Configure OpenAI GPT bot for AI-powered conversations',
    'openaibot.find': 'Get current OpenAI bot configuration and status',

    // Webhook management
    'webhook.set': 'Configure webhook URL to receive real-time events',
    'webhook.find': 'Get current webhook configuration and event subscriptions'
  };

  return descriptions[endpointKey] || 'Evolution API endpoint';
}

export async function registerSwagger(fastify: FastifyInstance) {
  // Register Swagger
  await fastify.register(require('@fastify/swagger'), swaggerOptions);
  
  // Register Swagger UI
  await fastify.register(require('@fastify/swagger-ui'), swaggerUiOptions);

  // Add custom route for API specification
  fastify.get('/api-spec', async (request, reply) => {
    return (fastify as any).swagger();
  });

  // Add route for endpoint documentation
  fastify.get('/endpoints-docs', async (request, reply) => {
    return {
      endpoints: generateEndpointDocs(),
      totalEndpoints: Object.keys(EVOLUTION_ENDPOINTS).length,
      categories: [...new Set(Object.keys(EVOLUTION_ENDPOINTS).map(key => key.split('.')[0]))]
    };
  });
}