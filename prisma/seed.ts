import { PrismaClient, PlanType, UserRole } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting database seed...');

  // Create default tenant
  const defaultTenant = await prisma.tenant.upsert({
    where: { slug: 'default' },
    update: {},
    create: {
      name: 'Default Tenant',
      slug: 'default',
      plan: PlanType.PRO,
      settings: {
        timezone: 'UTC',
        dateFormat: 'YYYY-MM-DD',
        currency: 'USD'
      }
    }
  });

  console.log('✅ Created default tenant:', defaultTenant.name);

  // Create admin user
  const hashedPassword = await bcrypt.hash('admin123', 12);
  const adminUser = await prisma.user.upsert({
    where: { email: 'admin@zapin.tech' },
    update: {},
    create: {
      email: 'admin@zapin.tech',
      name: 'Admin User',
      password: hashedPassword,
      role: UserRole.ADMIN,
      tenantId: defaultTenant.id,
      emailVerified: true
    }
  });

  // Create credential account for admin user
  await prisma.account.upsert({
    where: {
      id: `credential_${adminUser.id}`
    },
    update: {},
    create: {
      id: `credential_${adminUser.id}`,
      accountId: `credential_${adminUser.id}`,
      providerId: 'credential',
      userId: adminUser.id,
      password: hashedPassword,
      createdAt: new Date(),
      updatedAt: new Date()
    }
  });

  console.log('✅ Created admin user:', adminUser.email);

  // Create demo user
  const demoPassword = await bcrypt.hash('demo123', 12);
  const demoUser = await prisma.user.upsert({
    where: { email: 'demo@zapin.tech' },
    update: {},
    create: {
      email: 'demo@zapin.tech',
      name: 'Demo User',
      password: demoPassword,
      role: UserRole.USER,
      tenantId: defaultTenant.id,
      emailVerified: true
    }
  });

  // Create credential account for demo user
  await prisma.account.upsert({
    where: {
      id: `credential_${demoUser.id}`
    },
    update: {},
    create: {
      id: `credential_${demoUser.id}`,
      accountId: `credential_${demoUser.id}`,
      providerId: 'credential',
      userId: demoUser.id,
      password: demoPassword,
      createdAt: new Date(),
      updatedAt: new Date()
    }
  });

  console.log('✅ Created demo user:', demoUser.email);

  // Create API key for demo user
  const apiKey = await prisma.apiKey.upsert({
    where: { key: 'zap_demo_key_12345678901234567890' },
    update: {},
    create: {
      name: 'Demo API Key',
      key: 'zap_demo_key_12345678901234567890',
      scopes: ['*'], // Full access for demo
      tenantId: defaultTenant.id,
      userId: demoUser.id,
      expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000) // 1 year
    }
  });

  console.log('✅ Created demo API key:', apiKey.name);

  // Create sample instance
  const sampleInstance = await prisma.instance.upsert({
    where: { evolutionInstanceId: 'demo-instance-001' },
    update: {},
    create: {
      name: 'Demo WhatsApp Instance',
      evolutionKey: 'demo-evolution-key-001',
      evolutionInstanceId: 'demo-instance-001',
      tenantId: defaultTenant.id,
      settings: {
        webhook: {
          enabled: true,
          events: ['MESSAGES_UPSERT', 'CONNECTION_UPDATE']
        },
        chatwoot: {
          enabled: false
        }
      }
    }
  });

  console.log('✅ Created sample instance:', sampleInstance.name);

  // Create quota usage records
  const currentMonth = new Date().toISOString().slice(0, 7); // YYYY-MM
  const currentDay = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const currentHour = new Date().toISOString().slice(0, 13); // YYYY-MM-DDTHH

  const quotaRecords = [
    {
      quotaType: 'MESSAGES_MONTHLY' as const,
      period: currentMonth,
      used: 150,
      limit: 100000,
      resetAt: new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1)
    },
    {
      quotaType: 'MESSAGES_DAILY' as const,
      period: currentDay,
      used: 25,
      limit: 10000,
      resetAt: new Date(new Date().setHours(24, 0, 0, 0))
    },
    {
      quotaType: 'MESSAGES_HOURLY' as const,
      period: currentHour,
      used: 5,
      limit: 1000,
      resetAt: new Date(new Date().setMinutes(60, 0, 0))
    }
  ];

  for (const quota of quotaRecords) {
    await prisma.quotaUsage.upsert({
      where: {
        tenantId_quotaType_period: {
          tenantId: defaultTenant.id,
          quotaType: quota.quotaType,
          period: quota.period
        }
      },
      update: {},
      create: {
        ...quota,
        tenantId: defaultTenant.id
      }
    });
  }

  console.log('✅ Created quota usage records');

  // Create sample message logs
  const messageLogs = [
    {
      endpoint: '/v1/message/sendText',
      method: 'POST',
      status: 'SENT' as const,
      phoneNumber: '+628123456789',
      content: 'Hello from Zapin!',
      metadata: {
        messageId: 'msg_001',
        timestamp: new Date().toISOString()
      }
    },
    {
      endpoint: '/v1/message/sendMedia',
      method: 'POST',
      status: 'DELIVERED' as const,
      phoneNumber: '+628987654321',
      content: 'Image message',
      metadata: {
        messageId: 'msg_002',
        mediaType: 'image',
        timestamp: new Date().toISOString()
      }
    }
  ];

  for (const log of messageLogs) {
    await prisma.messageLog.create({
      data: {
        ...log,
        tenantId: defaultTenant.id,
        instanceId: sampleInstance.id
      }
    });
  }

  console.log('✅ Created sample message logs');

  console.log('🎉 Database seed completed successfully!');
  console.log('\n📋 Summary:');
  console.log(`- Tenant: ${defaultTenant.name} (${defaultTenant.slug})`);
  console.log(`- Admin: ${adminUser.email} / admin123`);
  console.log(`- Demo User: ${demoUser.email} / demo123`);
  console.log(`- API Key: ${apiKey.key}`);
  console.log(`- Instance: ${sampleInstance.name}`);
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });