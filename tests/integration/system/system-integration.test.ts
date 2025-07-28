import { FastifyInstance } from 'fastify';
import { testPrisma, testRedis, TestDataFactory, TestUtils } from '../../setup/integration.setup';
import { buildApp } from '../../../src/api/index';
import { AuthService } from '../../../src/services/authService';
import { redis } from '../../../src/lib/redis';

describe('System Integration Tests', () => {
  let app: FastifyInstance;
  let testTenant: any;
  let testUser: any;
  let authToken: string;

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
    
    // Create test tenant and user
    testTenant = await TestDataFactory.createTenant();
    testUser = await TestDataFactory.createUser(testTenant.id, { role: 'ADMIN' });
    authToken = TestUtils.generateJWT({
      userId: testUser.id,
      tenantId: testTenant.id,
      role: testUser.role
    });
  });

  describe('Authentication Flow Integration', () => {
    it('should complete full authentication lifecycle', async () => {
      // 1. Register new user
      const registerResponse = await app.inject({
        method: 'POST',
        url: '/api/auth/register',
        payload: {
          email: 'integration@test.com',
          password: 'Test123!@#',
          name: 'Integration Test User',
          tenantName: 'Integration Test Company'
        }
      });

      expect(registerResponse.statusCode).toBe(201);
      const registerData = JSON.parse(registerResponse.body);
      expect(registerData.success).toBe(true);
      expect(registerData.data.token).toBeDefined();

      // 2. Use token to access protected endpoint
      const meResponse = await app.inject({
        method: 'GET',
        url: '/api/auth/me',
        headers: {
          authorization: `Bearer ${registerData.data.token}`
        }
      });

      expect(meResponse.statusCode).toBe(200);
      const meData = JSON.parse(meResponse.body);
      expect(meData.data.user.email).toBe('integration@test.com');

      // 3. Refresh token
      const refreshResponse = await app.inject({
        method: 'POST',
        url: '/api/auth/refresh',
        payload: {
          refreshToken: registerData.data.refreshToken
        }
      });

      expect(refreshResponse.statusCode).toBe(200);
      const refreshData = JSON.parse(refreshResponse.body);
      expect(refreshData.data.token).toBeDefined();
      expect(refreshData.data.token).not.toBe(registerData.data.token);

      // 4. Logout
      const logoutResponse = await app.inject({
        method: 'POST',
        url: '/api/auth/logout',
        headers: {
          authorization: `Bearer ${refreshData.data.token}`
        }
      });

      expect(logoutResponse.statusCode).toBe(200);

      // 5. Verify token is blacklisted
      const protectedResponse = await app.inject({
        method: 'GET',
        url: '/api/auth/me',
        headers: {
          authorization: `Bearer ${refreshData.data.token}`
        }
      });

      expect(protectedResponse.statusCode).toBe(401);
    });

    it('should handle API key authentication', async () => {
      // Create API key
      const apiKey = await TestDataFactory.createApiKey(testUser.id, testTenant.id, {
        scopes: ['instances:read', 'messages:send']
      });

      // Use API key to access protected endpoint
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/health',
        headers: {
          authorization: `Bearer ${apiKey.key}`
        }
      });

      expect(response.statusCode).toBe(200);
    });
  });

  describe('Instance Lifecycle Integration', () => {
    it('should complete full instance lifecycle', async () => {
      // 1. Create instance
      const createResponse = await app.inject({
        method: 'POST',
        url: '/api/v1/instances',
        headers: {
          authorization: `Bearer ${authToken}`
        },
        payload: {
          name: 'Test Instance',
          evolutionInstanceId: 'test-evolution-instance'
        }
      });

      expect(createResponse.statusCode).toBe(201);
      const createData = JSON.parse(createResponse.body);
      const instanceId = createData.data.id;

      // 2. Verify instance in database
      const dbInstance = await testPrisma.instance.findUnique({
        where: { id: instanceId }
      });
      expect(dbInstance).toBeTruthy();
      expect(dbInstance?.tenantId).toBe(testTenant.id);

      // 3. Get instance details
      const getResponse = await app.inject({
        method: 'GET',
        url: `/api/v1/instances/${instanceId}`,
        headers: {
          authorization: `Bearer ${authToken}`
        }
      });

      expect(getResponse.statusCode).toBe(200);
      const getData = JSON.parse(getResponse.body);
      expect(getData.data.id).toBe(instanceId);

      // 4. Update instance
      const updateResponse = await app.inject({
        method: 'PUT',
        url: `/api/v1/instances/${instanceId}`,
        headers: {
          authorization: `Bearer ${authToken}`
        },
        payload: {
          name: 'Updated Test Instance'
        }
      });

      expect(updateResponse.statusCode).toBe(200);

      // 5. Delete instance
      const deleteResponse = await app.inject({
        method: 'DELETE',
        url: `/api/v1/instances/${instanceId}`,
        headers: {
          authorization: `Bearer ${authToken}`
        }
      });

      expect(deleteResponse.statusCode).toBe(200);

      // 6. Verify instance is deleted
      const deletedInstance = await testPrisma.instance.findUnique({
        where: { id: instanceId }
      });
      expect(deletedInstance).toBeNull();
    });
  });

  describe('Bot System Integration', () => {
    let testInstance: any;

    beforeEach(async () => {
      testInstance = await TestDataFactory.createInstance(testTenant.id);
    });

    it('should integrate bot with instance', async () => {
      // 1. Create bot
      const createBotResponse = await app.inject({
        method: 'POST',
        url: '/api/v1/bots',
        headers: {
          authorization: `Bearer ${authToken}`
        },
        payload: {
          name: 'Test Bot',
          type: 'TYPEBOT',
          instanceId: testInstance.id,
          config: {
            typebotUrl: 'https://typebot.example.com',
            typebotId: 'test-typebot-id',
            triggerType: 'all'
          }
        }
      });

      expect(createBotResponse.statusCode).toBe(201);
      const botData = JSON.parse(createBotResponse.body);
      const botId = botData.data.id;

      // 2. Verify bot-instance relationship
      const dbBot = await testPrisma.bot.findUnique({
        where: { id: botId },
        include: { instance: true }
      });
      expect(dbBot?.instanceId).toBe(testInstance.id);
      expect(dbBot?.instance.tenantId).toBe(testTenant.id);

      // 3. Test bot configuration
      const getBotResponse = await app.inject({
        method: 'GET',
        url: `/api/v1/bots/${botId}`,
        headers: {
          authorization: `Bearer ${authToken}`
        }
      });

      expect(getBotResponse.statusCode).toBe(200);
      const getBotData = JSON.parse(getBotResponse.body);
      expect(getBotData.data.config.typebotId).toBe('test-typebot-id');
    });
  });

  describe('Webhook Processing Integration', () => {
    let testInstance: any;

    beforeEach(async () => {
      testInstance = await TestDataFactory.createInstance(testTenant.id, {
        status: 'CONNECTED',
        webhookUrl: 'https://webhook.example.com'
      });
    });

    it('should process webhook events end-to-end', async () => {
      // Simulate webhook event
      const webhookPayload = {
        event: 'messages.upsert',
        instance: testInstance.evolutionInstanceId,
        data: {
          key: {
            remoteJid: '1234567890@s.whatsapp.net',
            fromMe: false,
            id: 'test-message-id'
          },
          message: {
            conversation: 'Test message'
          },
          messageTimestamp: Date.now()
        }
      };

      const webhookResponse = await app.inject({
        method: 'POST',
        url: '/api/webhooks/evolution',
        headers: {
          'content-type': 'application/json',
          'x-evolution-instance': testInstance.evolutionInstanceId
        },
        payload: webhookPayload
      });

      expect(webhookResponse.statusCode).toBe(200);

      // Verify message log was created
      await TestUtils.waitForCondition(async () => {
        const messageLog = await testPrisma.messageLog.findFirst({
          where: {
            instanceId: testInstance.id,
            messageId: 'test-message-id'
          }
        });
        return messageLog !== null;
      });
    });
  });

  describe('Quota Management Integration', () => {
    beforeEach(async () => {
      // Set up quota limits
      await TestDataFactory.createQuotaUsage(testTenant.id, {
        quotaType: 'MESSAGES_HOURLY',
        used: 95,
        limit: 100
      });
    });

    it('should enforce quota limits across system', async () => {
      const testInstance = await TestDataFactory.createInstance(testTenant.id);

      // First request should succeed (within quota)
      const firstResponse = await app.inject({
        method: 'POST',
        url: '/api/v1/messages/send',
        headers: {
          authorization: `Bearer ${authToken}`
        },
        payload: {
          instanceId: testInstance.id,
          recipient: '1234567890',
          text: 'Test message 1'
        }
      });

      expect(firstResponse.statusCode).toBe(200);

      // Update quota to exceed limit
      await testPrisma.quotaUsage.updateMany({
        where: {
          tenantId: testTenant.id,
          quotaType: 'MESSAGES_HOURLY'
        },
        data: { used: 100 }
      });

      // Second request should fail (quota exceeded)
      const secondResponse = await app.inject({
        method: 'POST',
        url: '/api/v1/messages/send',
        headers: {
          authorization: `Bearer ${authToken}`
        },
        payload: {
          instanceId: testInstance.id,
          recipient: '1234567890',
          text: 'Test message 2'
        }
      });

      expect(secondResponse.statusCode).toBe(429);
      const errorData = JSON.parse(secondResponse.body);
      expect(errorData.error.code).toBe('QUOTA_EXCEEDED');
    });
  });

  describe('Real-time WebSocket Integration', () => {
    it('should handle WebSocket connections and events', async () => {
      // This would test WebSocket functionality if implemented
      // For now, we'll test the HTTP endpoints that would trigger WebSocket events
      
      const testInstance = await TestDataFactory.createInstance(testTenant.id);
      
      // Simulate connection state change
      const stateChangeResponse = await app.inject({
        method: 'POST',
        url: '/api/webhooks/evolution',
        headers: {
          'content-type': 'application/json',
          'x-evolution-instance': testInstance.evolutionInstanceId
        },
        payload: {
          event: 'connection.update',
          instance: testInstance.evolutionInstanceId,
          data: {
            state: 'open'
          }
        }
      });

      expect(stateChangeResponse.statusCode).toBe(200);

      // Verify instance status was updated
      const updatedInstance = await testPrisma.instance.findUnique({
        where: { id: testInstance.id }
      });
      expect(updatedInstance?.status).toBe('CONNECTED');
    });
  });

  describe('Multi-tenant Isolation', () => {
    let otherTenant: any;
    let otherUser: any;
    let otherAuthToken: string;

    beforeEach(async () => {
      otherTenant = await TestDataFactory.createTenant({
        name: 'Other Tenant',
        slug: 'other-tenant'
      });
      otherUser = await TestDataFactory.createUser(otherTenant.id);
      otherAuthToken = TestUtils.generateJWT({
        userId: otherUser.id,
        tenantId: otherTenant.id,
        role: otherUser.role
      });
    });

    it('should enforce tenant isolation', async () => {
      // Create instance for first tenant
      const instance1 = await TestDataFactory.createInstance(testTenant.id);
      
      // Create instance for second tenant
      const instance2 = await TestDataFactory.createInstance(otherTenant.id);

      // First tenant should only see their instance
      const tenant1Response = await app.inject({
        method: 'GET',
        url: '/api/v1/instances',
        headers: {
          authorization: `Bearer ${authToken}`
        }
      });

      expect(tenant1Response.statusCode).toBe(200);
      const tenant1Data = JSON.parse(tenant1Response.body);
      expect(tenant1Data.data.length).toBe(1);
      expect(tenant1Data.data[0].id).toBe(instance1.id);

      // Second tenant should only see their instance
      const tenant2Response = await app.inject({
        method: 'GET',
        url: '/api/v1/instances',
        headers: {
          authorization: `Bearer ${otherAuthToken}`
        }
      });

      expect(tenant2Response.statusCode).toBe(200);
      const tenant2Data = JSON.parse(tenant2Response.body);
      expect(tenant2Data.data.length).toBe(1);
      expect(tenant2Data.data[0].id).toBe(instance2.id);

      // First tenant should not be able to access second tenant's instance
      const crossTenantResponse = await app.inject({
        method: 'GET',
        url: `/api/v1/instances/${instance2.id}`,
        headers: {
          authorization: `Bearer ${authToken}`
        }
      });

      expect(crossTenantResponse.statusCode).toBe(404);
    });
  });

  describe('Database Transaction Integrity', () => {
    it('should maintain data consistency during failures', async () => {
      // Test transaction rollback on failure
      const initialTenantCount = await testPrisma.tenant.count();
      const initialUserCount = await testPrisma.user.count();

      // Attempt to create user with invalid tenant reference
      try {
        await testPrisma.$transaction(async (tx) => {
          await tx.tenant.create({
            data: {
              name: 'Test Tenant',
              slug: 'test-tenant-tx'
            }
          });

          // This should fail and rollback the transaction
          await tx.user.create({
            data: {
              email: 'test@example.com',
              name: 'Test User',
              password: 'hashedpassword',
              tenantId: 'non-existent-tenant-id', // This will fail
              role: 'USER'
            }
          });
        });
      } catch (error) {
        // Expected to fail
      }

      // Verify no data was created due to rollback
      const finalTenantCount = await testPrisma.tenant.count();
      const finalUserCount = await testPrisma.user.count();

      expect(finalTenantCount).toBe(initialTenantCount);
      expect(finalUserCount).toBe(initialUserCount);
    });
  });

  describe('Redis Caching Integration', () => {
    it('should cache and retrieve data correctly', async () => {
      const cacheKey = `test:${testTenant.id}:data`;
      const testData = { message: 'cached data', timestamp: Date.now() };

      // Set data in cache
      await testRedis.setex(cacheKey, 60, JSON.stringify(testData));

      // Retrieve data from cache
      const cachedData = await testRedis.get(cacheKey);
      expect(JSON.parse(cachedData!)).toEqual(testData);

      // Verify TTL
      const ttl = await testRedis.ttl(cacheKey);
      expect(ttl).toBeGreaterThan(0);
      expect(ttl).toBeLessThanOrEqual(60);
    });

    it('should handle cache invalidation', async () => {
      const cacheKey = `test:${testTenant.id}:invalidate`;
      
      // Set data in cache
      await testRedis.set(cacheKey, 'test data');
      
      // Verify data exists
      let cachedData = await testRedis.get(cacheKey);
      expect(cachedData).toBe('test data');

      // Invalidate cache
      await testRedis.del(cacheKey);

      // Verify data is gone
      cachedData = await testRedis.get(cacheKey);
      expect(cachedData).toBeNull();
    });
  });
});