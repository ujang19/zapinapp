import { execSync } from 'child_process';
import { join } from 'path';

export default async function globalSetup() {
  console.log('🚀 Starting global test setup...');

  try {
    // Set test environment
    (process.env as any).NODE_ENV = 'test';
    (process.env as any).DATABASE_URL = 'postgresql://zapin:dev_password@localhost:5433/zapin_db_test';
    (process.env as any).REDIS_URL = 'redis://:dev_password@localhost:6380';

    // Start test containers if not running
    console.log('📦 Starting test containers...');
    try {
      execSync('docker-compose -f docker-compose.development.yml --profile testing up -d postgres-test redis-test', {
        stdio: 'inherit',
        cwd: join(__dirname, '../..'),
      });
    } catch (error) {
      console.warn('⚠️  Could not start test containers, assuming they are already running');
    }

    // Wait for services to be ready
    console.log('⏳ Waiting for test services to be ready...');
    await new Promise(resolve => setTimeout(resolve, 10000));

    // Run database migrations for test database
    console.log('🗄️  Running test database migrations...');
    try {
      execSync('npx prisma migrate deploy', {
        stdio: 'inherit',
        env: {
          ...process.env,
          DATABASE_URL: 'postgresql://zapin:dev_password@localhost:5433/zapin_db_test',
        },
      });
    } catch (error) {
      console.warn('⚠️  Could not run migrations, database might not be ready');
    }

    console.log('✅ Global test setup completed');
  } catch (error) {
    console.error('❌ Global test setup failed:', error);
    throw error;
  }
}