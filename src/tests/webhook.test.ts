// Jest globals are available without import in Jest environment
// import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'jest';
import { FastifyInstance } from 'fastify';
import { buildApp } from '../api/index';
import { prisma } from '../lib/prisma';
import { redis } from '../lib/redis';
import { webhookService, WebhookEventType } from '../services/webhookService';
import { WebhookAnalyticsService } from '../services/webhookAnalyticsService';
import { WebhookMonitoringService } from '../services/webhookMonitoringService';

describe('Webhook System Integration Tests', () => {
  let app: FastifyInstance;
  let testTenant: any;
  let testInstance: any;
  let authToken: string;

  beforeAll(async () => {
    // Build the Fastify app
    app = await buildApp();
    await app.ready();

    // Create test tenant and user
    testTenant = await prisma.tenant.create({
      data: {
        name: 'Test Tenant',
        slug: 'test-tenant',
        plan: 'PRO',
        status: 'ACTIVE'
      }
    });

    const testUser = await prisma.user.create({
      data: {
        email: 'test@example.com',
        name: 'Test User',
        password: 'hashedpassword',
        role: 'USER',
        tenantId: testTenant.id
      }
    });

    // Create test instance
    testInstance = await prisma.instance.create({
      data: {
        name: 'Test Instance',
        evolutionKey: 'test-key',
        evolutionInstanceId: 'test-instance-id',
        status: 'CONNECTED',
        tenantId: testTenant.id
      }
    });

    // Generate auth token (simplified for testing)
    authToken = 'test-auth-token';
  });

  afterAll(async () => {
    // Cleanup test data
    await prisma.instance.deleteMany({ where: { tenantId: testTenant.id } });
    await prisma.user.deleteMany({ where: { tenantId: testTenant.id } });
    await prisma.tenant.delete({ where: { id: testTenant.id } });
    
    // Close connections
    await app.close();
    await prisma.$disconnect();
    await redis.disconnect();
  });

  beforeEach(async () => {
    // Clear Redis cache before each test
    await redis.flushdb();
  });

  describe('Webhook Event Processing', () => {
    it('should process MESSAGE_UPSERT webhook event', async () => {
      const webhookPayload = {
        event: WebhookEventType.MESSAGES_UPSERT,
        instance: testInstance.evolutionInstanceId,
        data: {
          key: {
            remoteJid: '5511999999999@s.whatsapp.net',
            fromMe: false,
            id: 'test-message-id'
          },
          message: {
            conversation: 'Hello, this is a test message'
          },
          messageTimestamp: Math.floor(Date.now() / 1000)
        },
        destination: 'test',
        date_time: new Date().toISOString(),
        sender: 'evolution-api',
        server_url: 'https://test.evolution.api'
      };

      const response = await app.inject({
        method: 'POST',
        url: '/api/webhook/evolution',
        payload: webhookPayload,
        headers: {
          'content-type': 'application/json'
        }
      });

      expect(response.statusCode).toBe(200);
      const result = JSON.parse(response.payload);
      expect(result.success).toBe(true);
      expect(result.eventId).toBeDefined();

      // Verify message was logged
      const messageLog = await prisma.messageLog.findFirst({
        where: {
          messageId: 'test-message-id',
          tenantId: testTenant.id
        }
      });
      expect(messageLog).toBeDefined();
      expect(messageLog?.content).toBe('Hello, this is a test message');
    });

    it('should process CONNECTION_UPDATE webhook event', async () => {
      const webhookPayload = {
        event: WebhookEventType.CONNECTION_UPDATE,
        instance: testInstance.evolutionInstanceId,
        data: {
          state: 'open'
        },
        destination: 'test',
        date_time: new Date().toISOString(),
        sender: 'evolution-api',
        server_url: 'https://test.evolution.api'
      };

      const response = await app.inject({
        method: 'POST',
        url: '/api/webhook/evolution',
        payload: webhookPayload,
        headers: {
          'content-type': 'application/json'
        }
      });

      expect(response.statusCode).toBe(200);
      const result = JSON.parse(response.payload);
      expect(result.success).toBe(true);

      // Verify instance status was updated
      const updatedInstance = await prisma.instance.findUnique({
        where: { id: testInstance.id }
      });
      expect(updatedInstance?.status).toBe('CONNECTED');
    });

    it('should handle invalid webhook payload', async () => {
      const invalidPayload = {
        event: 'INVALID_EVENT',
        instance: testInstance.evolutionInstanceId,
        data: {}
      };

      const response = await app.inject({
        method: 'POST',
        url: '/api/webhook/evolution',
        payload: invalidPayload,
        headers: {
          'content-type': 'application/json'
        }
      });

      expect(response.statusCode).toBe(400);
      const result = JSON.parse(response.payload);
      expect(result.success).toBe(false);
      expect(result.error.code).toBe('VALIDATION_ERROR');
    });

    it('should handle webhook for non-existent instance', async () => {
      const webhookPayload = {
        event: WebhookEventType.MESSAGES_UPSERT,
        instance: 'non-existent-instance',
        data: {
          key: {
            remoteJid: '5511999999999@s.whatsapp.net',
            fromMe: false,
            id: 'test-message-id'
          },
          message: {
            conversation: 'Test message'
          },
          messageTimestamp: Math.floor(Date.now() / 1000)
        },
        destination: 'test',
        date_time: new Date().toISOString(),
        sender: 'evolution-api',
        server_url: 'https://test.evolution.api'
      };

      const response = await app.inject({
        method: 'POST',
        url: '/api/webhook/evolution',
        payload: webhookPayload,
        headers: {
          'content-type': 'application/json'
        }
      });

      expect(response.statusCode).toBe(404);
      const result = JSON.parse(response.payload);
      expect(result.success).toBe(false);
      expect(result.error.code).toBe('INSTANCE_NOT_FOUND');
    });
  });

  describe('Webhook Configuration Management', () => {
    it('should create webhook configuration', async () => {
      const configData = {
        url: 'https://example.com/webhook',
        events: [WebhookEventType.MESSAGES_UPSERT, WebhookEventType.CONNECTION_UPDATE],
        isActive: true,
        retryAttempts: 3,
        retryDelay: 5000,
        timeout: 30000
      };

      const response = await app.inject({
        method: 'POST',
        url: '/api/webhook/configs',
        payload: configData,
        headers: {
          'content-type': 'application/json',
          'authorization': `Bearer ${authToken}`
        }
      });

      expect(response.statusCode).toBe(201);
      const result = JSON.parse(response.payload);
      expect(result.success).toBe(true);
      expect(result.data.url).toBe(configData.url);
      expect(result.data.events).toEqual(configData.events);
    });

    it('should get webhook configurations', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/webhook/configs',
        headers: {
          'authorization': `Bearer ${authToken}`
        }
      });

      expect(response.statusCode).toBe(200);
      const result = JSON.parse(response.payload);
      expect(result.success).toBe(true);
      expect(Array.isArray(result.data)).toBe(true);
    });

    it('should test webhook configuration', async () => {
      // First create a config
      const configData = {
        url: 'https://httpbin.org/post',
        events: [WebhookEventType.CONNECTION_UPDATE],
        isActive: true
      };

      const createResponse = await app.inject({
        method: 'POST',
        url: '/api/webhook/configs',
        payload: configData,
        headers: {
          'content-type': 'application/json',
          'authorization': `Bearer ${authToken}`
        }
      });

      const createResult = JSON.parse(createResponse.payload);
      const configId = createResult.data.id;

      // Test the config
      const testResponse = await app.inject({
        method: 'POST',
        url: `/api/webhook/configs/${configId}/test`,
        headers: {
          'authorization': `Bearer ${authToken}`
        }
      });

      expect(testResponse.statusCode).toBe(200);
      const testResult = JSON.parse(testResponse.payload);
      expect(testResult.success).toBe(true);
      expect(testResult.data.success).toBe(true);
    });
  });

  describe('Webhook Analytics', () => {
    beforeEach(async () => {
      // Create some test events for analytics
      await WebhookAnalyticsService.recordWebhookEvent(
        testTenant.id,
        WebhookEventType.MESSAGES_UPSERT,
        testInstance.id,
        150,
        true
      );

      await WebhookAnalyticsService.recordWebhookEvent(
        testTenant.id,
        WebhookEventType.CONNECTION_UPDATE,
        testInstance.id,
        75,
        true
      );

      await WebhookAnalyticsService.recordWebhookEvent(
        testTenant.id,
        WebhookEventType.MESSAGES_UPSERT,
        testInstance.id,
        200,
        false,
        'Processing error'
      );
    });

    it('should get webhook statistics', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/webhook/stats?period=24h',
        headers: {
          'authorization': `Bearer ${authToken}`
        }
      });

      expect(response.statusCode).toBe(200);
      const result = JSON.parse(response.payload);
      expect(result.success).toBe(true);
      expect(result.data.totalEvents).toBeGreaterThan(0);
      expect(result.data.successfulEvents).toBeGreaterThan(0);
      expect(result.data.failedEvents).toBeGreaterThan(0);
      expect(result.data.successRate).toBeDefined();
    });

    it('should get webhook analytics', async () => {
      const analytics = await WebhookAnalyticsService.getWebhookAnalytics(testTenant.id, '24h');
      
      expect(analytics.totalEvents).toBe(3);
      expect(analytics.successfulEvents).toBe(2);
      expect(analytics.failedEvents).toBe(1);
      expect(analytics.successRate).toBeCloseTo(66.67, 1);
      expect(analytics.eventsByType[WebhookEventType.MESSAGES_UPSERT]).toBe(2);
      expect(analytics.eventsByType[WebhookEventType.CONNECTION_UPDATE]).toBe(1);
    });

    it('should get performance metrics', async () => {
      const metrics = await WebhookAnalyticsService.getPerformanceMetrics(testTenant.id, '24h');
      
      expect(metrics.averageResponseTime).toBeGreaterThan(0);
      expect(metrics.throughputPerSecond).toBeGreaterThanOrEqual(0);
      expect(metrics.errorRate).toBeGreaterThan(0);
      expect(metrics.uptime).toBeLessThanOrEqual(100);
    });

    it('should get health status', async () => {
      const healthStatus = await WebhookAnalyticsService.getHealthStatus(testTenant.id);
      
      expect(healthStatus.status).toMatch(/healthy|degraded|unhealthy/);
      expect(Array.isArray(healthStatus.issues)).toBe(true);
      expect(healthStatus.recentErrorRate).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Webhook Security', () => {
    it('should reject requests with invalid content type', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/webhook/evolution',
        payload: 'invalid payload',
        headers: {
          'content-type': 'text/plain'
        }
      });

      expect(response.statusCode).toBe(400);
      const result = JSON.parse(response.payload);
      expect(result.success).toBe(false);
      expect(result.error.code).toBe('VALIDATION_ERROR');
    });

    it('should reject requests without user agent', async () => {
      const webhookPayload = {
        event: WebhookEventType.MESSAGES_UPSERT,
        instance: testInstance.evolutionInstanceId,
        data: {},
        destination: 'test',
        date_time: new Date().toISOString(),
        sender: 'evolution-api',
        server_url: 'https://test.evolution.api'
      };

      const response = await app.inject({
        method: 'POST',
        url: '/api/webhook/evolution',
        payload: webhookPayload,
        headers: {
          'content-type': 'application/json'
          // No user-agent header
        }
      });

      expect(response.statusCode).toBe(400);
      const result = JSON.parse(response.payload);
      expect(result.success).toBe(false);
      expect(result.error.code).toBe('VALIDATION_ERROR');
    });

    it('should handle rate limiting', async () => {
      const webhookPayload = {
        event: WebhookEventType.CONNECTION_UPDATE,
        instance: testInstance.evolutionInstanceId,
        data: { state: 'open' },
        destination: 'test',
        date_time: new Date().toISOString(),
        sender: 'evolution-api',
        server_url: 'https://test.evolution.api'
      };

      // Make multiple rapid requests to trigger rate limiting
      const requests = Array(10).fill(null).map(() => 
        app.inject({
          method: 'POST',
          url: '/api/webhook/evolution',
          payload: webhookPayload,
          headers: {
            'content-type': 'application/json',
            'user-agent': 'Evolution-API/1.0'
          }
        })
      );

      const responses = await Promise.all(requests);
      
      // At least some requests should succeed
      const successfulRequests = responses.filter(r => r.statusCode === 200);
      expect(successfulRequests.length).toBeGreaterThan(0);
    });
  });

  describe('Webhook Monitoring', () => {
    it('should get monitoring dashboard data', async () => {
      const dashboardData = await WebhookMonitoringService.getMonitoringDashboard(testTenant.id);
      
      expect(dashboardData.analytics).toBeDefined();
      expect(dashboardData.performanceMetrics).toBeDefined();
      expect(dashboardData.healthStatus).toBeDefined();
      expect(Array.isArray(dashboardData.alerts)).toBe(true);
      expect(dashboardData.period).toBe('24h');
    });

    it('should get alerts for tenant', async () => {
      const alerts = await WebhookMonitoringService.getAlertsForTenant(testTenant.id);
      expect(Array.isArray(alerts)).toBe(true);
    });

    it('should get monitoring rules', async () => {
      const rules = await WebhookMonitoringService.getMonitoringRules();
      expect(Array.isArray(rules)).toBe(true);
      expect(rules.length).toBeGreaterThan(0);
    });
  });

  describe('Real-time Features', () => {
    it('should get recent webhook events', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/webhook/events?limit=10',
        headers: {
          'authorization': `Bearer ${authToken}`
        }
      });

      expect(response.statusCode).toBe(200);
      const result = JSON.parse(response.payload);
      expect(result.success).toBe(true);
      expect(Array.isArray(result.data)).toBe(true);
    });
  });

  describe('Error Handling', () => {
    it('should handle malformed JSON payload', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/webhook/evolution',
        payload: '{"invalid": json}',
        headers: {
          'content-type': 'application/json',
          'user-agent': 'Evolution-API/1.0'
        }
      });

      expect(response.statusCode).toBe(400);
    });

    it('should handle missing required fields', async () => {
      const incompletePayload = {
        event: WebhookEventType.MESSAGES_UPSERT,
        // Missing instance, data, etc.
      };

      const response = await app.inject({
        method: 'POST',
        url: '/api/webhook/evolution',
        payload: incompletePayload,
        headers: {
          'content-type': 'application/json',
          'user-agent': 'Evolution-API/1.0'
        }
      });

      expect(response.statusCode).toBe(400);
      const result = JSON.parse(response.payload);
      expect(result.success).toBe(false);
      expect(result.error.code).toBe('VALIDATION_ERROR');
    });
  });
});

