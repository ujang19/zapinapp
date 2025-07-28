import { test, expect, Page } from '@playwright/test';
import { testPrisma, testRedis, createTestUser, loginUser, createTestInstance } from '../setup/e2e.setup';

test.describe('User Workflows E2E Tests', () => {
  let page: Page;

  test.beforeEach(async ({ browser }) => {
    page = await browser.newPage();
    
    // Clean up test data
    await testPrisma.instance.deleteMany({
      where: { name: { contains: 'test' } },
    });
    await testPrisma.bot.deleteMany({
      where: { name: { contains: 'test' } },
    });
    await testPrisma.user.deleteMany({
      where: { email: { contains: 'test' } },
    });
    await testPrisma.tenant.deleteMany({
      where: { name: { contains: 'test' } },
    });
    await testRedis.flushall();
  });

  test.afterEach(async () => {
    await page.close();
  });

  test.describe('User Registration and Login Flow', () => {
    test('should complete full registration and login workflow', async () => {
      // Navigate to registration page
      await page.goto('http://localhost:3000/register');
      
      // Verify registration page elements
      await expect(page.locator('[data-testid="register-form"]')).toBeVisible();
      await expect(page.locator('[data-testid="email-input"]')).toBeVisible();
      await expect(page.locator('[data-testid="password-input"]')).toBeVisible();
      await expect(page.locator('[data-testid="name-input"]')).toBeVisible();
      await expect(page.locator('[data-testid="tenant-name-input"]')).toBeVisible();
      
      // Fill registration form
      await page.fill('[data-testid="email-input"]', 'test@example.com');
      await page.fill('[data-testid="password-input"]', 'Test123!@#');
      await page.fill('[data-testid="name-input"]', 'Test User');
      await page.fill('[data-testid="tenant-name-input"]', 'Test Company');
      
      // Submit registration
      await page.click('[data-testid="register-button"]');
      
      // Should redirect to dashboard after successful registration
      await expect(page).toHaveURL(/.*\/dashboard/);
      
      // Verify dashboard elements
      await expect(page.locator('[data-testid="dashboard-header"]')).toBeVisible();
      await expect(page.locator('[data-testid="user-menu"]')).toContainText('Test User');
      await expect(page.locator('[data-testid="tenant-name"]')).toContainText('Test Company');
      
      // Logout
      await page.click('[data-testid="user-menu"]');
      await page.click('[data-testid="logout-button"]');
      
      // Should redirect to login page
      await expect(page).toHaveURL(/.*\/login/);
      
      // Login with registered credentials
      await page.fill('[data-testid="email-input"]', 'test@example.com');
      await page.fill('[data-testid="password-input"]', 'Test123!@#');
      await page.click('[data-testid="login-button"]');
      
      // Should redirect to dashboard
      await expect(page).toHaveURL(/.*\/dashboard/);
      await expect(page.locator('[data-testid="user-menu"]')).toContainText('Test User');
    });

    test('should show validation errors for invalid registration data', async () => {
      await page.goto('http://localhost:3000/register');
      
      // Try to submit with invalid email
      await page.fill('[data-testid="email-input"]', 'invalid-email');
      await page.fill('[data-testid="password-input"]', 'Test123!@#');
      await page.fill('[data-testid="name-input"]', 'Test User');
      await page.fill('[data-testid="tenant-name-input"]', 'Test Company');
      await page.click('[data-testid="register-button"]');
      
      // Should show email validation error
      await expect(page.locator('[data-testid="email-error"]')).toBeVisible();
      await expect(page.locator('[data-testid="email-error"]')).toContainText('Invalid email format');
      
      // Fix email and try weak password
      await page.fill('[data-testid="email-input"]', 'test@example.com');
      await page.fill('[data-testid="password-input"]', 'weak');
      await page.click('[data-testid="register-button"]');
      
      // Should show password validation error
      await expect(page.locator('[data-testid="password-error"]')).toBeVisible();
      await expect(page.locator('[data-testid="password-error"]')).toContainText('Password must be at least 8 characters');
    });

    test('should show error for invalid login credentials', async () => {
      // Create test user first
      await createTestUser({
        email: 'test@example.com',
        password: 'Test123!@#',
        name: 'Test User',
        tenantName: 'Test Company',
      });
      
      await page.goto('http://localhost:3000/login');
      
      // Try login with wrong password
      await page.fill('[data-testid="email-input"]', 'test@example.com');
      await page.fill('[data-testid="password-input"]', 'WrongPassword');
      await page.click('[data-testid="login-button"]');
      
      // Should show error message
      await expect(page.locator('[data-testid="login-error"]')).toBeVisible();
      await expect(page.locator('[data-testid="login-error"]')).toContainText('Invalid credentials');
      
      // Try login with non-existent email
      await page.fill('[data-testid="email-input"]', 'nonexistent@example.com');
      await page.fill('[data-testid="password-input"]', 'Test123!@#');
      await page.click('[data-testid="login-button"]');
      
      // Should show error message
      await expect(page.locator('[data-testid="login-error"]')).toBeVisible();
      await expect(page.locator('[data-testid="login-error"]')).toContainText('Invalid credentials');
    });
  });

  test.describe('Instance Management Workflow', () => {
    test.beforeEach(async () => {
      // Create test user and login
      const { user, tenant } = await createTestUser({
        email: 'test@example.com',
        password: 'Test123!@#',
        name: 'Test User',
        tenantName: 'Test Company',
      });
      
      await loginUser(page, 'test@example.com', 'Test123!@#');
    });

    test('should complete full instance creation and management workflow', async () => {
      // Navigate to instances page
      await page.click('[data-testid="nav-instances"]');
      await expect(page).toHaveURL(/.*\/dashboard\/instances/);
      
      // Should show empty state initially
      await expect(page.locator('[data-testid="empty-instances"]')).toBeVisible();
      await expect(page.locator('[data-testid="create-instance-button"]')).toBeVisible();
      
      // Click create instance button
      await page.click('[data-testid="create-instance-button"]');
      await expect(page).toHaveURL(/.*\/dashboard\/instances\/create/);
      
      // Fill instance creation form
      await page.fill('[data-testid="instance-name-input"]', 'Test Instance');
      await page.fill('[data-testid="phone-number-input"]', '+6281234567890');
      await page.fill('[data-testid="webhook-url-input"]', 'https://example.com/webhook');
      
      // Submit form
      await page.click('[data-testid="create-instance-submit"]');
      
      // Should redirect to instances list
      await expect(page).toHaveURL(/.*\/dashboard\/instances/);
      
      // Should show created instance
      await expect(page.locator('[data-testid="instance-card"]')).toBeVisible();
      await expect(page.locator('[data-testid="instance-name"]')).toContainText('Test Instance');
      await expect(page.locator('[data-testid="instance-phone"]')).toContainText('+6281234567890');
      await expect(page.locator('[data-testid="instance-status"]')).toContainText('DISCONNECTED');
      
      // Click on instance to view details
      await page.click('[data-testid="instance-card"]');
      await expect(page).toHaveURL(/.*\/dashboard\/instances\/[^/]+$/);
      
      // Verify instance details page
      await expect(page.locator('[data-testid="instance-details"]')).toBeVisible();
      await expect(page.locator('[data-testid="instance-name-display"]')).toContainText('Test Instance');
      await expect(page.locator('[data-testid="connect-button"]')).toBeVisible();
      await expect(page.locator('[data-testid="edit-button"]')).toBeVisible();
      await expect(page.locator('[data-testid="delete-button"]')).toBeVisible();
      
      // Test connect functionality
      await page.click('[data-testid="connect-button"]');
      
      // Should show connecting status and QR code
      await expect(page.locator('[data-testid="instance-status"]')).toContainText('CONNECTING');
      await expect(page.locator('[data-testid="qr-code"]')).toBeVisible();
      
      // Test disconnect functionality
      await page.click('[data-testid="disconnect-button"]');
      
      // Should show disconnected status
      await expect(page.locator('[data-testid="instance-status"]')).toContainText('DISCONNECTED');
      await expect(page.locator('[data-testid="qr-code"]')).not.toBeVisible();
      
      // Test edit functionality
      await page.click('[data-testid="edit-button"]');
      
      // Should show edit form
      await expect(page.locator('[data-testid="edit-instance-form"]')).toBeVisible();
      
      // Update instance name
      await page.fill('[data-testid="instance-name-input"]', 'Updated Test Instance');
      await page.click('[data-testid="save-changes-button"]');
      
      // Should show updated name
      await expect(page.locator('[data-testid="instance-name-display"]')).toContainText('Updated Test Instance');
      
      // Test delete functionality
      await page.click('[data-testid="delete-button"]');
      
      // Should show confirmation dialog
      await expect(page.locator('[data-testid="delete-confirmation"]')).toBeVisible();
      await page.click('[data-testid="confirm-delete-button"]');
      
      // Should redirect to instances list
      await expect(page).toHaveURL(/.*\/dashboard\/instances/);
      
      // Should show empty state again
      await expect(page.locator('[data-testid="empty-instances"]')).toBeVisible();
    });

    test('should show validation errors for invalid instance data', async () => {
      await page.click('[data-testid="nav-instances"]');
      await page.click('[data-testid="create-instance-button"]');
      
      // Try to submit with invalid phone number
      await page.fill('[data-testid="instance-name-input"]', 'Test Instance');
      await page.fill('[data-testid="phone-number-input"]', 'invalid-phone');
      await page.fill('[data-testid="webhook-url-input"]', 'https://example.com/webhook');
      await page.click('[data-testid="create-instance-submit"]');
      
      // Should show phone number validation error
      await expect(page.locator('[data-testid="phone-error"]')).toBeVisible();
      await expect(page.locator('[data-testid="phone-error"]')).toContainText('Invalid phone number format');
      
      // Fix phone and try invalid webhook URL
      await page.fill('[data-testid="phone-number-input"]', '+6281234567890');
      await page.fill('[data-testid="webhook-url-input"]', 'invalid-url');
      await page.click('[data-testid="create-instance-submit"]');
      
      // Should show webhook URL validation error
      await expect(page.locator('[data-testid="webhook-error"]')).toBeVisible();
      await expect(page.locator('[data-testid="webhook-error"]')).toContainText('Invalid webhook URL format');
    });
  });

  test.describe('Bot Management Workflow', () => {
    test.beforeEach(async () => {
      // Create test user and login
      const { user, tenant } = await createTestUser({
        email: 'test@example.com',
        password: 'Test123!@#',
        name: 'Test User',
        tenantName: 'Test Company',
      });
      
      await loginUser(page, 'test@example.com', 'Test123!@#');
    });

    test('should complete full bot creation and management workflow', async () => {
      // Navigate to bots page
      await page.click('[data-testid="nav-bots"]');
      await expect(page).toHaveURL(/.*\/dashboard\/bots/);
      
      // Should show empty state initially
      await expect(page.locator('[data-testid="empty-bots"]')).toBeVisible();
      await expect(page.locator('[data-testid="create-bot-button"]')).toBeVisible();
      
      // Click create bot button
      await page.click('[data-testid="create-bot-button"]');
      await expect(page).toHaveURL(/.*\/dashboard\/bots\/create/);
      
      // Fill bot creation form
      await page.fill('[data-testid="bot-name-input"]', 'Test Bot');
      await page.fill('[data-testid="bot-prompt-input"]', 'You are a helpful assistant for customer support.');
      
      // Submit form
      await page.click('[data-testid="create-bot-submit"]');
      
      // Should redirect to bots list
      await expect(page).toHaveURL(/.*\/dashboard\/bots/);
      
      // Should show created bot
      await expect(page.locator('[data-testid="bot-card"]')).toBeVisible();
      await expect(page.locator('[data-testid="bot-name"]')).toContainText('Test Bot');
      await expect(page.locator('[data-testid="bot-status"]')).toContainText('Active');
      
      // Click on bot to view details
      await page.click('[data-testid="bot-card"]');
      await expect(page).toHaveURL(/.*\/dashboard\/bots\/[^/]+$/);
      
      // Verify bot details page
      await expect(page.locator('[data-testid="bot-details"]')).toBeVisible();
      await expect(page.locator('[data-testid="bot-name-display"]')).toContainText('Test Bot');
      await expect(page.locator('[data-testid="bot-prompt-display"]')).toContainText('You are a helpful assistant');
      
      // Test bot functionality
      await page.click('[data-testid="test-bot-button"]');
      
      // Should show bot tester
      await expect(page.locator('[data-testid="bot-tester"]')).toBeVisible();
      
      // Send test message
      await page.fill('[data-testid="test-message-input"]', 'Hello, how can you help me?');
      await page.click('[data-testid="send-test-message"]');
      
      // Should show bot response
      await expect(page.locator('[data-testid="bot-response"]')).toBeVisible();
      
      // Test edit functionality
      await page.click('[data-testid="edit-bot-button"]');
      
      // Should show edit form
      await expect(page.locator('[data-testid="edit-bot-form"]')).toBeVisible();
      
      // Update bot name
      await page.fill('[data-testid="bot-name-input"]', 'Updated Test Bot');
      await page.click('[data-testid="save-bot-changes"]');
      
      // Should show updated name
      await expect(page.locator('[data-testid="bot-name-display"]')).toContainText('Updated Test Bot');
      
      // Test deactivate/activate functionality
      await page.click('[data-testid="deactivate-bot-button"]');
      await expect(page.locator('[data-testid="bot-status"]')).toContainText('Inactive');
      
      await page.click('[data-testid="activate-bot-button"]');
      await expect(page.locator('[data-testid="bot-status"]')).toContainText('Active');
      
      // Test delete functionality
      await page.click('[data-testid="delete-bot-button"]');
      
      // Should show confirmation dialog
      await expect(page.locator('[data-testid="delete-bot-confirmation"]')).toBeVisible();
      await page.click('[data-testid="confirm-delete-bot"]');
      
      // Should redirect to bots list
      await expect(page).toHaveURL(/.*\/dashboard\/bots/);
      
      // Should show empty state again
      await expect(page.locator('[data-testid="empty-bots"]')).toBeVisible();
    });
  });

  test.describe('Message Sending Workflow', () => {
    test.beforeEach(async () => {
      // Create test user and login
      const { user, tenant } = await createTestUser({
        email: 'test@example.com',
        password: 'Test123!@#',
        name: 'Test User',
        tenantName: 'Test Company',
      });
      
      // Create test instance
      await createTestInstance(tenant.id, {
        name: 'Test Instance',
        phoneNumber: '+6281234567890',
      });
      
      await loginUser(page, 'test@example.com', 'Test123!@#');
    });

    test('should complete message sending workflow', async () => {
      // Navigate to messages page
      await page.click('[data-testid="nav-messages"]');
      await expect(page).toHaveURL(/.*\/dashboard\/messages/);
      
      // Should show message composer
      await expect(page.locator('[data-testid="message-composer"]')).toBeVisible();
      
      // Select instance
      await page.click('[data-testid="instance-selector"]');
      await page.click('[data-testid="instance-option"]');
      
      // Fill message form
      await page.fill('[data-testid="recipient-input"]', '+6281234567891');
      await page.fill('[data-testid="message-input"]', 'Hello, this is a test message!');
      
      // Send message
      await page.click('[data-testid="send-message-button"]');
      
      // Should show success notification
      await expect(page.locator('[data-testid="success-notification"]')).toBeVisible();
      await expect(page.locator('[data-testid="success-notification"]')).toContainText('Message sent successfully');
      
      // Should show message in history
      await expect(page.locator('[data-testid="message-history"]')).toBeVisible();
      await expect(page.locator('[data-testid="sent-message"]')).toContainText('Hello, this is a test message!');
      await expect(page.locator('[data-testid="message-status"]')).toContainText('Sent');
    });
  });

  test.describe('Dashboard Overview Workflow', () => {
    test.beforeEach(async () => {
      // Create test user and login
      const { user, tenant } = await createTestUser({
        email: 'test@example.com',
        password: 'Test123!@#',
        name: 'Test User',
        tenantName: 'Test Company',
      });
      
      await loginUser(page, 'test@example.com', 'Test123!@#');
    });

    test('should display dashboard overview with statistics', async () => {
      // Should be on dashboard by default after login
      await expect(page).toHaveURL(/.*\/dashboard$/);
      
      // Verify dashboard components
      await expect(page.locator('[data-testid="dashboard-stats"]')).toBeVisible();
      await expect(page.locator('[data-testid="instances-count"]')).toBeVisible();
      await expect(page.locator('[data-testid="messages-count"]')).toBeVisible();
      await expect(page.locator('[data-testid="bots-count"]')).toBeVisible();
      
      // Verify recent activity section
      await expect(page.locator('[data-testid="recent-activity"]')).toBeVisible();
      
      // Verify quick actions
      await expect(page.locator('[data-testid="quick-actions"]')).toBeVisible();
      await expect(page.locator('[data-testid="quick-create-instance"]')).toBeVisible();
      await expect(page.locator('[data-testid="quick-create-bot"]')).toBeVisible();
      
      // Test quick actions
      await page.click('[data-testid="quick-create-instance"]');
      await expect(page).toHaveURL(/.*\/dashboard\/instances\/create/);
      
      // Go back to dashboard
      await page.click('[data-testid="nav-dashboard"]');
      
      await page.click('[data-testid="quick-create-bot"]');
      await expect(page).toHaveURL(/.*\/dashboard\/bots\/create/);
    });
  });

  test.describe('Settings and Profile Management', () => {
    test.beforeEach(async () => {
      // Create test user and login
      const { user, tenant } = await createTestUser({
        email: 'test@example.com',
        password: 'Test123!@#',
        name: 'Test User',
        tenantName: 'Test Company',
      });
      
      await loginUser(page, 'test@example.com', 'Test123!@#');
    });

    test('should manage user profile and settings', async () => {
      // Navigate to settings
      await page.click('[data-testid="user-menu"]');
      await page.click('[data-testid="settings-link"]');
      await expect(page).toHaveURL(/.*\/dashboard\/settings/);
      
      // Verify settings sections
      await expect(page.locator('[data-testid="profile-settings"]')).toBeVisible();
      await expect(page.locator('[data-testid="tenant-settings"]')).toBeVisible();
      await expect(page.locator('[data-testid="api-keys-section"]')).toBeVisible();
      
      // Test profile update
      await page.fill('[data-testid="profile-name-input"]', 'Updated Test User');
      await page.click('[data-testid="save-profile-button"]');
      
      // Should show success message
      await expect(page.locator('[data-testid="profile-success"]')).toBeVisible();
      
      // Verify name update in header
      await expect(page.locator('[data-testid="user-menu"]')).toContainText('Updated Test User');
      
      // Test API key generation
      await page.click('[data-testid="generate-api-key-button"]');
      
      // Should show API key creation form
      await expect(page.locator('[data-testid="api-key-form"]')).toBeVisible();
      
      await page.fill('[data-testid="api-key-name-input"]', 'Test API Key');
      await page.click('[data-testid="create-api-key-button"]');
      
      // Should show generated API key
      await expect(page.locator('[data-testid="generated-api-key"]')).toBeVisible();
      await expect(page.locator('[data-testid="api-key-value"]')).toContainText('zap_');
      
      // Should show API key in list
      await expect(page.locator('[data-testid="api-key-list"]')).toBeVisible();
      await expect(page.locator('[data-testid="api-key-item"]')).toContainText('Test API Key');
    });
  });
});