import { FastifyInstance } from 'fastify';
import { testPrisma, testRedis } from '../../setup/integration.setup';
import { TestDataFactory, TestUtils } from '../../helpers/test-helpers';
import { buildApp } from '../../../src/api/index';

describe('Instances API Integration Tests', () => {
  let app: FastifyInstance;
  let accessToken: string;
  let testUser: any;
  let testTenant: any;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    // Clean up test data
    await testPrisma.instance.deleteMany({
      where: { name: { contains: 'test' } },
    });
    await testPrisma.user.deleteMany({
      where: { email: { contains: 'test' } },
    });
    await testPrisma.tenant.deleteMany({
      where: { name: { contains: 'test' } },
    });
    await testRedis.flushall();

    // Create test user and get access token
    const registerResponse = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: {
        email: 'test@example.com',
        password: 'Test123!@#',
        name: 'Test User',
        tenantName: 'Test Company',
      },
    });

    const registerBody = JSON.parse(registerResponse.body);
    testUser = registerBody.data.user;
    testTenant = registerBody.data.tenant;
    accessToken = registerBody.data.token;
  });

  describe('POST /api/v1/instances', () => {
    it('should create a new instance successfully', async () => {
      // Arrange
      const instanceData = {
        name: 'Test Instance',
        phoneNumber: '+6281234567890',
        webhookUrl: 'https://example.com/webhook',
      };

      // Act
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/instances',
        headers: {
          authorization: `Bearer ${accessToken}`,
        },
        payload: instanceData,
      });

      // Assert
      expect(response.statusCode).toBe(201);
      
      const responseBody = JSON.parse(response.body);
      expect(responseBody).toEqual({
        success: true,
        data: expect.objectContaining({
          id: expect.any(String),
          name: instanceData.name,
          phoneNumber: instanceData.phoneNumber,
          webhookUrl: instanceData.webhookUrl,
          status: 'DISCONNECTED',
          evolutionKey: expect.any(String),
          evolutionInstanceId: expect.any(String),
          tenantId: testTenant.id,
          createdAt: expect.any(String),
          updatedAt: expect.any(String),
        }),
      });

      // Verify instance was created in database
      const createdInstance = await testPrisma.instance.findFirst({
        where: { name: instanceData.name },
      });

      expect(createdInstance).toBeTruthy();
      expect(createdInstance?.phoneNumber).toBe(instanceData.phoneNumber);
      expect(createdInstance?.tenantId).toBe(testTenant.id);
    });

    it('should return 400 for invalid phone number format', async () => {
      // Arrange
      const instanceData = {
        name: 'Test Instance',
        phoneNumber: 'invalid-phone',
        webhookUrl: 'https://example.com/webhook',
      };

      // Act
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/instances',
        headers: {
          authorization: `Bearer ${accessToken}`,
        },
        payload: instanceData,
      });

      // Assert
      expect(response.statusCode).toBe(400);
      
      const responseBody = JSON.parse(response.body);
      expect(responseBody.error).toBe('Validation error');
      expect(responseBody.message).toContain('phone number');
    });

    it('should return 400 for invalid webhook URL', async () => {
      // Arrange
      const instanceData = {
        name: 'Test Instance',
        phoneNumber: '+6281234567890',
        webhookUrl: 'invalid-url',
      };

      // Act
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/instances',
        headers: {
          authorization: `Bearer ${accessToken}`,
        },
        payload: instanceData,
      });

      // Assert
      expect(response.statusCode).toBe(400);
      
      const responseBody = JSON.parse(response.body);
      expect(responseBody.error).toBe('Validation error');
      expect(responseBody.message).toContain('webhook URL');
    });

    it('should return 409 for duplicate phone number', async () => {
      // Arrange
      const instanceData = {
        name: 'Test Instance',
        phoneNumber: '+6281234567890',
        webhookUrl: 'https://example.com/webhook',
      };

      // Create first instance
      await app.inject({
        method: 'POST',
        url: '/api/v1/instances',
        headers: {
          authorization: `Bearer ${accessToken}`,
        },
        payload: instanceData,
      });

      // Act - Try to create another instance with same phone number
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/instances',
        headers: {
          authorization: `Bearer ${accessToken}`,
        },
        payload: {
          ...instanceData,
          name: 'Another Instance',
        },
      });

      // Assert
      expect(response.statusCode).toBe(409);
      
      const responseBody = JSON.parse(response.body);
      expect(responseBody.error).toBe('Conflict');
      expect(responseBody.message).toContain('phone number already exists');
    });

    it('should return 401 for unauthenticated request', async () => {
      // Arrange
      const instanceData = {
        name: 'Test Instance',
        phoneNumber: '+6281234567890',
        webhookUrl: 'https://example.com/webhook',
      };

      // Act
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/instances',
        payload: instanceData,
      });

      // Assert
      expect(response.statusCode).toBe(401);
      
      const responseBody = JSON.parse(response.body);
      expect(responseBody.error).toBe('Authentication required');
    });
  });

  describe('GET /api/v1/instances', () => {
    let testInstance1: any;
    let testInstance2: any;

    beforeEach(async () => {
      // Create test instances
      const instance1Response = await app.inject({
        method: 'POST',
        url: '/api/v1/instances',
        headers: {
          authorization: `Bearer ${accessToken}`,
        },
        payload: {
          name: 'Test Instance 1',
          phoneNumber: '+6281234567890',
          webhookUrl: 'https://example.com/webhook1',
        },
      });

      const instance2Response = await app.inject({
        method: 'POST',
        url: '/api/v1/instances',
        headers: {
          authorization: `Bearer ${accessToken}`,
        },
        payload: {
          name: 'Test Instance 2',
          phoneNumber: '+6281234567891',
          webhookUrl: 'https://example.com/webhook2',
        },
      });

      testInstance1 = JSON.parse(instance1Response.body).data;
      testInstance2 = JSON.parse(instance2Response.body).data;
    });

    it('should return paginated instances for authenticated user', async () => {
      // Act
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/instances',
        headers: {
          authorization: `Bearer ${accessToken}`,
        },
      });

      // Assert
      expect(response.statusCode).toBe(200);
      
      const responseBody = JSON.parse(response.body);
      expect(responseBody).toEqual({
        success: true,
        data: {
          instances: expect.arrayContaining([
            expect.objectContaining({
              id: testInstance1.id,
              name: testInstance1.name,
            }),
            expect.objectContaining({
              id: testInstance2.id,
              name: testInstance2.name,
            }),
          ]),
          pagination: expect.objectContaining({
            page: 1,
            limit: 20,
            total: 2,
            totalPages: 1,
          }),
        },
      });
    });

    it('should support pagination parameters', async () => {
      // Act
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/instances?page=1&limit=1',
        headers: {
          authorization: `Bearer ${accessToken}`,
        },
      });

      // Assert
      expect(response.statusCode).toBe(200);
      
      const responseBody = JSON.parse(response.body);
      expect(responseBody.data.instances).toHaveLength(1);
      expect(responseBody.data.pagination).toEqual({
        page: 1,
        limit: 1,
        total: 2,
        totalPages: 2,
      });
    });

    it('should support search functionality', async () => {
      // Act
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/instances?search=Instance 1',
        headers: {
          authorization: `Bearer ${accessToken}`,
        },
      });

      // Assert
      expect(response.statusCode).toBe(200);
      
      const responseBody = JSON.parse(response.body);
      expect(responseBody.data.instances).toHaveLength(1);
      expect(responseBody.data.instances[0].name).toBe('Test Instance 1');
    });

    it('should support status filtering', async () => {
      // Act
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/instances?status=DISCONNECTED',
        headers: {
          authorization: `Bearer ${accessToken}`,
        },
      });

      // Assert
      expect(response.statusCode).toBe(200);
      
      const responseBody = JSON.parse(response.body);
      expect(responseBody.data.instances).toHaveLength(2);
      responseBody.data.instances.forEach((instance: any) => {
        expect(instance.status).toBe('DISCONNECTED');
      });
    });

    it('should return 401 for unauthenticated request', async () => {
      // Act
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/instances',
      });

      // Assert
      expect(response.statusCode).toBe(401);
      
      const responseBody = JSON.parse(response.body);
      expect(responseBody.error).toBe('Authentication required');
    });
  });

  describe('GET /api/v1/instances/:id', () => {
    let testInstance: any;

    beforeEach(async () => {
      // Create test instance
      const instanceResponse = await app.inject({
        method: 'POST',
        url: '/api/v1/instances',
        headers: {
          authorization: `Bearer ${accessToken}`,
        },
        payload: {
          name: 'Test Instance',
          phoneNumber: '+6281234567890',
          webhookUrl: 'https://example.com/webhook',
        },
      });

      testInstance = JSON.parse(instanceResponse.body).data;
    });

    it('should return instance by ID for authenticated user', async () => {
      // Act
      const response = await app.inject({
        method: 'GET',
        url: `/api/v1/instances/${testInstance.id}`,
        headers: {
          authorization: `Bearer ${accessToken}`,
        },
      });

      // Assert
      expect(response.statusCode).toBe(200);
      
      const responseBody = JSON.parse(response.body);
      expect(responseBody).toEqual({
        success: true,
        data: expect.objectContaining({
          id: testInstance.id,
          name: testInstance.name,
          phoneNumber: testInstance.phoneNumber,
          status: testInstance.status,
        }),
      });
    });

    it('should return 404 for non-existent instance', async () => {
      // Act
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/instances/non-existent-id',
        headers: {
          authorization: `Bearer ${accessToken}`,
        },
      });

      // Assert
      expect(response.statusCode).toBe(404);
      
      const responseBody = JSON.parse(response.body);
      expect(responseBody.error).toBe('Not found');
      expect(responseBody.message).toContain('Instance not found');
    });

    it('should return 401 for unauthenticated request', async () => {
      // Act
      const response = await app.inject({
        method: 'GET',
        url: `/api/v1/instances/${testInstance.id}`,
      });

      // Assert
      expect(response.statusCode).toBe(401);
      
      const responseBody = JSON.parse(response.body);
      expect(responseBody.error).toBe('Authentication required');
    });
  });

  describe('PUT /api/v1/instances/:id', () => {
    let testInstance: any;

    beforeEach(async () => {
      // Create test instance
      const instanceResponse = await app.inject({
        method: 'POST',
        url: '/api/v1/instances',
        headers: {
          authorization: `Bearer ${accessToken}`,
        },
        payload: {
          name: 'Test Instance',
          phoneNumber: '+6281234567890',
          webhookUrl: 'https://example.com/webhook',
        },
      });

      testInstance = JSON.parse(instanceResponse.body).data;
    });

    it('should update instance successfully', async () => {
      // Arrange
      const updateData = {
        name: 'Updated Instance',
        webhookUrl: 'https://updated.com/webhook',
      };

      // Act
      const response = await app.inject({
        method: 'PUT',
        url: `/api/v1/instances/${testInstance.id}`,
        headers: {
          authorization: `Bearer ${accessToken}`,
        },
        payload: updateData,
      });

      // Assert
      expect(response.statusCode).toBe(200);
      
      const responseBody = JSON.parse(response.body);
      expect(responseBody).toEqual({
        success: true,
        data: expect.objectContaining({
          id: testInstance.id,
          name: updateData.name,
          webhookUrl: updateData.webhookUrl,
          phoneNumber: testInstance.phoneNumber, // Should remain unchanged
        }),
      });

      // Verify update in database
      const updatedInstance = await testPrisma.instance.findUnique({
        where: { id: testInstance.id },
      });

      expect(updatedInstance?.name).toBe(updateData.name);
      expect(updatedInstance?.webhookUrl).toBe(updateData.webhookUrl);
    });

    it('should return 404 for non-existent instance', async () => {
      // Act
      const response = await app.inject({
        method: 'PUT',
        url: '/api/v1/instances/non-existent-id',
        headers: {
          authorization: `Bearer ${accessToken}`,
        },
        payload: {
          name: 'Updated Instance',
        },
      });

      // Assert
      expect(response.statusCode).toBe(404);
      
      const responseBody = JSON.parse(response.body);
      expect(responseBody.error).toBe('Not found');
      expect(responseBody.message).toContain('Instance not found');
    });

    it('should return 401 for unauthenticated request', async () => {
      // Act
      const response = await app.inject({
        method: 'PUT',
        url: `/api/v1/instances/${testInstance.id}`,
        payload: {
          name: 'Updated Instance',
        },
      });

      // Assert
      expect(response.statusCode).toBe(401);
      
      const responseBody = JSON.parse(response.body);
      expect(responseBody.error).toBe('Authentication required');
    });
  });

  describe('DELETE /api/v1/instances/:id', () => {
    let testInstance: any;

    beforeEach(async () => {
      // Create test instance
      const instanceResponse = await app.inject({
        method: 'POST',
        url: '/api/v1/instances',
        headers: {
          authorization: `Bearer ${accessToken}`,
        },
        payload: {
          name: 'Test Instance',
          phoneNumber: '+6281234567890',
          webhookUrl: 'https://example.com/webhook',
        },
      });

      testInstance = JSON.parse(instanceResponse.body).data;
    });

    it('should delete instance successfully', async () => {
      // Act
      const response = await app.inject({
        method: 'DELETE',
        url: `/api/v1/instances/${testInstance.id}`,
        headers: {
          authorization: `Bearer ${accessToken}`,
        },
      });

      // Assert
      expect(response.statusCode).toBe(200);
      
      const responseBody = JSON.parse(response.body);
      expect(responseBody).toEqual({
        success: true,
        message: 'Instance deleted successfully',
      });

      // Verify deletion in database
      const deletedInstance = await testPrisma.instance.findUnique({
        where: { id: testInstance.id },
      });

      expect(deletedInstance).toBeNull();
    });

    it('should return 404 for non-existent instance', async () => {
      // Act
      const response = await app.inject({
        method: 'DELETE',
        url: '/api/v1/instances/non-existent-id',
        headers: {
          authorization: `Bearer ${accessToken}`,
        },
      });

      // Assert
      expect(response.statusCode).toBe(404);
      
      const responseBody = JSON.parse(response.body);
      expect(responseBody.error).toBe('Not found');
      expect(responseBody.message).toContain('Instance not found');
    });

    it('should return 401 for unauthenticated request', async () => {
      // Act
      const response = await app.inject({
        method: 'DELETE',
        url: `/api/v1/instances/${testInstance.id}`,
      });

      // Assert
      expect(response.statusCode).toBe(401);
      
      const responseBody = JSON.parse(response.body);
      expect(responseBody.error).toBe('Authentication required');
    });
  });

  describe('POST /api/v1/instances/:id/connect', () => {
    let testInstance: any;

    beforeEach(async () => {
      // Create test instance
      const instanceResponse = await app.inject({
        method: 'POST',
        url: '/api/v1/instances',
        headers: {
          authorization: `Bearer ${accessToken}`,
        },
        payload: {
          name: 'Test Instance',
          phoneNumber: '+6281234567890',
          webhookUrl: 'https://example.com/webhook',
        },
      });

      testInstance = JSON.parse(instanceResponse.body).data;
    });

    it('should connect instance successfully', async () => {
      // Act
      const response = await app.inject({
        method: 'POST',
        url: `/api/v1/instances/${testInstance.id}/connect`,
        headers: {
          authorization: `Bearer ${accessToken}`,
        },
      });

      // Assert
      expect(response.statusCode).toBe(200);
      
      const responseBody = JSON.parse(response.body);
      expect(responseBody).toEqual({
        success: true,
        data: expect.objectContaining({
          id: testInstance.id,
          status: 'CONNECTING',
          qrCode: expect.any(String),
        }),
      });

      // Verify status update in database
      const updatedInstance = await testPrisma.instance.findUnique({
        where: { id: testInstance.id },
      });

      expect(updatedInstance?.status).toBe('CONNECTING');
    });

    it('should return 404 for non-existent instance', async () => {
      // Act
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/instances/non-existent-id/connect',
        headers: {
          authorization: `Bearer ${accessToken}`,
        },
      });

      // Assert
      expect(response.statusCode).toBe(404);
      
      const responseBody = JSON.parse(response.body);
      expect(responseBody.error).toBe('Not found');
      expect(responseBody.message).toContain('Instance not found');
    });

    it('should return 401 for unauthenticated request', async () => {
      // Act
      const response = await app.inject({
        method: 'POST',
        url: `/api/v1/instances/${testInstance.id}/connect`,
      });

      // Assert
      expect(response.statusCode).toBe(401);
      
      const responseBody = JSON.parse(response.body);
      expect(responseBody.error).toBe('Authentication required');
    });
  });

  describe('POST /api/v1/instances/:id/disconnect', () => {
    let testInstance: any;

    beforeEach(async () => {
      // Create and connect test instance
      const instanceResponse = await app.inject({
        method: 'POST',
        url: '/api/v1/instances',
        headers: {
          authorization: `Bearer ${accessToken}`,
        },
        payload: {
          name: 'Test Instance',
          phoneNumber: '+6281234567890',
          webhookUrl: 'https://example.com/webhook',
        },
      });

      testInstance = JSON.parse(instanceResponse.body).data;

      // Connect the instance first
      await app.inject({
        method: 'POST',
        url: `/api/v1/instances/${testInstance.id}/connect`,
        headers: {
          authorization: `Bearer ${accessToken}`,
        },
      });
    });

    it('should disconnect instance successfully', async () => {
      // Act
      const response = await app.inject({
        method: 'POST',
        url: `/api/v1/instances/${testInstance.id}/disconnect`,
        headers: {
          authorization: `Bearer ${accessToken}`,
        },
      });

      // Assert
      expect(response.statusCode).toBe(200);
      
      const responseBody = JSON.parse(response.body);
      expect(responseBody).toEqual({
        success: true,
        data: expect.objectContaining({
          id: testInstance.id,
          status: 'DISCONNECTED',
          qrCode: null,
        }),
      });

      // Verify status update in database
      const updatedInstance = await testPrisma.instance.findUnique({
        where: { id: testInstance.id },
      });

      expect(updatedInstance?.status).toBe('DISCONNECTED');
      expect(updatedInstance?.qrCode).toBeNull();
    });

    it('should return 404 for non-existent instance', async () => {
      // Act
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/instances/non-existent-id/disconnect',
        headers: {
          authorization: `Bearer ${accessToken}`,
        },
      });

      // Assert
      expect(response.statusCode).toBe(404);
      
      const responseBody = JSON.parse(response.body);
      expect(responseBody.error).toBe('Not found');
      expect(responseBody.message).toContain('Instance not found');
    });

    it('should return 401 for unauthenticated request', async () => {
      // Act
      const response = await app.inject({
        method: 'POST',
        url: `/api/v1/instances/${testInstance.id}/disconnect`,
      });

      // Assert
      expect(response.statusCode).toBe(401);
      
      const responseBody = JSON.parse(response.body);
      expect(responseBody.error).toBe('Authentication required');
    });
  });
});