describe('Webhook Service Unit Tests', () => {
  let testTenant: any;
  let testInstance: any;

  beforeAll(async () => {
    testTenant = await prisma.tenant.create({
      data: {
        name: 'Unit Test Tenant',
        slug: 'unit-test-tenant',
        plan: 'BASIC',
        status: 'ACTIVE'
      }
    });

    testInstance = await prisma.instance.create({
      data: {
        name: 'Unit Test Instance',
        evolutionKey: 'unit-test-key',
        evolutionInstanceId: 'unit-test-instance-id',
        status: 'CONNECTED',
        tenantId: testTenant.id
      }
    });
  });

  afterAll(async () => {
    await prisma.instance.deleteMany({ where: { tenantId: testTenant.id } });
    await prisma.tenant.delete({ where: { id: testTenant.id } });
  });

  beforeEach(async () => {
    await redis.flushdb();
  });

  it('should validate webhook payload structure', async () => {
    const validPayload = {
      event: WebhookEventType.MESSAGES_UPSERT,
      instance: testInstance.evolutionInstanceId,
      data: { test: 'data' },
      destination: 'test',
      date_time: new Date().toISOString(),
      sender: 'test',
      server_url: 'https://test.com'
    };

    expect(() => {
      // This would be called internally by the webhook service
      webhookService['validateWebhookPayload'](validPayload);
    }).not.toThrow();
  });

  it('should generate unique event IDs', async () => {
    const payload1 = {
      event: WebhookEventType.MESSAGES_UPSERT,
      instance: 'test-instance',
      date_time: '2024-01-01T00:00:00Z'
    };

    const payload2 = {
      event: WebhookEventType.MESSAGES_UPSERT,
      instance: 'test-instance',
      date_time: '2024-01-01T00:00:01Z'
    };

    const id1 = webhookService['generateEventId'](payload1 as any);
    const id2 = webhookService['generateEventId'](payload2 as any);

    expect(id1).not.toBe(id2);
    expect(id1).toHaveLength(16);
    expect(id2).toHaveLength(16);
  });

  it('should detect duplicate events', async () => {
    const payload = {
      event: WebhookEventType.MESSAGES_UPSERT,
      instance: testInstance.evolutionInstanceId,
      data: { test: 'data' },
      destination: 'test',
      date_time: new Date().toISOString(),
      sender: 'test',
      server_url: 'https://test.com'
    };

    const eventId = webhookService['generateEventId'](payload);
    
    // First check should return false (not duplicate)
    const isDuplicate1 = await webhookService['checkDuplicateEvent'](eventId, testTenant.id);
    expect(isDuplicate1).toBe(false);

    // Second check should return true (is duplicate)
    const isDuplicate2 = await webhookService['checkDuplicateEvent'](eventId, testTenant.id);
    expect(isDuplicate2).toBe(true);
  });
});