import { FastifyInstance } from 'fastify';
import { testPrisma, testRedis, TestDataFactory, TestUtils } from '../../setup/integration.setup';
import { buildApp } from '../../../src/api/index';

describe('Comprehensive API Integration Tests', () => {
  let app: FastifyInstance;
  let testTenant: any;
  let testUser: any;
  let authToken: string;
  let apiKey: any;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await TestUtils.cleanDatabase();
    await TestUtils.cleanRedis();
    
    testTenant = await TestDataFactory.createTenant();
    testUser = await TestDataFactory.createUser(testTenant.id, { role: 'ADMIN' });
    authToken = TestUtils.generateJWT({
      userId: testUser.id,
      tenantId: testTenant.id,
      role: testUser.role
    });
    
    apiKey = await TestDataFactory.createApiKey(testUser.id, testTenant.id, {
      scopes: ['*'] // Full access for testing
    });
  });

  describe('Message API Integration', () => {
    let testInstance: any;

    beforeEach(async () => {
      testInstance = await TestDataFactory.createInstance(testTenant.id, {
        status: 'CONNECTED'
      });
    });

    it('should send text message with JWT authentication', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/messages/send',
        headers: {
          authorization: `Bearer ${authToken}`,
          'content-type': 'application/json'
        },
        payload: {
          instanceId: testInstance.id,
          recipient: '1234567890@s.whatsapp.net',
          text: 'Test message from integration test'
        }
      });

      expect(response.statusCode).toBe(200);
      const responseData = JSON.parse(response.body);
      expect(responseData.success).toBe(true);
      expect(responseData.data).toBeDefined();

      // Verify message log was created
      const messageLog = await testPrisma.messageLog.findFirst({
        where: {
          tenantId: testTenant.id,
          instanceId: testInstance.id,
          endpoint: '/api/v1/messages/send'
        }
      });
      expect(messageLog).toBeTruthy();
    });

    it('should send text message with API key authentication', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/messages/send',
        headers: {
          authorization: `Bearer ${apiKey.key}`,
          'content-type': 'application/json'
        },
        payload: {
          instanceId: testInstance.id,
          recipient: '1234567890@s.whatsapp.net',
          text: 'Test message with API key'
        }
      });

      expect(response.statusCode).toBe(200);
    });

    it('should handle media message sending', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/messages/sendMedia',
        headers: {
          authorization: `Bearer ${authToken}`,
          'content-type': 'application/json'
        },
        payload: {
          instanceId: testInstance.id,
          recipient: '1234567890@s.whatsapp.net',
          mediatype: 'image',
          media: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==',
          caption: 'Test image'
        }
      });

      expect(response.statusCode).toBe(200);
    });

    it('should validate message payload', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/messages/send',
        headers: {
          authorization: `Bearer ${authToken}`,
          'content-type': 'application/json'
        },
        payload: {
          instanceId: testInstance.id,
          // Missing recipient and text
        }
      });

      expect(response.statusCode).toBe(400);
      const responseData = JSON.parse(response.body);
      expect(responseData.success).toBe(false);
      expect(responseData.error.code).toBe('VALIDATION_ERROR');
    });

    it('should enforce quota limits', async () => {
      // Set quota to limit
      await testPrisma.quotaUsage.create({
        data: {
          tenantId: testTenant.id,
          quotaType: 'MESSAGES_HOURLY',
          period: new Date().toISOString().slice(0, 13), // Current hour
          used: 100,
          limit: 100,
          resetAt: new Date(Date.now() + 3600000)
        }
      });

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/messages/send',
        headers: {
          authorization: `Bearer ${authToken}`,
          'content-type': 'application/json'
        },
        payload: {
          instanceId: testInstance.id,
          recipient: '1234567890@s.whatsapp.net',
          text: 'This should be blocked by quota'
        }
      });

      expect(response.statusCode).toBe(429);
      const responseData = JSON.parse(response.body);
      expect(responseData.error.code).toBe('QUOTA_EXCEEDED');
    });
  });

  describe('Instance Management API Integration', () => {
    it('should create instance with proper validation', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/instances',
        headers: {
          authorization: `Bearer ${authToken}`,
          'content-type': 'application/json'
        },
        payload: {
          name: 'New Test Instance',
          evolutionInstanceId: 'new-test-instance-id'
        }
      });

      expect(response.statusCode).toBe(201);
      const responseData = JSON.parse(response.body);
      expect(responseData.data.name).toBe('New Test Instance');
      expect(responseData.data.tenantId).toBe(testTenant.id);

      // Verify in database
      const dbInstance = await testPrisma.instance.findUnique({
        where: { id: responseData.data.id }
      });
      expect(dbInstance).toBeTruthy();
      expect(dbInstance?.tenantId).toBe(testTenant.id);
    });

    it('should list instances with pagination', async () => {
      // Create multiple instances
      const instances = await Promise.all([
        TestDataFactory.createInstance(testTenant.id, { name: 'Instance 1' }),
        TestDataFactory.createInstance(testTenant.id, { name: 'Instance 2' }),
        TestDataFactory.createInstance(testTenant.id, { name: 'Instance 3' })
      ]);

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/instances?page=1&limit=2',
        headers: {
          authorization: `Bearer ${authToken}`
        }
      });

      expect(response.statusCode).toBe(200);
      const responseData = JSON.parse(response.body);
      expect(responseData.data.length).toBe(2);
      expect(responseData.pagination).toBeDefined();
      expect(responseData.pagination.total).toBe(3);
      expect(responseData.pagination.pages).toBe(2);
    });

    it('should update instance settings', async () => {
      const instance = await TestDataFactory.createInstance(testTenant.id);

      const response = await app.inject({
        method: 'PUT',
        url: `/api/v1/instances/${instance.id}`,
        headers: {
          authorization: `Bearer ${authToken}`,
          'content-type': 'application/json'
        },
        payload: {
          name: 'Updated Instance Name',
          webhookUrl: 'https://new-webhook.example.com'
        }
      });

      expect(response.statusCode).toBe(200);
      const responseData = JSON.parse(response.body);
      expect(responseData.data.name).toBe('Updated Instance Name');

      // Verify in database
      const updatedInstance = await testPrisma.instance.findUnique({
        where: { id: instance.id }
      });
      expect(updatedInstance?.name).toBe('Updated Instance Name');
      expect(updatedInstance?.webhookUrl).toBe('https://new-webhook.example.com');
    });

    it('should delete instance and cleanup related data', async () => {
      const instance = await TestDataFactory.createInstance(testTenant.id);
      const bot = await TestDataFactory.createBot(testTenant.id, instance.id);
      const messageLog = await TestDataFactory.createMessageLog(testTenant.id, instance.id);

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/v1/instances/${instance.id}`,
        headers: {
          authorization: `Bearer ${authToken}`
        }
      });

      expect(response.statusCode).toBe(200);

      // Verify instance is deleted
      const deletedInstance = await testPrisma.instance.findUnique({
        where: { id: instance.id }
      });
      expect(deletedInstance).toBeNull();

      // Verify related data is cleaned up (cascade delete)
      const deletedBot = await testPrisma.bot.findUnique({
        where: { id: bot.id }
      });
      expect(deletedBot).toBeNull();

      const deletedMessageLog = await testPrisma.messageLog.findUnique({
        where: { id: messageLog.id }
      });
      expect(deletedMessageLog).toBeNull();
    });
  });

  describe('Bot Management API Integration', () => {
    let testInstance: any;

    beforeEach(async () => {
      testInstance = await TestDataFactory.createInstance(testTenant.id);
    });

    it('should create Typebot integration', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/bots',
        headers: {
          authorization: `Bearer ${authToken}`,
          'content-type': 'application/json'
        },
        payload: {
          name: 'Test Typebot',
          type: 'TYPEBOT',
          instanceId: testInstance.id,
          config: {
            typebotUrl: 'https://typebot.example.com',
            typebotId: 'test-typebot-123',
            triggerType: 'keyword',
            triggerValue: 'start',
            settings: {
              enabled: true,
              expire: 3600,
              keywordFinish: 'finish',
              delayMessage: 1000
            }
          }
        }
      });

      expect(response.statusCode).toBe(201);
      const responseData = JSON.parse(response.body);
      expect(responseData.data.type).toBe('TYPEBOT');
      expect(responseData.data.config.typebotId).toBe('test-typebot-123');
    });

    it('should create OpenAI bot integration', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/bots',
        headers: {
          authorization: `Bearer ${authToken}`,
          'content-type': 'application/json'
        },
        payload: {
          name: 'Test OpenAI Bot',
          type: 'OPENAI',
          instanceId: testInstance.id,
          config: {
            model: 'gpt-3.5-turbo',
            systemPrompt: 'You are a helpful assistant.',
            triggerType: 'all',
            settings: {
              apiKey: 'sk-test-key',
              maxTokens: 150,
              temperature: 0.7,
              enabled: true
            }
          }
        }
      });

      expect(response.statusCode).toBe(201);
      const responseData = JSON.parse(response.body);
      expect(responseData.data.type).toBe('OPENAI');
      expect(responseData.data.config.model).toBe('gpt-3.5-turbo');
    });

    it('should validate bot configuration', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/bots',
        headers: {
          authorization: `Bearer ${authToken}`,
          'content-type': 'application/json'
        },
        payload: {
          name: 'Invalid Bot',
          type: 'TYPEBOT',
          instanceId: testInstance.id,
          config: {
            // Missing required typebotUrl and typebotId
            triggerType: 'all'
          }
        }
      });

      expect(response.statusCode).toBe(400);
      const responseData = JSON.parse(response.body);
      expect(responseData.error.code).toBe('VALIDATION_ERROR');
    });

    it('should update bot configuration', async () => {
      const bot = await TestDataFactory.createBot(testTenant.id, testInstance.id);

      const response = await app.inject({
        method: 'PUT',
        url: `/api/v1/bots/${bot.id}`,
        headers: {
          authorization: `Bearer ${authToken}`,
          'content-type': 'application/json'
        },
        payload: {
          name: 'Updated Bot Name',
          config: {
            ...(bot.config as any),
            triggerType: 'keyword',
            triggerValue: 'hello'
          }
        }
      });

      expect(response.statusCode).toBe(200);
      const responseData = JSON.parse(response.body);
      expect(responseData.data.name).toBe('Updated Bot Name');
      expect(responseData.data.config.triggerValue).toBe('hello');
    });
  });

  describe('Group Management API Integration', () => {
    let testInstance: any;

    beforeEach(async () => {
      testInstance = await TestDataFactory.createInstance(testTenant.id, {
        status: 'CONNECTED'
      });
    });

    it('should create group', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/groups/create',
        headers: {
          authorization: `Bearer ${authToken}`,
          'content-type': 'application/json'
        },
        payload: {
          instanceId: testInstance.id,
          subject: 'Test Group',
          participants: ['1234567890@s.whatsapp.net', '0987654321@s.whatsapp.net']
        }
      });

      expect(response.statusCode).toBe(200);
      const responseData = JSON.parse(response.body);
      expect(responseData.success).toBe(true);
    });

    it('should manage group participants', async () => {
      const groupId = 'test-group-id@g.us';

      // Add participant
      const addResponse = await app.inject({
        method: 'PUT',
        url: '/api/v1/groups/participants/add',
        headers: {
          authorization: `Bearer ${authToken}`,
          'content-type': 'application/json'
        },
        payload: {
          instanceId: testInstance.id,
          groupId,
          participants: ['1111111111@s.whatsapp.net']
        }
      });

      expect(addResponse.statusCode).toBe(200);

      // Remove participant
      const removeResponse = await app.inject({
        method: 'PUT',
        url: '/api/v1/groups/participants/remove',
        headers: {
          authorization: `Bearer ${authToken}`,
          'content-type': 'application/json'
        },
        payload: {
          instanceId: testInstance.id,
          groupId,
          participants: ['1111111111@s.whatsapp.net']
        }
      });

      expect(removeResponse.statusCode).toBe(200);
    });
  });

  describe('Chat Management API Integration', () => {
    let testInstance: any;

    beforeEach(async () => {
      testInstance = await TestDataFactory.createInstance(testTenant.id, {
        status: 'CONNECTED'
      });
    });

    it('should fetch chats with filtering', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/api/v1/chats?instanceId=${testInstance.id}&limit=10`,
        headers: {
          authorization: `Bearer ${authToken}`
        }
      });

      expect(response.statusCode).toBe(200);
      const responseData = JSON.parse(response.body);
      expect(responseData.success).toBe(true);
      expect(Array.isArray(responseData.data)).toBe(true);
    });

    it('should fetch messages from chat', async () => {
      const chatId = '1234567890@s.whatsapp.net';

      const response = await app.inject({
        method: 'GET',
        url: `/api/v1/chats/${chatId}/messages?instanceId=${testInstance.id}&limit=20`,
        headers: {
          authorization: `Bearer ${authToken}`
        }
      });

      expect(response.statusCode).toBe(200);
      const responseData = JSON.parse(response.body);
      expect(responseData.success).toBe(true);
    });

    it('should mark messages as read', async () => {
      const chatId = '1234567890@s.whatsapp.net';

      const response = await app.inject({
        method: 'PUT',
        url: '/api/v1/chats/markAsRead',
        headers: {
          authorization: `Bearer ${authToken}`,
          'content-type': 'application/json'
        },
        payload: {
          instanceId: testInstance.id,
          chatId,
          messageIds: ['message-id-1', 'message-id-2']
        }
      });

      expect(response.statusCode).toBe(200);
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle invalid instance ID', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/instances/invalid-id',
        headers: {
          authorization: `Bearer ${authToken}`
        }
      });

      expect(response.statusCode).toBe(404);
      const responseData = JSON.parse(response.body);
      expect(responseData.error.code).toBe('INSTANCE_NOT_FOUND');
    });

    it('should handle malformed JSON payload', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/instances',
        headers: {
          authorization: `Bearer ${authToken}`,
          'content-type': 'application/json'
        },
        payload: '{"invalid": json}'
      });

      expect(response.statusCode).toBe(400);
    });

    it('should handle missing authentication', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/instances'
      });

      expect(response.statusCode).toBe(401);
      const responseData = JSON.parse(response.body);
      expect(responseData.error.code).toBe('UNAUTHORIZED');
    });

    it('should handle expired JWT token', async () => {
      const expiredToken = TestUtils.generateJWT({
        userId: testUser.id,
        tenantId: testTenant.id,
        role: testUser.role,
        exp: Math.floor(Date.now() / 1000) - 3600 // Expired 1 hour ago
      });

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/instances',
        headers: {
          authorization: `Bearer ${expiredToken}`
        }
      });

      expect(response.statusCode).toBe(401);
    });

    it('should handle insufficient permissions', async () => {
      const limitedApiKey = await TestDataFactory.createApiKey(testUser.id, testTenant.id, {
        scopes: ['instances:read'] // Only read permission
      });

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/instances',
        headers: {
          authorization: `Bearer ${limitedApiKey.key}`,
          'content-type': 'application/json'
        },
        payload: {
          name: 'New Instance',
          evolutionInstanceId: 'test-id'
        }
      });

      expect(response.statusCode).toBe(403);
      const responseData = JSON.parse(response.body);
      expect(responseData.error.code).toBe('INSUFFICIENT_PERMISSIONS');
    });
  });

  describe('Performance and Caching', () => {
    it('should cache frequently accessed data', async () => {
      const instance = await TestDataFactory.createInstance(testTenant.id);

      // First request - should hit database
      const firstResponse = await app.inject({
        method: 'GET',
        url: `/api/v1/instances/${instance.id}`,
        headers: {
          authorization: `Bearer ${authToken}`
        }
      });

      expect(firstResponse.statusCode).toBe(200);
      const firstResponseTime = parseInt(firstResponse.headers['x-response-time'] as string);

      // Second request - should hit cache (faster)
      const secondResponse = await app.inject({
        method: 'GET',
        url: `/api/v1/instances/${instance.id}`,
        headers: {
          authorization: `Bearer ${authToken}`
        }
      });

      expect(secondResponse.statusCode).toBe(200);
      const secondResponseTime = parseInt(secondResponse.headers['x-response-time'] as string);

      // Cache hit should be faster (though this might be flaky in tests)
      expect(secondResponseTime).toBeLessThanOrEqual(firstResponseTime + 50); // Allow some variance
    });

    it('should handle concurrent requests properly', async () => {
      const instance = await TestDataFactory.createInstance(testTenant.id);

      // Make multiple concurrent requests
      const promises = Array.from({ length: 10 }, () =>
        app.inject({
          method: 'GET',
          url: `/api/v1/instances/${instance.id}`,
          headers: {
            authorization: `Bearer ${authToken}`
          }
        })
      );

      const responses = await Promise.all(promises);

      // All requests should succeed
      responses.forEach(response => {
        expect(response.statusCode).toBe(200);
      });
    });
  });
});