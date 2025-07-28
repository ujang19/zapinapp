import { authMiddleware } from '../../../src/api/middleware/auth';
import { TestDataFactory, TestUtils, MockImplementations } from '../../helpers/test-helpers';
import jwt from 'jsonwebtoken';

// Mock dependencies
const mockPrisma = MockImplementations.createMockPrismaClient();
const mockRedis = MockImplementations.createMockRedisClient();

jest.mock('../../../src/lib/prisma', () => ({
  prisma: mockPrisma,
}));

jest.mock('../../../src/lib/redis', () => ({
  redis: mockRedis,
}));

jest.mock('jsonwebtoken');

describe('Auth Middleware', () => {
  let req: any;
  let res: any;
  let next: any;

  beforeEach(() => {
    req = TestUtils.createMockRequest();
    res = TestUtils.createMockResponse();
    next = TestUtils.createMockNext();
    jest.clearAllMocks();
  });

  describe('authMiddleware', () => {
    it('should authenticate user with valid token', async () => {
      // Arrange
      const token = 'valid-jwt-token';
      const mockPayload = TestUtils.createJWTPayload();
      const mockUser = TestDataFactory.createUserData({
        id: mockPayload.userId,
        tenantId: mockPayload.tenantId,
      });
      const mockTenant = TestDataFactory.createTenantData({
        id: mockPayload.tenantId,
      });

      req.headers.authorization = `Bearer ${token}`;

      (jwt.verify as jest.Mock).mockReturnValue(mockPayload);
      mockPrisma.user.findUnique.mockResolvedValue({
        ...mockUser,
        tenant: mockTenant,
      });

      // Act
      await authMiddleware(req, res, next);

      // Assert
      expect(jwt.verify).toHaveBeenCalledWith(token, process.env.JWT_SECRET);
      expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: mockPayload.userId },
        include: { tenant: true },
      });
      expect(req.user).toEqual(expect.objectContaining({
        id: mockUser.id,
        email: mockUser.email,
      }));
      expect(req.tenant).toEqual(expect.objectContaining({
        id: mockTenant.id,
        name: mockTenant.name,
      }));
      expect(next).toHaveBeenCalled();
    });

    it('should reject request without authorization header', async () => {
      // Arrange
      req.headers = {};

      // Act
      await authMiddleware(req, res, next);

      // Assert
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Authentication required',
        message: 'No authorization header provided',
      });
      expect(next).not.toHaveBeenCalled();
    });

    it('should reject request with invalid authorization format', async () => {
      // Arrange
      req.headers.authorization = 'InvalidFormat token';

      // Act
      await authMiddleware(req, res, next);

      // Assert
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Authentication required',
        message: 'Invalid authorization format',
      });
      expect(next).not.toHaveBeenCalled();
    });

    it('should reject request with invalid JWT token', async () => {
      // Arrange
      const token = 'invalid-jwt-token';
      req.headers.authorization = `Bearer ${token}`;

      (jwt.verify as jest.Mock).mockImplementation(() => {
        throw new Error('Invalid token');
      });

      // Act
      await authMiddleware(req, res, next);

      // Assert
      expect(jwt.verify).toHaveBeenCalledWith(token, process.env.JWT_SECRET);
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Authentication failed',
        message: 'Invalid token',
      });
      expect(next).not.toHaveBeenCalled();
    });

    it('should reject request with expired JWT token', async () => {
      // Arrange
      const token = 'expired-jwt-token';
      req.headers.authorization = `Bearer ${token}`;

      const jwtError = new Error('Token expired');
      (jwtError as any).name = 'TokenExpiredError';
      (jwt.verify as jest.Mock).mockImplementation(() => {
        throw jwtError;
      });

      // Act
      await authMiddleware(req, res, next);

      // Assert
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Authentication failed',
        message: 'Token expired',
      });
      expect(next).not.toHaveBeenCalled();
    });

    it('should reject request for non-existent user', async () => {
      // Arrange
      const token = 'valid-jwt-token';
      const mockPayload = TestUtils.createJWTPayload();

      req.headers.authorization = `Bearer ${token}`;

      (jwt.verify as jest.Mock).mockReturnValue(mockPayload);
      mockPrisma.user.findUnique.mockResolvedValue(null);

      // Act
      await authMiddleware(req, res, next);

      // Assert
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Authentication failed',
        message: 'User not found',
      });
      expect(next).not.toHaveBeenCalled();
    });

    it('should reject request for inactive user', async () => {
      // Arrange
      const token = 'valid-jwt-token';
      const mockPayload = TestUtils.createJWTPayload();
      const mockUser = TestDataFactory.createUserData({
        id: mockPayload.userId,
        isActive: false,
      });

      req.headers.authorization = `Bearer ${token}`;

      (jwt.verify as jest.Mock).mockReturnValue(mockPayload);
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);

      // Act
      await authMiddleware(req, res, next);

      // Assert
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Authentication failed',
        message: 'User account is inactive',
      });
      expect(next).not.toHaveBeenCalled();
    });

    it('should reject request for inactive tenant', async () => {
      // Arrange
      const token = 'valid-jwt-token';
      const mockPayload = TestUtils.createJWTPayload();
      const mockUser = TestDataFactory.createUserData({
        id: mockPayload.userId,
        tenantId: mockPayload.tenantId,
      });
      const mockTenant = TestDataFactory.createTenantData({
        id: mockPayload.tenantId,
        status: 'INACTIVE',
      });

      req.headers.authorization = `Bearer ${token}`;

      (jwt.verify as jest.Mock).mockReturnValue(mockPayload);
      mockPrisma.user.findUnique.mockResolvedValue({
        ...mockUser,
        tenant: mockTenant,
      });

      // Act
      await authMiddleware(req, res, next);

      // Assert
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Access denied',
        message: 'Tenant account is inactive',
      });
      expect(next).not.toHaveBeenCalled();
    });

    it('should handle database errors gracefully', async () => {
      // Arrange
      const token = 'valid-jwt-token';
      const mockPayload = TestUtils.createJWTPayload();

      req.headers.authorization = `Bearer ${token}`;

      (jwt.verify as jest.Mock).mockReturnValue(mockPayload);
      mockPrisma.user.findUnique.mockRejectedValue(new Error('Database error'));

      // Act
      await authMiddleware(req, res, next);

      // Assert
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Internal server error',
        message: 'Authentication service unavailable',
      });
      expect(next).not.toHaveBeenCalled();
    });

    it('should extract token from different authorization formats', async () => {
      // Arrange
      const token = 'valid-jwt-token';
      const mockPayload = TestUtils.createJWTPayload();
      const mockUser = TestDataFactory.createUserData({
        id: mockPayload.userId,
      });
      const mockTenant = TestDataFactory.createTenantData();

      // Test with lowercase 'bearer'
      req.headers.authorization = `bearer ${token}`;

      (jwt.verify as jest.Mock).mockReturnValue(mockPayload);
      mockPrisma.user.findUnique.mockResolvedValue({
        ...mockUser,
        tenant: mockTenant,
      });

      // Act
      await authMiddleware(req, res, next);

      // Assert
      expect(jwt.verify).toHaveBeenCalledWith(token, process.env.JWT_SECRET);
      expect(next).toHaveBeenCalled();
    });

    it('should handle malformed JWT payload', async () => {
      // Arrange
      const token = 'malformed-jwt-token';
      const malformedPayload = {
        // Missing required fields
        invalidField: 'value',
      };

      req.headers.authorization = `Bearer ${token}`;

      (jwt.verify as jest.Mock).mockReturnValue(malformedPayload);

      // Act
      await authMiddleware(req, res, next);

      // Assert
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Authentication failed',
        message: 'Invalid token payload',
      });
      expect(next).not.toHaveBeenCalled();
    });

    it('should cache user data in Redis for performance', async () => {
      // Arrange
      const token = 'valid-jwt-token';
      const mockPayload = TestUtils.createJWTPayload();
      const mockUser = TestDataFactory.createUserData({
        id: mockPayload.userId,
      });
      const mockTenant = TestDataFactory.createTenantData();

      req.headers.authorization = `Bearer ${token}`;

      (jwt.verify as jest.Mock).mockReturnValue(mockPayload);
      mockRedis.get.mockResolvedValue(null); // Cache miss
      mockPrisma.user.findUnique.mockResolvedValue({
        ...mockUser,
        tenant: mockTenant,
      });
      mockRedis.set.mockResolvedValue('OK');

      // Act
      await authMiddleware(req, res, next);

      // Assert
      expect(mockRedis.get).toHaveBeenCalledWith(`user:${mockPayload.userId}`);
      expect(mockRedis.set).toHaveBeenCalledWith(
        `user:${mockPayload.userId}`,
        JSON.stringify({ ...mockUser, tenant: mockTenant }),
        'EX',
        300 // 5 minutes cache
      );
      expect(next).toHaveBeenCalled();
    });

    it('should use cached user data when available', async () => {
      // Arrange
      const token = 'valid-jwt-token';
      const mockPayload = TestUtils.createJWTPayload();
      const mockUser = TestDataFactory.createUserData({
        id: mockPayload.userId,
      });
      const mockTenant = TestDataFactory.createTenantData();

      req.headers.authorization = `Bearer ${token}`;

      (jwt.verify as jest.Mock).mockReturnValue(mockPayload);
      mockRedis.get.mockResolvedValue(JSON.stringify({
        ...mockUser,
        tenant: mockTenant,
      }));

      // Act
      await authMiddleware(req, res, next);

      // Assert
      expect(mockRedis.get).toHaveBeenCalledWith(`user:${mockPayload.userId}`);
      expect(mockPrisma.user.findUnique).not.toHaveBeenCalled(); // Should not hit database
      expect(req.user).toEqual(expect.objectContaining({
        id: mockUser.id,
        email: mockUser.email,
      }));
      expect(next).toHaveBeenCalled();
    });
  });

  describe('requireRole', () => {
    it('should allow access for users with required role', async () => {
      // Arrange
      const requireAdminRole = authMiddleware.requireRole('ADMIN');
      req.user = TestDataFactory.createUserData({ role: 'ADMIN' });

      // Act
      await requireAdminRole(req, res, next);

      // Assert
      expect(next).toHaveBeenCalled();
    });

    it('should deny access for users without required role', async () => {
      // Arrange
      const requireAdminRole = authMiddleware.requireRole('ADMIN');
      req.user = TestDataFactory.createUserData({ role: 'USER' });

      // Act
      await requireAdminRole(req, res, next);

      // Assert
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Access denied',
        message: 'Insufficient permissions',
      });
      expect(next).not.toHaveBeenCalled();
    });

    it('should deny access when user is not authenticated', async () => {
      // Arrange
      const requireAdminRole = authMiddleware.requireRole('ADMIN');
      req.user = null;

      // Act
      await requireAdminRole(req, res, next);

      // Assert
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Authentication required',
        message: 'User not authenticated',
      });
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('optionalAuth', () => {
    it('should authenticate user when token is provided', async () => {
      // Arrange
      const token = 'valid-jwt-token';
      const mockPayload = TestUtils.createJWTPayload();
      const mockUser = TestDataFactory.createUserData({
        id: mockPayload.userId,
      });

      req.headers.authorization = `Bearer ${token}`;

      (jwt.verify as jest.Mock).mockReturnValue(mockPayload);
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);

      // Act
      await authMiddleware.optional(req, res, next);

      // Assert
      expect(req.user).toEqual(expect.objectContaining({
        id: mockUser.id,
        email: mockUser.email,
      }));
      expect(next).toHaveBeenCalled();
    });

    it('should continue without authentication when no token is provided', async () => {
      // Arrange
      req.headers = {};

      // Act
      await authMiddleware.optional(req, res, next);

      // Assert
      expect(req.user).toBeUndefined();
      expect(next).toHaveBeenCalled();
    });

    it('should continue without authentication when token is invalid', async () => {
      // Arrange
      const token = 'invalid-jwt-token';
      req.headers.authorization = `Bearer ${token}`;

      (jwt.verify as jest.Mock).mockImplementation(() => {
        throw new Error('Invalid token');
      });

      // Act
      await authMiddleware.optional(req, res, next);

      // Assert
      expect(req.user).toBeUndefined();
      expect(next).toHaveBeenCalled();
    });
  });
});