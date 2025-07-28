import { AuthService } from '../../../src/services/authService';
import { TestDataFactory, TestUtils, MockImplementations } from '../../helpers/test-helpers';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

// Mock dependencies
const mockPrisma = MockImplementations.createMockPrismaClient();
const mockRedis = MockImplementations.createMockRedisClient();
const mockLogger = MockImplementations.createMockLogger();

jest.mock('../../../src/lib/prisma', () => ({
  prisma: mockPrisma,
}));

jest.mock('../../../src/lib/redis', () => ({
  redis: mockRedis,
}));

jest.mock('bcryptjs');
jest.mock('jsonwebtoken');

describe('AuthService', () => {
  let authService: AuthService;

  beforeEach(() => {
    authService = new AuthService();
    jest.clearAllMocks();
  });

  describe('register', () => {
    it('should successfully register a new user with tenant', async () => {
      // Arrange
      const registerData = {
        email: 'test@example.com',
        password: 'Test123!@#',
        name: 'Test User',
        tenantName: 'Test Company',
      };

      const hashedPassword = 'hashed_password';
      const mockTenant = TestDataFactory.createTenantData({
        name: registerData.tenantName,
      });
      const mockUser = TestDataFactory.createUserData({
        email: registerData.email,
        name: registerData.name,
        tenantId: mockTenant.id,
      });

      (bcrypt.hash as jest.Mock).mockResolvedValue(hashedPassword);
      mockPrisma.$transaction.mockResolvedValue({
        ...mockUser,
        tenant: mockTenant,
      });

      const mockTokens = {
        token: 'access_token',
        refreshToken: 'refresh_token',
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      };

      jest.spyOn(authService as any, 'generateTokens').mockResolvedValue(mockTokens);

      // Act
      const result = await authService.register(registerData);

      // Assert
      expect(bcrypt.hash).toHaveBeenCalledWith(registerData.password, 10);
      expect(mockPrisma.$transaction).toHaveBeenCalled();
      expect(result).toEqual({
        user: expect.objectContaining({
          email: registerData.email,
          name: registerData.name,
        }),
        tenant: expect.objectContaining({
          name: registerData.tenantName,
        }),
        ...mockTokens,
      });
    });

    it('should throw error if email already exists', async () => {
      // Arrange
      const registerData = {
        email: 'existing@example.com',
        password: 'Test123!@#',
        name: 'Test User',
        tenantName: 'Test Company',
      };

      const prismaError = new Error('Unique constraint failed');
      (prismaError as any).code = 'P2002';
      mockPrisma.$transaction.mockRejectedValue(prismaError);

      // Act & Assert
      await expect(authService.register(registerData)).rejects.toThrow('Email already exists');
    });

    it('should validate email format', async () => {
      // Arrange
      const registerData = {
        email: 'invalid-email',
        password: 'Test123!@#',
        name: 'Test User',
        tenantName: 'Test Company',
      };

      // Act & Assert
      await expect(authService.register(registerData)).rejects.toThrow('Invalid email format');
    });

    it('should validate password strength', async () => {
      // Arrange
      const registerData = {
        email: 'test@example.com',
        password: 'weak',
        name: 'Test User',
        tenantName: 'Test Company',
      };

      // Act & Assert
      await expect(authService.register(registerData)).rejects.toThrow('Password must be at least 8 characters');
    });
  });

  describe('login', () => {
    it('should successfully login with valid credentials', async () => {
      // Arrange
      const loginData = {
        email: 'test@example.com',
        password: 'Test123!@#',
      };

      const mockUser = TestDataFactory.createUserData({
        email: loginData.email,
        password: 'hashed_password',
      });

      const mockTenant = TestDataFactory.createTenantData();

      mockPrisma.user.findUnique.mockResolvedValue({
        ...mockUser,
        tenant: mockTenant,
      });

      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      const mockTokens = {
        token: 'access_token',
        refreshToken: 'refresh_token',
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      };

      jest.spyOn(authService as any, 'generateTokens').mockResolvedValue(mockTokens);

      // Act
      const result = await authService.login(loginData);

      // Assert
      expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({
        where: { email: loginData.email },
        include: { tenant: true },
      });
      expect(bcrypt.compare).toHaveBeenCalledWith(loginData.password, mockUser.password);
      expect(result).toEqual({
        user: expect.objectContaining({
          email: loginData.email,
        }),
        ...mockTokens,
      });
    });

    it('should throw error for non-existent user', async () => {
      // Arrange
      const loginData = {
        email: 'nonexistent@example.com',
        password: 'Test123!@#',
      };

      mockPrisma.user.findUnique.mockResolvedValue(null);

      // Act & Assert
      await expect(authService.login(loginData)).rejects.toThrow('Invalid credentials');
    });

    it('should throw error for incorrect password', async () => {
      // Arrange
      const loginData = {
        email: 'test@example.com',
        password: 'WrongPassword',
      };

      const mockUser = TestDataFactory.createUserData({
        email: loginData.email,
        password: 'hashed_password',
      });

      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      // Act & Assert
      await expect(authService.login(loginData)).rejects.toThrow('Invalid credentials');
    });

    it('should throw error for inactive user', async () => {
      // Arrange
      const loginData = {
        email: 'test@example.com',
        password: 'Test123!@#',
      };

      const mockUser = TestDataFactory.createUserData({
        email: loginData.email,
        isActive: false,
      });

      mockPrisma.user.findUnique.mockResolvedValue(mockUser);

      // Act & Assert
      await expect(authService.login(loginData)).rejects.toThrow('Account is inactive');
    });
  });

  describe('refreshToken', () => {
    it('should successfully refresh valid token', async () => {
      // Arrange
      const refreshToken = 'valid_refresh_token';
      const mockPayload = {
        userId: 'user-id',
        tenantId: 'tenant-id',
        type: 'refresh',
      };

      const mockUser = TestDataFactory.createUserData({
        id: mockPayload.userId,
      });

      (jwt.verify as jest.Mock).mockReturnValue(mockPayload);
      mockRedis.get.mockResolvedValue('stored_refresh_token');
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);

      const mockTokens = {
        token: 'new_access_token',
        refreshToken: 'new_refresh_token',
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      };

      jest.spyOn(authService as any, 'generateTokens').mockResolvedValue(mockTokens);

      // Act
      const result = await authService.refreshToken(refreshToken);

      // Assert
      expect(jwt.verify).toHaveBeenCalledWith(refreshToken, process.env.JWT_SECRET);
      expect(mockRedis.get).toHaveBeenCalledWith(`refresh_token:${mockPayload.userId}`);
      expect(result).toEqual(mockTokens);
    });

    it('should throw error for invalid refresh token', async () => {
      // Arrange
      const refreshToken = 'invalid_refresh_token';

      (jwt.verify as jest.Mock).mockImplementation(() => {
        throw new Error('Invalid token');
      });

      // Act & Assert
      await expect(authService.refreshToken(refreshToken)).rejects.toThrow('Invalid refresh token');
    });

    it('should throw error for expired refresh token', async () => {
      // Arrange
      const refreshToken = 'expired_refresh_token';
      const mockPayload = {
        userId: 'user-id',
        tenantId: 'tenant-id',
        type: 'refresh',
      };

      (jwt.verify as jest.Mock).mockReturnValue(mockPayload);
      mockRedis.get.mockResolvedValue(null);

      // Act & Assert
      await expect(authService.refreshToken(refreshToken)).rejects.toThrow('Refresh token expired');
    });
  });

  describe('logout', () => {
    it('should successfully logout user', async () => {
      // Arrange
      const userId = 'user-id';

      mockRedis.del.mockResolvedValue(1);

      // Act
      await authService.logout(userId);

      // Assert
      expect(mockRedis.del).toHaveBeenCalledWith(`refresh_token:${userId}`);
    });
  });

  describe('validateToken', () => {
    it('should successfully validate valid token', async () => {
      // Arrange
      const token = 'valid_access_token';
      const mockPayload = {
        userId: 'user-id',
        tenantId: 'tenant-id',
        role: 'USER',
      };

      const mockUser = TestDataFactory.createUserData({
        id: mockPayload.userId,
        tenantId: mockPayload.tenantId,
      });

      (jwt.verify as jest.Mock).mockReturnValue(mockPayload);
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);

      // Act
      const result = await authService.validateToken(token);

      // Assert
      expect(jwt.verify).toHaveBeenCalledWith(token, process.env.JWT_SECRET);
      expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: mockPayload.userId },
        include: { tenant: true },
      });
      expect(result).toEqual(mockUser);
    });

    it('should throw error for invalid token', async () => {
      // Arrange
      const token = 'invalid_token';

      (jwt.verify as jest.Mock).mockImplementation(() => {
        throw new Error('Invalid token');
      });

      // Act & Assert
      await expect(authService.validateToken(token)).rejects.toThrow('Invalid token');
    });

    it('should throw error for non-existent user', async () => {
      // Arrange
      const token = 'valid_token';
      const mockPayload = {
        userId: 'non-existent-user-id',
        tenantId: 'tenant-id',
        role: 'USER',
      };

      (jwt.verify as jest.Mock).mockReturnValue(mockPayload);
      mockPrisma.user.findUnique.mockResolvedValue(null);

      // Act & Assert
      await expect(authService.validateToken(token)).rejects.toThrow('User not found');
    });
  });

  describe('generateTokens', () => {
    it('should generate access and refresh tokens', async () => {
      // Arrange
      const mockUser = TestDataFactory.createUserData();

      (jwt.sign as jest.Mock)
        .mockReturnValueOnce('access_token')
        .mockReturnValueOnce('refresh_token');

      mockRedis.set.mockResolvedValue('OK');

      // Act
      const result = await (authService as any).generateTokens(mockUser);

      // Assert
      expect(jwt.sign).toHaveBeenCalledTimes(2);
      expect(mockRedis.set).toHaveBeenCalledWith(
        `refresh_token:${mockUser.id}`,
        'refresh_token',
        'EX',
        7 * 24 * 60 * 60
      );
      expect(result).toEqual({
        token: 'access_token',
        refreshToken: 'refresh_token',
        expiresAt: expect.any(Date),
      });
    });
  });

  describe('validatePassword', () => {
    it('should validate strong password', () => {
      // Arrange
      const strongPassword = 'StrongPass123!@#';

      // Act
      const result = (authService as any).validatePassword(strongPassword);

      // Assert
      expect(result).toBe(true);
    });

    it('should reject weak passwords', () => {
      // Arrange
      const weakPasswords = [
        'weak',
        '12345678',
        'password',
        'PASSWORD',
        'Password',
        'Pass123',
      ];

      // Act & Assert
      weakPasswords.forEach(password => {
        expect(() => (authService as any).validatePassword(password))
          .toThrow('Password must be at least 8 characters');
      });
    });
  });

  describe('validateEmail', () => {
    it('should validate correct email formats', () => {
      // Arrange
      const validEmails = [
        'test@example.com',
        'user.name@domain.co.uk',
        'user+tag@example.org',
      ];

      // Act & Assert
      validEmails.forEach(email => {
        expect(() => (authService as any).validateEmail(email)).not.toThrow();
      });
    });

    it('should reject invalid email formats', () => {
      // Arrange
      const invalidEmails = [
        'invalid-email',
        '@example.com',
        'user@',
        'user@.com',
        'user..name@example.com',
      ];

      // Act & Assert
      invalidEmails.forEach(email => {
        expect(() => (authService as any).validateEmail(email))
          .toThrow('Invalid email format');
      });
    });
  });
});