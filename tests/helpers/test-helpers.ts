// Test helper utilities and factories

import { faker } from '@faker-js/faker';
import bcrypt from 'bcryptjs';

// Test data factories
export class TestDataFactory {
  static createUserData(overrides: Partial<any> = {}) {
    return {
      id: faker.string.uuid(),
      email: faker.internet.email(),
      password: 'Test123!@#',
      name: faker.person.fullName(),
      avatar: faker.image.avatar(),
      role: 'USER' as const,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      tenantId: faker.string.uuid(),
      ...overrides,
    };
  }

  static createTenantData(overrides: Partial<any> = {}) {
    const name = faker.company.name();
    return {
      id: faker.string.uuid(),
      name,
      slug: name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, ''),
      domain: faker.internet.domainName(),
      plan: 'FREE' as const,
      status: 'ACTIVE' as const,
      settings: {},
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    };
  }

  static createInstanceData(overrides: Partial<any> = {}) {
    return {
      id: faker.string.uuid(),
      name: faker.lorem.words(2),
      phoneNumber: faker.phone.number({ style: 'international' }),
      status: 'DISCONNECTED' as const,
      evolutionKey: faker.string.alphanumeric(32),
      evolutionInstanceId: faker.string.alphanumeric(16),
      qrCode: null,
      webhookUrl: faker.internet.url(),
      settings: {},
      createdAt: new Date(),
      updatedAt: new Date(),
      tenantId: faker.string.uuid(),
      ...overrides,
    };
  }

  static createBotData(overrides: Partial<any> = {}) {
    return {
      id: faker.string.uuid(),
      name: faker.lorem.words(2),
      prompt: faker.lorem.paragraph(),
      isActive: true,
      settings: {},
      createdAt: new Date(),
      updatedAt: new Date(),
      tenantId: faker.string.uuid(),
      ...overrides,
    };
  }

  static createApiKeyData(overrides: Partial<any> = {}) {
    return {
      id: faker.string.uuid(),
      name: faker.lorem.words(2),
      key: `zap_${faker.string.alphanumeric(32)}`,
      permissions: ['read', 'write'],
      lastUsedAt: null,
      expiresAt: null,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      tenantId: faker.string.uuid(),
      ...overrides,
    };
  }

  static createMessageData(overrides: Partial<any> = {}) {
    return {
      id: faker.string.uuid(),
      content: faker.lorem.sentence(),
      type: 'text' as const,
      direction: 'outbound' as const,
      status: 'sent' as const,
      phoneNumber: faker.phone.number({ style: 'international' }),
      messageId: faker.string.alphanumeric(16),
      metadata: {},
      createdAt: new Date(),
      updatedAt: new Date(),
      instanceId: faker.string.uuid(),
      ...overrides,
    };
  }

  static async createHashedPassword(password: string = 'Test123!@#'): Promise<string> {
    return await bcrypt.hash(password, 10);
  }
}

// Test utilities
export class TestUtils {
  static async sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  static generateRandomString(length: number = 10): string {
    return faker.string.alphanumeric(length);
  }

  static generateRandomEmail(): string {
    return faker.internet.email();
  }

  static generateRandomPhoneNumber(): string {
    return faker.phone.number({ style: 'international' });
  }

  static generateRandomUrl(): string {
    return faker.internet.url();
  }

  static createMockRequest(overrides: Partial<any> = {}) {
    return {
      body: {},
      params: {},
      query: {},
      headers: {},
      user: null,
      tenant: null,
      ...overrides,
    };
  }

  static createMockResponse() {
    const res: any = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    res.send = jest.fn().mockReturnValue(res);
    res.end = jest.fn().mockReturnValue(res);
    res.cookie = jest.fn().mockReturnValue(res);
    res.clearCookie = jest.fn().mockReturnValue(res);
    res.redirect = jest.fn().mockReturnValue(res);
    res.header = jest.fn().mockReturnValue(res);
    res.set = jest.fn().mockReturnValue(res);
    return res;
  }

  static createMockNext() {
    return jest.fn();
  }

  static expectValidationError(error: any, field: string, message?: string) {
    expect(error).toBeDefined();
    expect(error.name).toBe('ValidationError');
    expect(error.details).toBeDefined();
    
    const fieldError = error.details.find((detail: any) => 
      detail.path.includes(field)
    );
    
    expect(fieldError).toBeDefined();
    
    if (message) {
      expect(fieldError.message).toContain(message);
    }
  }

  static expectDatabaseError(error: any, code?: string) {
    expect(error).toBeDefined();
    expect(error.name).toBe('PrismaClientKnownRequestError');
    
    if (code) {
      expect(error.code).toBe(code);
    }
  }

  static expectAuthenticationError(error: any) {
    expect(error).toBeDefined();
    expect(error.message).toContain('authentication');
  }

  static expectAuthorizationError(error: any) {
    expect(error).toBeDefined();
    expect(error.message).toContain('authorization');
  }

