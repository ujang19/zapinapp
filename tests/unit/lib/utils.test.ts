import { 
  generateApiKey, 
  validatePhoneNumber, 
  formatPhoneNumber, 
  sanitizeInput, 
  generateSlug, 
  isValidUrl, 
  parseWebhookPayload,
  calculatePagination,
  hashPassword,
  comparePassword,
  generateRandomString
} from '../../../src/lib/utils';

// Unmock bcryptjs for this test file to allow real hashing
jest.unmock('bcryptjs');

describe('Utils', () => {
  describe('generateApiKey', () => {
    it('should generate API key with correct format', () => {
      // Act
      const apiKey = generateApiKey();

      // Assert
      expect(apiKey).toMatch(/^zap_[a-zA-Z0-9]{32}$/);
      expect(apiKey).toHaveLength(36); // 'zap_' + 32 characters
    });

    it('should generate unique API keys', () => {
      // Act
      const apiKey1 = generateApiKey();
      const apiKey2 = generateApiKey();

      // Assert
      expect(apiKey1).not.toBe(apiKey2);
    });
  });

  describe('validatePhoneNumber', () => {
    it('should validate correct phone number formats', () => {
      // Arrange
      const validPhoneNumbers = [
        '+6281234567890',
        '+1234567890123',
        '+447123456789',
        '+919876543210',
      ];

      // Act & Assert
      validPhoneNumbers.forEach(phoneNumber => {
        expect(validatePhoneNumber(phoneNumber)).toBe(true);
      });
    });

    it('should reject invalid phone number formats', () => {
      // Arrange
      const invalidPhoneNumbers = [
        '081234567890',
        '+62812345',
        'invalid-phone',
        '+62-812-345-678',
        '+62 812 345 678',
        '',
        null,
        undefined,
      ];

      // Act & Assert
      invalidPhoneNumbers.forEach(phoneNumber => {
        expect(validatePhoneNumber(phoneNumber as any)).toBe(false);
      });
    });
  });

  describe('formatPhoneNumber', () => {
    it('should format phone numbers correctly', () => {
      // Arrange & Act & Assert
      expect(formatPhoneNumber('081234567890')).toBe('+6281234567890');
      expect(formatPhoneNumber('6281234567890')).toBe('+6281234567890');
      expect(formatPhoneNumber('+6281234567890')).toBe('+6281234567890');
      expect(formatPhoneNumber('1234567890')).toBe('+1234567890');
    });

    it('should handle invalid phone numbers', () => {
      // Arrange & Act & Assert
      expect(formatPhoneNumber('invalid')).toBe('invalid');
      expect(formatPhoneNumber('')).toBe('');
      expect(formatPhoneNumber(null as any)).toBe('');
    });
  });

  describe('sanitizeInput', () => {
    it('should sanitize HTML and script tags', () => {
      // Arrange
      const maliciousInput = '<script>alert("xss")</script><p>Hello</p>';
      const expectedOutput = 'Hello';

      // Act
      const result = sanitizeInput(maliciousInput);

      // Assert
      expect(result).toBe(expectedOutput);
    });

    it('should trim whitespace', () => {
      // Arrange
      const input = '  Hello World  ';
      const expectedOutput = 'Hello World';

      // Act
      const result = sanitizeInput(input);

      // Assert
      expect(result).toBe(expectedOutput);
    });

    it('should handle empty and null inputs', () => {
      // Act & Assert
      expect(sanitizeInput('')).toBe('');
      expect(sanitizeInput(null as any)).toBe('');
      expect(sanitizeInput(undefined as any)).toBe('');
    });
  });

  describe('generateSlug', () => {
    it('should generate slug from text', () => {
      // Arrange & Act & Assert
      expect(generateSlug('Hello World')).toBe('hello-world');
      expect(generateSlug('Test Company Inc.')).toBe('test-company-inc');
      expect(generateSlug('Special@Characters#Here')).toBe('specialcharactershere');
      expect(generateSlug('Multiple   Spaces')).toBe('multiple-spaces');
    });

    it('should handle empty and special cases', () => {
      // Act & Assert
      expect(generateSlug('')).toBe('');
      expect(generateSlug('   ')).toBe('');
      expect(generateSlug('123')).toBe('123');
      expect(generateSlug('---')).toBe('');
    });

    it('should handle unicode characters', () => {
      // Act & Assert
      expect(generateSlug('Café Restaurant')).toBe('cafe-restaurant');
      expect(generateSlug('Naïve Résumé')).toBe('naive-resume');
    });
  });

  describe('isValidUrl', () => {
    it('should validate correct URL formats', () => {
      // Arrange
      const validUrls = [
        'https://example.com',
        'http://localhost:3000',
        'https://api.example.com/v1/webhook',
        'https://subdomain.example.co.uk/path?query=value',
      ];

      // Act & Assert
      validUrls.forEach(url => {
        expect(isValidUrl(url)).toBe(true);
      });
    });

    it('should reject invalid URL formats', () => {
      // Arrange
      const invalidUrls = [
        'invalid-url',
        'ftp://example.com',
        'https://',
        'http://example',
        '',
        null,
        undefined,
      ];

      // Act & Assert
      invalidUrls.forEach(url => {
        expect(isValidUrl(url as any)).toBe(false);
      });
    });
  });

  describe('parseWebhookPayload', () => {
    it('should parse valid webhook payload', () => {
      // Arrange
      const payload = {
        instanceName: 'test-instance',
        data: {
          key: {
            remoteJid: '+6281234567890@s.whatsapp.net',
            fromMe: false,
            id: 'message-id',
          },
          message: {
            conversation: 'Hello World',
          },
          messageTimestamp: 1640995200,
          pushName: 'John Doe',
        },
        destination: 'https://example.com/webhook',
        date_time: '2022-01-01T00:00:00.000Z',
        sender: '+6281234567890',
        server_url: 'https://evolution.api.com',
        apikey: 'api-key-123',
      };

      // Act
      const result = parseWebhookPayload(payload);

      // Assert
      expect(result).toEqual({
        instanceName: 'test-instance',
        messageId: 'message-id',
        from: '+6281234567890',
        message: 'Hello World',
        timestamp: new Date(1640995200 * 1000),
        senderName: 'John Doe',
        isFromMe: false,
        messageType: 'text',
      });
    });

    it('should handle different message types', () => {
      // Arrange
      const imagePayload = {
        instanceName: 'test-instance',
        data: {
          key: {
            remoteJid: '+6281234567890@s.whatsapp.net',
            fromMe: false,
            id: 'message-id',
          },
          message: {
            imageMessage: {
              caption: 'Image caption',
              url: 'https://example.com/image.jpg',
            },
          },
          messageTimestamp: 1640995200,
          pushName: 'John Doe',
        },
      };

      // Act
      const result = parseWebhookPayload(imagePayload);

      // Assert
      expect(result.messageType).toBe('image');
      expect(result.message).toBe('Image caption');
    });

    it('should handle invalid payload', () => {
      // Arrange
      const invalidPayload = {
        invalid: 'payload',
      };

      // Act & Assert
      expect(() => parseWebhookPayload(invalidPayload)).toThrow('Invalid webhook payload');
    });
  });

  describe('calculatePagination', () => {
    it('should calculate pagination correctly', () => {
      // Act & Assert
      expect(calculatePagination(1, 10, 25)).toEqual({
        page: 1,
        limit: 10,
        total: 25,
        totalPages: 3,
        hasNext: true,
        hasPrev: false,
        offset: 0,
      });

      expect(calculatePagination(2, 10, 25)).toEqual({
        page: 2,
        limit: 10,
        total: 25,
        totalPages: 3,
        hasNext: true,
        hasPrev: true,
        offset: 10,
      });

      expect(calculatePagination(3, 10, 25)).toEqual({
        page: 3,
        limit: 10,
        total: 25,
        totalPages: 3,
        hasNext: false,
        hasPrev: true,
        offset: 20,
      });
    });

    it('should handle edge cases', () => {
      // Act & Assert
      expect(calculatePagination(1, 10, 0)).toEqual({
        page: 1,
        limit: 10,
        total: 0,
        totalPages: 0,
        hasNext: false,
        hasPrev: false,
        offset: 0,
      });

      expect(calculatePagination(1, 10, 5)).toEqual({
        page: 1,
        limit: 10,
        total: 5,
        totalPages: 1,
        hasNext: false,
        hasPrev: false,
        offset: 0,
      });
    });
  });

  describe('hashPassword', () => {
    it('should hash password correctly', async () => {
      // Arrange
      const password = 'TestPassword123!';

      // Act
      const hashedPassword = await hashPassword(password);

      // Assert
      expect(hashedPassword).toBeDefined();
      expect(hashedPassword).not.toBe(password);
      expect(hashedPassword).toMatch(/^\$2[aby]\$\d+\$/); // bcrypt format
    });

    it('should generate different hashes for same password', async () => {
      // Arrange
      const password = 'TestPassword123!';

      // Act
      const hash1 = await hashPassword(password);
      const hash2 = await hashPassword(password);

      // Assert
      expect(hash1).not.toBe(hash2);
    });
  });

  describe('comparePassword', () => {
    it('should compare password correctly', async () => {
      // Arrange
      const password = 'TestPassword123!';
      const hashedPassword = await hashPassword(password);

      // Act & Assert
      expect(await comparePassword(password, hashedPassword)).toBe(true);
      expect(await comparePassword('WrongPassword', hashedPassword)).toBe(false);
    });
  });

  describe('generateRandomString', () => {
    it('should generate random string with correct length', () => {
      // Act
      const randomString = generateRandomString(16);

      // Assert
      expect(randomString).toHaveLength(16);
      expect(randomString).toMatch(/^[a-zA-Z0-9]+$/);
    });

    it('should generate different strings', () => {
      // Act
      const string1 = generateRandomString(10);
      const string2 = generateRandomString(10);

      // Assert
      expect(string1).not.toBe(string2);
    });

    it('should handle different lengths', () => {
      // Act & Assert
      expect(generateRandomString(5)).toHaveLength(5);
      expect(generateRandomString(32)).toHaveLength(32);
      expect(generateRandomString(0)).toHaveLength(0);
    });

    it('should generate alphanumeric only when specified', () => {
      // Act
      const alphanumeric = generateRandomString(20, true);
      const withSymbols = generateRandomString(20, false);

      // Assert
      expect(alphanumeric).toMatch(/^[a-zA-Z0-9]+$/);
      expect(withSymbols).toMatch(/^[a-zA-Z0-9!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]+$/);
    });
  });
});