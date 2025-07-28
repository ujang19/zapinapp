import * as bcrypt from 'bcryptjs';
import * as jwt from 'jsonwebtoken';
import { randomBytes } from 'node:crypto';
import { prisma } from '../lib/prisma';
import { redis } from '../lib/redis';
import { ZapinError, ErrorCodes, JWTPayload, UserWithTenant } from '../types';
import { UserRole, TenantStatus, PrismaClient } from '@prisma/client';

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  name: string;
  tenantName: string;
  tenantSlug?: string;
}

export interface LoginResponse {
  user: UserWithTenant;
  token: string;
  refreshToken: string;
  expiresAt: Date;
}

export interface CreateApiKeyRequest {
  name: string;
  scopes: string[];
  expiresAt?: Date;
}

export interface ApiKeyResponse {
  id: string;
  name: string;
  key: string;
  scopes: string[];
  expiresAt: Date | null;
  createdAt: Date;
}

export class AuthService {
  private static readonly JWT_SECRET = (() => {
    const secret = process.env.JWT_SECRET;
    if (!secret) {
      throw new Error('JWT_SECRET environment variable is required');
    }
    return secret;
  })();
  private static readonly JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';
  private static readonly REFRESH_TOKEN_EXPIRES_IN = '30d';
  private static readonly SALT_ROUNDS = 12;