  static createJWTPayload(overrides: Partial<any> = {}) {
    return {
      userId: faker.string.uuid(),
      tenantId: faker.string.uuid(),
      role: 'USER',
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + (7 * 24 * 60 * 60), // 7 days
      ...overrides,
    };
  }

  static createWebhookPayload(overrides: Partial<any> = {}) {
    return {
      instanceName: faker.lorem.word(),
      data: {
        key: {
          remoteJid: faker.phone.number({ style: 'international' }) + '@s.whatsapp.net',
          fromMe: false,
          id: faker.string.alphanumeric(16),
        },
        message: {
          conversation: faker.lorem.sentence(),
        },
        messageTimestamp: Math.floor(Date.now() / 1000),
        pushName: faker.person.firstName(),
      },
      destination: faker.internet.url(),
      date_time: new Date().toISOString(),
      sender: faker.phone.number({ style: 'international' }),
      server_url: faker.internet.url(),
      apikey: faker.string.alphanumeric(32),
      ...overrides,
    };
  }
}

// Mock implementations
export class MockImplementations {
  static createMockPrismaClient() {
    return {
      $connect: jest.fn(),
      $disconnect: jest.fn(),
      $transaction: jest.fn(),
      user: {
        create: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        count: jest.fn(),
      },
      tenant: {
        create: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        count: jest.fn(),
      },
      instance: {
        create: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        count: jest.fn(),
      },
      bot: {
        create: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        count: jest.fn(),
      },
      apiKey: {
        create: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        count: jest.fn(),
      },
    };
  }

  static createMockRedisClient() {
    return {
      get: jest.fn(),
      set: jest.fn(),
      del: jest.fn(),
      exists: jest.fn(),
      expire: jest.fn(),
      ttl: jest.fn(),
      keys: jest.fn(),
      flushall: jest.fn(),
      quit: jest.fn(),
      disconnect: jest.fn(),
      on: jest.fn(),
      off: jest.fn(),
      ping: jest.fn(),
    };
  }

  static createMockLogger() {
    return {
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
      child: jest.fn().mockReturnThis(),
    };
  }

  static createMockEvolutionService() {
    return {
      createInstance: jest.fn(),
      deleteInstance: jest.fn(),
      getInstanceStatus: jest.fn(),
      sendMessage: jest.fn(),
      getQRCode: jest.fn(),
      connectInstance: jest.fn(),
      disconnectInstance: jest.fn(),
    };
  }
}

// Test assertions
export class TestAssertions {
  static assertValidUser(user: any) {
    expect(user).toBeDefined();
    expect(user.id).toBeValidUUID();
    expect(user.email).toBeValidEmail();
    expect(user.name).toBeDefined();
    expect(user.role).toMatch(/^(ADMIN|USER)$/);
    expect(user.isActive).toBeDefined();
    expect(user.createdAt).toBeValidDate();
    expect(user.updatedAt).toBeValidDate();
    expect(user.tenantId).toBeValidUUID();
  }

  static assertValidTenant(tenant: any) {
    expect(tenant).toBeDefined();
    expect(tenant.id).toBeValidUUID();
    expect(tenant.name).toBeDefined();
    expect(tenant.slug).toBeDefined();
    expect(tenant.plan).toMatch(/^(FREE|BASIC|PRO|ENTERPRISE)$/);
    expect(tenant.status).toMatch(/^(ACTIVE|INACTIVE|SUSPENDED)$/);
    expect(tenant.createdAt).toBeValidDate();
    expect(tenant.updatedAt).toBeValidDate();
  }

  static assertValidInstance(instance: any) {
    expect(instance).toBeDefined();
    expect(instance.id).toBeValidUUID();
    expect(instance.name).toBeDefined();
    expect(instance.phoneNumber).toBeValidPhoneNumber();
    expect(instance.status).toMatch(/^(CONNECTED|DISCONNECTED|CONNECTING)$/);
    expect(instance.createdAt).toBeValidDate();
    expect(instance.updatedAt).toBeValidDate();
    expect(instance.tenantId).toBeValidUUID();
  }

  static assertValidBot(bot: any) {
    expect(bot).toBeDefined();
    expect(bot.id).toBeValidUUID();
    expect(bot.name).toBeDefined();
    expect(bot.prompt).toBeDefined();
    expect(bot.isActive).toBeDefined();
    expect(bot.createdAt).toBeValidDate();
    expect(bot.updatedAt).toBeValidDate();
    expect(bot.tenantId).toBeValidUUID();
  }

  static assertValidApiKey(apiKey: any) {
    expect(apiKey).toBeDefined();
    expect(apiKey.id).toBeValidUUID();
    expect(apiKey.name).toBeDefined();
    expect(apiKey.key).toMatch(/^zap_[a-zA-Z0-9]{32}$/);
    expect(apiKey.permissions).toBeDefined();
    expect(Array.isArray(apiKey.permissions)).toBe(true);
    expect(apiKey.isActive).toBeDefined();
    expect(apiKey.createdAt).toBeValidDate();
    expect(apiKey.updatedAt).toBeValidDate();
    expect(apiKey.tenantId).toBeValidUUID();
  }
}