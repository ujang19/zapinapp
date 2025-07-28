import { execSync } from 'child_process';
import { join } from 'path';

export default async function globalTeardown() {
  console.log('🧹 Starting global test teardown...');

  try {
    // Clean up test database
    console.log('🗄️  Cleaning up test database...');
    try {
      execSync('npx prisma migrate reset --force --skip-seed', {
        stdio: 'inherit',
        env: {
          ...process.env,
          DATABASE_URL: 'postgresql://zapin:dev_password@localhost:5433/zapin_db_test',
        },
      });
    } catch (error) {
      console.warn('⚠️  Could not reset test database');
    }

    // Stop test containers
    console.log('🛑 Stopping test containers...');
    try {
      execSync('docker-compose -f docker-compose.development.yml --profile testing down', {
        stdio: 'inherit',
        cwd: join(__dirname, '../..'),
      });
    } catch (error) {
      console.warn('⚠️  Could not stop test containers');
    }

    console.log('✅ Global test teardown completed');
  } catch (error) {
    console.error('❌ Global test teardown failed:', error);
    // Don't throw error to avoid failing the test suite
  }
}