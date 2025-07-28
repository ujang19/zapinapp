import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';
import { execSync } from 'child_process';
import { join } from 'path';

// Test database and Redis instances
export const testPrisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL || 'postgresql://zapin:dev_password@localhost:5433/zapin_db_test'
    }
  }
});

export const testRedis = new Redis(
  process.env.REDIS_URL || 'redis://:dev_password@localhost:6380',
  {
    enableReadyCheck: false,
    maxRetriesPerRequest: null,
    lazyConnect: true
  }
);

// Test data factory for creating consistent test data
export class TestDataFactory {
  static async createTenant(overrides: any = {}) {
    return await testPrisma.tenant.create({
      data: {
        name: 'Test Tenant',
        slug: `test-tenant-${Date.now()}`,
        plan: 'BASIC',
        status: 'ACTIVE',
        ...overrides
      }
    });
  }

  static async createUser(tenantId: string, overrides: any = {}) {
    return await testPrisma.user.create({
      data: {
        email: `test-${Date.now()}@example.com`,
        name: 'Test User',
        password: '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBPj/hL/.LG7my', // 'password'
        role: 'USER',
        tenantId,
        isActive: true,
        ...overrides
      },
      include: {
        tenant: true
      }
    });
  }

  static async createInstance(tenantId: string, overrides: any = {}) {
    return await testPrisma.instance.create({
      data: {
        name: 'Test Instance',
        evolutionKey: `test-key-${Date.now()}`,
        evolutionInstanceId: `test-instance-${Date.now()}`,
        status: 'CREATED',
        tenantId,
        isActive: true,
        ...overrides
      }
    });
  }

  static async createBot(tenantId: string, instanceId: string, overrides: any = {}) {
    return await testPrisma.bot.create({
      data: {
        name: 'Test Bot',
        type: 'TYPEBOT',
        config: {
          typebotUrl: 'https://typebot.example.com',
          typebotId: 'test-typebot-id',
          triggerType: 'all'
        },
        tenantId,
        instanceId,
        isActive: true,
        ...overrides
      }
    });
  }

  static async createApiKey(userId: string, tenantId: string, overrides: any = {}) {
    return await testPrisma.apiKey.create({
      data: {
        name: 'Test API Key',
        key: `zap_test_${Date.now()}`,
        scopes: ['messages:send', 'instances:read'],
        userId,
        tenantId,
        isActive: true,
        ...overrides
      }
    });
  }

  static async createQuotaUsage(tenantId: string, overrides: any = {}) {
    const period = new Date().toISOString().slice(0, 7); // YYYY-MM format
    return await testPrisma.quotaUsage.create({
      data: {
        quotaType: 'MESSAGES_HOURLY',
        period,
        used: 0,
        limit: 100,
        resetAt: new Date(Date.now() + 3600000), // 1 hour from now
        tenantId,
        ...overrides
      }
    });
  }

  static async createMessageLog(tenantId: string, instanceId: string, overrides: any = {}) {
    return await testPrisma.messageLog.create({
      data: {
        endpoint: '/api/v1/message/sendText',
        method: 'POST',
        status: 'SENT',
        phoneNumber: '+1234567890',
        content: 'Test message',
        tenantId,
        instanceId,
        ...overrides
      }
    });
  }
}

// Test utilities
export class TestUtils {
  static async cleanDatabase() {
    // Clean up in reverse dependency order
    await testPrisma.messageLog.deleteMany();
    await testPrisma.quotaUsage.deleteMany();
    await testPrisma.apiKey.deleteMany();
    await testPrisma.botMessage.deleteMany();
    await testPrisma.botSession.deleteMany();
    await testPrisma.bot.deleteMany();
    await testPrisma.instance.deleteMany();
    await testPrisma.session.deleteMany();
    await testPrisma.auditLog.deleteMany();
    await testPrisma.billing.deleteMany();
    await testPrisma.user.deleteMany();
    await testPrisma.tenant.deleteMany();
  }

  static async cleanRedis() {
    await testRedis.flushall();
  }

  static async waitForCondition(
    condition: () => Promise<boolean>,
    timeout: number = 5000,
    interval: number = 100
  ): Promise<void> {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      if (await condition()) {
        return;
      }
      await new Promise(resolve => setTimeout(resolve, interval));
    }
    throw new Error(`Condition not met within ${timeout}ms`);
  }

  static generateJWT(payload: any): string {
    const jwt = require('jsonwebtoken');
    return jwt.sign(payload, process.env.JWT_SECRET || 'test-secret', { expiresIn: '1h' });
  }

  static async createAuthenticatedUser() {
    const tenant = await TestDataFactory.createTenant();
    const user = await TestDataFactory.createUser(tenant.id, { role: 'ADMIN' });
    const token = this.generateJWT({
      userId: user.id,
      tenantId: tenant.id,
      role: user.role
    });

    return { user, tenant, token };
  }

  static async setupTestEnvironment() {
    // Ensure test database is clean
    await this.cleanDatabase();
    await this.cleanRedis();
    
    // Connect to test services
    await testPrisma.$connect();
    await testRedis.connect();
  }

  static async teardownTestEnvironment() {
    // Clean up and disconnect
    await this.cleanDatabase();
    await this.cleanRedis();
    await testPrisma.$disconnect();
    await testRedis.disconnect();
  }
}

// Global test hooks
beforeAll(async () => {
  await TestUtils.setupTestEnvironment();
});

afterAll(async () => {
  await TestUtils.teardownTestEnvironment();
});