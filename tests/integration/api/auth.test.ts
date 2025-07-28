import { FastifyInstance } from 'fastify';
import { testPrisma, testRedis } from '../../setup/integration.setup';
import { TestDataFactory, TestUtils } from '../../helpers/test-helpers';
import { buildApp } from '../../../src/api/index';

describe('Auth API Integration Tests', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    // Clean up test data
    await testPrisma.user.deleteMany({
      where: { email: { contains: 'test' } },
    });
    await testPrisma.tenant.deleteMany({
      where: { name: { contains: 'test' } },
    });
    await testRedis.flushall();
  });

  describe('POST /api/auth/register', () => {
    it('should register a new user successfully', async () => {
      // Arrange
      const registerData = {
        email: 'test@example.com',
        password: 'Test123!@#',
        name: 'Test User',
        tenantName: 'Test Company',
      };

      // Act
      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/register',
        payload: registerData,
      });

      // Assert
      expect(response.statusCode).toBe(201);
      
      const responseBody = JSON.parse(response.body);
      expect(responseBody).toEqual({
        success: true,
        data: {
          user: expect.objectContaining({
            id: expect.any(String),
            email: registerData.email,
            name: registerData.name,
            role: 'ADMIN',
            isActive: true,
          }),
          tenant: expect.objectContaining({
            id: expect.any(String),
            name: registerData.tenantName,
            plan: 'FREE',
            status: 'ACTIVE',
          }),
          token: expect.any(String),
          refreshToken: expect.any(String),
          expiresAt: expect.any(String),
        },
      });

      // Verify user was created in database
      const createdUser = await testPrisma.user.findUnique({
        where: { email: registerData.email },
        include: { tenant: true },
      });

      expect(createdUser).toBeTruthy();
      expect(createdUser?.name).toBe(registerData.name);
      expect(createdUser?.tenant.name).toBe(registerData.tenantName);
    });

    it('should return 400 for invalid email format', async () => {
      // Arrange
      const registerData = {
        email: 'invalid-email',
        password: 'Test123!@#',
        name: 'Test User',
        tenantName: 'Test Company',
      };

      // Act
      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/register',
        payload: registerData,
      });

      // Assert
      expect(response.statusCode).toBe(400);
      
      const responseBody = JSON.parse(response.body);
      expect(responseBody.error).toBe('Validation error');
      expect(responseBody.message).toContain('email');
    });

    it('should return 400 for weak password', async () => {
      // Arrange
      const registerData = {
        email: 'test@example.com',
        password: 'weak',
        name: 'Test User',
        tenantName: 'Test Company',
      };

      // Act
      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/register',
        payload: registerData,
      });

      // Assert
      expect(response.statusCode).toBe(400);
      
      const responseBody = JSON.parse(response.body);
      expect(responseBody.error).toBe('Validation error');
      expect(responseBody.message).toContain('password');
    });

    it('should return 409 for duplicate email', async () => {
      // Arrange
      const registerData = {
        email: 'test@example.com',
        password: 'Test123!@#',
        name: 'Test User',
        tenantName: 'Test Company',
      };

      // Create user first
      await app.inject({
        method: 'POST',
        url: '/api/auth/register',
        payload: registerData,
      });

      // Act - Try to register again with same email
      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/register',
        payload: {
          ...registerData,
          name: 'Another User',
          tenantName: 'Another Company',
        },
      });

      // Assert
      expect(response.statusCode).toBe(409);
      
      const responseBody = JSON.parse(response.body);
      expect(responseBody.error).toBe('Conflict');
      expect(responseBody.message).toContain('email already exists');
    });

    it('should return 400 for missing required fields', async () => {
      // Arrange
      const incompleteData = {
        email: 'test@example.com',
        // Missing password, name, tenantName
      };

      // Act
      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/register',
        payload: incompleteData,
      });

      // Assert
      expect(response.statusCode).toBe(400);
      
      const responseBody = JSON.parse(response.body);
      expect(responseBody.error).toBe('Validation error');
    });
  });

  describe('POST /api/auth/login', () => {
    let testUser: any;
    let testTenant: any;

    beforeEach(async () => {
      // Create test user
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
    });

    it('should login user with valid credentials', async () => {
      // Arrange
      const loginData = {
        email: 'test@example.com',
        password: 'Test123!@#',
      };

      // Act
      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: loginData,
      });

      // Assert
      expect(response.statusCode).toBe(200);
      
      const responseBody = JSON.parse(response.body);
      expect(responseBody).toEqual({
        success: true,
        data: {
          user: expect.objectContaining({
            id: testUser.id,
            email: testUser.email,
            name: testUser.name,
          }),
          token: expect.any(String),
          refreshToken: expect.any(String),
          expiresAt: expect.any(String),
        },
      });
    });

    it('should return 401 for invalid email', async () => {
      // Arrange
      const loginData = {
        email: 'nonexistent@example.com',
        password: 'Test123!@#',
      };

      // Act
      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: loginData,
      });

      // Assert
      expect(response.statusCode).toBe(401);
      
      const responseBody = JSON.parse(response.body);
      expect(responseBody.error).toBe('Authentication failed');
      expect(responseBody.message).toContain('Invalid credentials');
    });

    it('should return 401 for invalid password', async () => {
      // Arrange
      const loginData = {
        email: 'test@example.com',
        password: 'WrongPassword',
      };

      // Act
      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: loginData,
      });

      // Assert
      expect(response.statusCode).toBe(401);
      
      const responseBody = JSON.parse(response.body);
      expect(responseBody.error).toBe('Authentication failed');
      expect(responseBody.message).toContain('Invalid credentials');
    });

    it('should return 400 for missing credentials', async () => {
      // Arrange
      const incompleteData = {
        email: 'test@example.com',
        // Missing password
      };

      // Act
      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: incompleteData,
      });

      // Assert
      expect(response.statusCode).toBe(400);
      
      const responseBody = JSON.parse(response.body);
      expect(responseBody.error).toBe('Validation error');
    });
  });

  describe('POST /api/auth/refresh', () => {
    let refreshToken: string;

    beforeEach(async () => {
      // Register and login to get refresh token
      await app.inject({
        method: 'POST',
        url: '/api/auth/register',
        payload: {
          email: 'test@example.com',
          password: 'Test123!@#',
          name: 'Test User',
          tenantName: 'Test Company',
        },
      });

      const loginResponse = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: {
          email: 'test@example.com',
          password: 'Test123!@#',
        },
      });

      const loginBody = JSON.parse(loginResponse.body);
      refreshToken = loginBody.data.refreshToken;
    });

    it('should refresh token with valid refresh token', async () => {
      // Act
      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/refresh',
        payload: { refreshToken },
      });

      // Assert
      expect(response.statusCode).toBe(200);
      
      const responseBody = JSON.parse(response.body);
      expect(responseBody).toEqual({
        success: true,
        data: {
          token: expect.any(String),
          refreshToken: expect.any(String),
          expiresAt: expect.any(String),
        },
      });

      // New tokens should be different from original
      expect(responseBody.data.token).not.toBe(refreshToken);
      expect(responseBody.data.refreshToken).not.toBe(refreshToken);
    });

    it('should return 401 for invalid refresh token', async () => {
      // Act
      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/refresh',
        payload: { refreshToken: 'invalid-refresh-token' },
      });

      // Assert
      expect(response.statusCode).toBe(401);
      
      const responseBody = JSON.parse(response.body);
      expect(responseBody.error).toBe('Authentication failed');
      expect(responseBody.message).toContain('Invalid refresh token');
    });

    it('should return 400 for missing refresh token', async () => {
      // Act
      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/refresh',
        payload: {},
      });

      // Assert
      expect(response.statusCode).toBe(400);
      
      const responseBody = JSON.parse(response.body);
      expect(responseBody.error).toBe('Validation error');
    });
  });

  describe('POST /api/auth/logout', () => {
    let accessToken: string;

    beforeEach(async () => {
      // Register and login to get access token
      await app.inject({
        method: 'POST',
        url: '/api/auth/register',
        payload: {
          email: 'test@example.com',
          password: 'Test123!@#',
          name: 'Test User',
          tenantName: 'Test Company',
        },
      });

      const loginResponse = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: {
          email: 'test@example.com',
          password: 'Test123!@#',
        },
      });

      const loginBody = JSON.parse(loginResponse.body);
      accessToken = loginBody.data.token;
    });

    it('should logout user successfully', async () => {
      // Act
      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/logout',
        headers: {
          authorization: `Bearer ${accessToken}`,
        },
      });

      // Assert
      expect(response.statusCode).toBe(200);
      
      const responseBody = JSON.parse(response.body);
      expect(responseBody).toEqual({
        success: true,
        message: 'Logged out successfully',
      });
    });

    it('should return 401 for missing authorization header', async () => {
      // Act
      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/logout',
      });

      // Assert
      expect(response.statusCode).toBe(401);
      
      const responseBody = JSON.parse(response.body);
      expect(responseBody.error).toBe('Authentication required');
    });

    it('should return 401 for invalid token', async () => {
      // Act
      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/logout',
        headers: {
          authorization: 'Bearer invalid-token',
        },
      });

      // Assert
      expect(response.statusCode).toBe(401);
      
      const responseBody = JSON.parse(response.body);
      expect(responseBody.error).toBe('Authentication failed');
    });
  });

  describe('GET /api/auth/me', () => {
    let accessToken: string;
    let testUser: any;

    beforeEach(async () => {
      // Register and login to get access token
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

      const loginResponse = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: {
          email: 'test@example.com',
          password: 'Test123!@#',
        },
      });

      const loginBody = JSON.parse(loginResponse.body);
      accessToken = loginBody.data.token;
    });

    it('should return current user information', async () => {
      // Act
      const response = await app.inject({
        method: 'GET',
        url: '/api/auth/me',
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
          user: expect.objectContaining({
            id: testUser.id,
            email: testUser.email,
            name: testUser.name,
            role: testUser.role,
            isActive: testUser.isActive,
          }),
          tenant: expect.objectContaining({
            id: expect.any(String),
            name: 'Test Company',
            plan: 'FREE',
            status: 'ACTIVE',
          }),
        },
      });

      // Should not include sensitive information
      expect(responseBody.data.user.password).toBeUndefined();
    });

    it('should return 401 for missing authorization header', async () => {
      // Act
      const response = await app.inject({
        method: 'GET',
        url: '/api/auth/me',
      });

      // Assert
      expect(response.statusCode).toBe(401);
      
      const responseBody = JSON.parse(response.body);
      expect(responseBody.error).toBe('Authentication required');
    });

    it('should return 401 for invalid token', async () => {
      // Act
      const response = await app.inject({
        method: 'GET',
        url: '/api/auth/me',
        headers: {
          authorization: 'Bearer invalid-token',
        },
      });

      // Assert
      expect(response.statusCode).toBe(401);
      
      const responseBody = JSON.parse(response.body);
      expect(responseBody.error).toBe('Authentication failed');
    });
  });
});