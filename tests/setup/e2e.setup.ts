// End-to-end test specific setup
import { chromium, Browser, BrowserContext } from '@playwright/test';
import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';
import '../helpers/test-helpers';

let browser: Browser;
let context: BrowserContext;
let testPrisma: PrismaClient;
let testRedis: Redis;

// Setup browser and services for E2E tests
beforeAll(async () => {
  // Launch browser
  browser = await chromium.launch({
    headless: process.env.CI === 'true',
    slowMo: process.env.CI === 'true' ? 0 : 100,
  });

  // Create browser context
  context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    ignoreHTTPSErrors: true,
    recordVideo: {
      dir: 'tests/videos/',
      size: { width: 1280, height: 720 },
    },
    recordHar: {
      path: 'tests/har/test.har',
    },
  });

  // Initialize test database connection
  testPrisma = new PrismaClient({
    datasources: {
      db: {
        url: process.env.DATABASE_URL || 'postgresql://zapin:dev_password@localhost:5433/zapin_db_test',
      },
    },
  });

  // Initialize test Redis connection
  testRedis = new Redis(process.env.REDIS_URL || 'redis://:dev_password@localhost:6380');

  // Connect to services
  await testPrisma.$connect();
  await testRedis.ping();

  // Wait for application to be ready
  await waitForApplication();

  console.log('✅ E2E test environment ready');
});

// Clean up after all tests
afterAll(async () => {
  // Close browser
  if (context) {
    await context.close();
  }
  if (browser) {
    await browser.close();
  }

  // Clean up database
  if (testPrisma) {
    await cleanupDatabase();
    await testPrisma.$disconnect();
  }

  // Clean up Redis
  if (testRedis) {
    await testRedis.flushall();
    await testRedis.quit();
  }

  console.log('✅ E2E test cleanup completed');
});

// Clean up between tests
beforeEach(async () => {
  // Clear Redis cache
  if (testRedis) {
    await testRedis.flushall();
  }

  // Clean up test data
  if (testPrisma) {
    await cleanupTestData();
  }
});

// Helper function to wait for application to be ready
async function waitForApplication() {
  const maxRetries = 30;
  const retryDelay = 2000;

  for (let i = 0; i < maxRetries; i++) {
    try {
      const response = await fetch('http://localhost:3001/health');
      if (response.ok) {
        console.log('✅ Application is ready');
        return;
      }
    } catch (error) {
      console.log(`⏳ Waiting for application... (${i + 1}/${maxRetries})`);
      await new Promise(resolve => setTimeout(resolve, retryDelay));
    }
  }

  throw new Error('Application failed to start within timeout');
}

// Helper function to clean up database
async function cleanupDatabase() {
  try {
    // Delete in correct order to respect foreign key constraints
    await testPrisma.bot.deleteMany();
    await testPrisma.instance.deleteMany();
    await testPrisma.apiKey.deleteMany();
    await testPrisma.user.deleteMany();
    await testPrisma.tenant.deleteMany();
  } catch (error) {
    console.warn('Warning: Could not clean up database:', error);
  }
}

// Helper function to clean up test data
async function cleanupTestData() {
  try {
    // Only delete test data (data created during tests)
    await testPrisma.bot.deleteMany({
      where: {
        name: { contains: 'test' },
      },
    });

    await testPrisma.instance.deleteMany({
      where: {
        name: { contains: 'test' },
      },
    });

    await testPrisma.user.deleteMany({
      where: {
        email: { contains: 'test' },
      },
    });

    await testPrisma.tenant.deleteMany({
      where: {
        name: { contains: 'test' },
      },
    });
  } catch (error) {
    console.warn('Warning: Could not clean up test data:', error);
  }
}

// Helper function to create test user
export async function createTestUser(userData: {
  email: string;
  password: string;
  name: string;
  tenantName: string;
}) {
  const tenant = await testPrisma.tenant.create({
    data: {
      name: userData.tenantName,
      slug: userData.tenantName.toLowerCase().replace(/\s+/g, '-'),
      plan: 'BASIC',
      status: 'ACTIVE',
    },
  });

  const user = await testPrisma.user.create({
    data: {
      email: userData.email,
      password: userData.password, // In real app, this would be hashed
      name: userData.name,
      role: 'ADMIN',
      isActive: true,
      tenantId: tenant.id,
      emailVerified: true,
    },
  });

  return { user, tenant };
}

// Helper function to login user in browser
export async function loginUser(page: any, email: string, password: string) {
  await page.goto('http://localhost:3000/login');
  await page.fill('[data-testid="email-input"]', email);
  await page.fill('[data-testid="password-input"]', password);
  await page.click('[data-testid="login-button"]');
  await page.waitForURL('**/dashboard');
}

// Helper function to create test instance
export async function createTestInstance(tenantId: string, instanceData: {
  name: string;
  phoneNumber: string;
}) {
  return await testPrisma.instance.create({
    data: {
      name: instanceData.name,
      phoneNumber: instanceData.phoneNumber,
      status: 'DISCONNECTED',
      evolutionKey: `test_key_${Date.now()}`,
      evolutionInstanceId: `test_instance_${Date.now()}`,
      tenantId,
    },
  });
}

// Helper function to create test bot
export async function createTestBot(tenantId: string, instanceId: string, botData: {
  name: string;
  type: 'TYPEBOT' | 'OPENAI';
  config: any;
}) {
  return await testPrisma.bot.create({
    data: {
      name: botData.name,
      type: botData.type,
      config: botData.config,
      isActive: true,
      tenantId,
      instanceId,
    },
  });
}

// Export test clients and browser context for use in E2E tests
export { browser, context, testPrisma, testRedis };