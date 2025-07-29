import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FastifyInstance } from 'fastify';
import { buildServer } from '../../src/api';
import { prisma } from '../../src/lib/prisma';

describe('Better Auth Integration', () => {
  let app: FastifyInstance;
  let testTenant: any;
  let testUser: any;
  let authCookie: string;

  beforeAll(async () => {
    app = await buildServer();
    await app.ready();

    // Create test tenant
    testTenant = await prisma.tenant.create({
      data: {
        name: 'Test Tenant',
        slug: 'test-tenant',
        status: 'ACTIVE'
      }
    });
  });

  afterAll(async () => {
    // Cleanup
    if (testUser) {
      await prisma.user.delete({ where: { id: testUser.id } });
    }
    if (testTenant) {
      await prisma.tenant.delete({ where: { id: testTenant.id } });
    }
    await app.close();
  });

  it('should sign up a new user via Better Auth', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-up',
      payload: {
        email: 'test@example.com',
        password: 'password123',
        name: 'Test User',
        tenantId: testTenant.id,
        role: 'USER'
      }
    });

    expect(response.statusCode).toBe(200);
    const data = JSON.parse(response.body);
    expect(data.user).toBeDefined();
    expect(data.user.email).toBe('test@example.com');
    expect(data.user.tenantId).toBe(testTenant.id);
    expect(data.user.role).toBe('USER');

    testUser = data.user;
  });

  it('should sign in user via Better Auth', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-in',
      payload: {
        email: 'test@example.com',
        password: 'password123'
      }
    });

    expect(response.statusCode).toBe(200);
    const data = JSON.parse(response.body);
    expect(data.user).toBeDefined();
    expect(data.session).toBeDefined();

    // Extract session cookie for subsequent requests
    const setCookieHeader = response.headers['set-cookie'];
    if (Array.isArray(setCookieHeader)) {
      authCookie = setCookieHeader.find(cookie => cookie.includes('better-auth.session_token'))?.split(';')[0] || '';
    }
  });

  it('should get session info via Better Auth', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/auth/session',
      headers: {
        cookie: authCookie
      }
    });

    expect(response.statusCode).toBe(200);
    const data = JSON.parse(response.body);
    expect(data.user).toBeDefined();
    expect(data.user.tenantId).toBe(testTenant.id);
    expect(data.user.role).toBe('USER');
    expect(data.session).toBeDefined();
  });

  it('should create API key for authenticated user', async () => {
    // First, create an API key using the existing endpoint
    const apiKeyResponse = await app.inject({
      method: 'POST',
      url: '/api-keys',
      headers: {
        cookie: authCookie
      },
      payload: {
        name: 'Test API Key',
        scopes: ['instances:read', 'instances:write']
      }
    });

    expect(apiKeyResponse.statusCode).toBe(201);
    const apiKeyData = JSON.parse(apiKeyResponse.body);
    expect(apiKeyData.success).toBe(true);
    expect(apiKeyData.data.key).toBeDefined();
    expect(apiKeyData.data.name).toBe('Test API Key');
    expect(apiKeyData.data.scopes).toEqual(['instances:read', 'instances:write']);
  });

  it('should sign out user via Better Auth', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-out',
      headers: {
        cookie: authCookie
      }
    });

    expect(response.statusCode).toBe(200);

    // Verify session is invalidated
    const sessionResponse = await app.inject({
      method: 'GET',
      url: '/api/auth/session',
      headers: {
        cookie: authCookie
      }
    });

    expect(sessionResponse.statusCode).toBe(401);
  });
});