  /**
   * Register a new user with tenant
   */
  static async register(data: RegisterRequest): Promise<LoginResponse> {
    const { email, password, name, tenantName, tenantSlug } = data;

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email: email.toLowerCase() }
    });

    if (existingUser) {
      throw new ZapinError(
        ErrorCodes.VALIDATION_ERROR,
        'User with this email already exists',
        400
      );
    }

    // Generate tenant slug if not provided
    const slug = tenantSlug || this.generateTenantSlug(tenantName);

    // Check if tenant slug is available
    const existingTenant = await prisma.tenant.findUnique({
      where: { slug }
    });

    if (existingTenant) {
      throw new ZapinError(
        ErrorCodes.VALIDATION_ERROR,
        'Tenant slug is already taken',
        400
      );
    }

    // Hash password
    const hashedPassword = await this.hashPassword(password);

    // Create tenant and user in transaction
    const result = await prisma.$transaction(async (tx) => {
      // Create tenant
      const tenant = await tx.tenant.create({
        data: {
          name: tenantName,
          slug,
          status: TenantStatus.ACTIVE,
          plan: 'BASIC'
        }
      });

      // Create user
      const user = await tx.user.create({
        data: {
          email: email.toLowerCase(),
          password: hashedPassword,
          name,
          role: UserRole.ADMIN,
          tenantId: tenant.id,
          isActive: true
        },
        include: {
          tenant: true
        }
      });

      return user;
    });

    // Generate tokens
    const { token, refreshToken, expiresAt } = await this.generateTokens(result);

    return {
      user: result,
      token,
      refreshToken,
      expiresAt
    };
  }

  /**
   * Login user
   */
  static async login(data: LoginRequest): Promise<LoginResponse> {
    const { email, password } = data;

    // Find user with tenant
    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
      include: { tenant: true }
    });

    if (!user) {
      throw new ZapinError(
        ErrorCodes.UNAUTHORIZED,
        'Invalid email or password',
        401
      );
    }

    // Check if user is active
    if (!user.isActive) {
      throw new ZapinError(
        ErrorCodes.UNAUTHORIZED,
        'Account is deactivated',
        401
      );
    }

    // Check if tenant is active
    if (!user.tenant || user.tenant.status !== TenantStatus.ACTIVE) {
      throw new ZapinError(
        ErrorCodes.UNAUTHORIZED,
        'Tenant account is not active',
        401
      );
    }

    // Verify password
    const isValidPassword = await this.verifyPassword(password, user.password);
    if (!isValidPassword) {
      throw new ZapinError(
        ErrorCodes.UNAUTHORIZED,
        'Invalid email or password',
        401
      );
    }

    // Generate tokens
    const { token, refreshToken, expiresAt } = await this.generateTokens(user);

    return {
      user,
      token,
      refreshToken,
      expiresAt
    };
  }

  /**
   * Refresh JWT token
   */
  static async refreshToken(refreshToken: string): Promise<LoginResponse> {
    try {
      // Verify refresh token
      const decoded = jwt.verify(refreshToken, this.JWT_SECRET) as JWTPayload & { type: string };
      
      if (decoded.type !== 'refresh') {
        throw new Error('Invalid token type');
      }

      // Check if refresh token is blacklisted
      const isBlacklisted = await redis.get(`blacklist:${refreshToken}`);
      if (isBlacklisted) {
        throw new Error('Token is blacklisted');
      }

      // Find user
      const user = await prisma.user.findUnique({
        where: { id: decoded.userId },
        include: { tenant: true }
      });

      if (!user || !user.isActive || user.tenant?.status !== TenantStatus.ACTIVE) {
        throw new Error('User not found or inactive');
      }

      // Blacklist old refresh token
      await redis.setex(`blacklist:${refreshToken}`, 30 * 24 * 60 * 60, '1');

      // Generate new tokens
      const tokens = await this.generateTokens(user);

      return {
        user,
        ...tokens
      };
    } catch (error) {
      throw new ZapinError(
        ErrorCodes.UNAUTHORIZED,
        'Invalid or expired refresh token',
        401
      );
    }
  }

  /**
   * Logout user (blacklist tokens)
   */
  static async logout(token: string, refreshToken?: string): Promise<void> {
    try {
      // Decode token to get expiration
      const decoded = jwt.decode(token) as JWTPayload;
      if (decoded && decoded.exp) {
        const ttl = decoded.exp - Math.floor(Date.now() / 1000);
        if (ttl > 0) {
          await redis.setex(`blacklist:${token}`, ttl, '1');
        }
      }

      // Blacklist refresh token if provided
      if (refreshToken) {
        await redis.setex(`blacklist:${refreshToken}`, 30 * 24 * 60 * 60, '1');
      }
    } catch (error) {
      // Log error but don't throw - logout should always succeed
      console.error('Error during logout:', error);
    }
  }

  /**
   * Create API key for user
   */
  static async createApiKey(
    userId: string,
    tenantId: string,
    data: CreateApiKeyRequest
  ): Promise<ApiKeyResponse> {
    const { name, scopes, expiresAt } = data;

    // Generate API key
    const apiKey = this.generateApiKey();

    // Create API key in database
    const createdKey = await prisma.apiKey.create({
      data: {
        name,
        key: apiKey,
        scopes,
        expiresAt,
        userId,
        tenantId,
        isActive: true
      }
    });

    return {
      id: createdKey.id,
      name: createdKey.name,
      key: apiKey, // Return the plain key only once
      scopes: createdKey.scopes,
      expiresAt: createdKey.expiresAt,
      createdAt: createdKey.createdAt
    };
  }

  /**
   * List API keys for user (without exposing the actual keys)
   */
  static async listApiKeys(userId: string, tenantId: string) {
    return await prisma.apiKey.findMany({
      where: {
        userId,
        tenantId,
        isActive: true
      },
      select: {
        id: true,
        name: true,
        scopes: true,
        lastUsedAt: true,
        expiresAt: true,
        createdAt: true,
        updatedAt: true
      },
      orderBy: {
        createdAt: 'desc'
      }
    });
  }

  /**
   * Revoke API key
   */
  static async revokeApiKey(keyId: string, userId: string, tenantId: string): Promise<void> {
    const apiKey = await prisma.apiKey.findFirst({
      where: {
        id: keyId,
        userId,
        tenantId
      }
    });

    if (!apiKey) {
      throw new ZapinError(
        ErrorCodes.VALIDATION_ERROR,
        'API key not found',
        404
      );
    }

    await prisma.apiKey.update({
      where: { id: keyId },
      data: { isActive: false }
    });
  }

  /**
   * Change user password
   */
  static async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string
  ): Promise<void> {
    const user = await prisma.user.findUnique({
      where: { id: userId }
    });

    if (!user) {
      throw new ZapinError(
        ErrorCodes.VALIDATION_ERROR,
        'User not found',
        404
      );
    }

    // Verify current password
    const isValidPassword = await this.verifyPassword(currentPassword, user.password);
    if (!isValidPassword) {
      throw new ZapinError(
        ErrorCodes.UNAUTHORIZED,
        'Current password is incorrect',
        401
      );
    }

    // Hash new password
    const hashedPassword = await this.hashPassword(newPassword);

    // Update password
    await prisma.user.update({
      where: { id: userId },
      data: { password: hashedPassword }
    });
  }

  /**
   * Verify if token is blacklisted
   */
  static async isTokenBlacklisted(token: string): Promise<boolean> {
    try {
      const result = await redis.get(`blacklist:${token}`);
      return result !== null;
    } catch (error) {
      // If Redis is down, allow the request to proceed
      console.error('Error checking token blacklist:', error);
      return false;
    }
  }

  // Private helper methods

  private static async hashPassword(password: string): Promise<string> {
    return await bcrypt.hash(password, this.SALT_ROUNDS);
  }

  private static async verifyPassword(password: string, hash: string): Promise<boolean> {
    return await bcrypt.compare(password, hash);
  }

  private static async generateTokens(user: UserWithTenant) {
    const payload: JWTPayload = {
      userId: user.id,
      tenantId: user.tenantId,
      role: user.role
    };

    // Generate access token
    const token = (jwt.sign as any)(payload, this.JWT_SECRET, {
      expiresIn: this.JWT_EXPIRES_IN
    });

    // Generate refresh token
    const refreshToken = (jwt.sign as any)(
      { ...payload, type: 'refresh' },
      this.JWT_SECRET,
      { expiresIn: this.REFRESH_TOKEN_EXPIRES_IN }
    );

    // Calculate expiration date
    const decoded = jwt.decode(token) as JWTPayload;
    const expiresAt = new Date(decoded.exp! * 1000);

    // Store session in database
    await prisma.session.create({
      data: {
        token,
        userId: user.id,
        expiresAt
      }
    });

    return { token, refreshToken, expiresAt };
  }

  private static generateTenantSlug(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .substring(0, 50);
  }

  private static generateApiKey(): string {
    const prefix = 'zap_';
    const randomPart = randomBytes(32).toString('hex');
    return `${prefix}${randomPart}`;
  }
}