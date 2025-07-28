import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { AuthService } from '../../services/authService';
import { authMiddleware } from '../middleware/auth';
import { ZapinError, ErrorCodes, ApiResponse } from '../../types';

// Validation schemas
const loginSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z.string().min(6, 'Password must be at least 6 characters')
});

const registerSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  name: z.string().min(2, 'Name must be at least 2 characters'),
  tenantName: z.string().min(2, 'Tenant name must be at least 2 characters'),
  tenantSlug: z.string().optional()
});

const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required')
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z.string().min(8, 'New password must be at least 8 characters')
});

const createApiKeySchema = z.object({
  name: z.string().min(1, 'API key name is required'),
  scopes: z.array(z.string()).min(1, 'At least one scope is required'),
  expiresAt: z.string().datetime().optional()
});

const revokeApiKeySchema = z.object({
  keyId: z.string().min(1, 'API key ID is required')
});

// Route handlers
export async function authRoutes(fastify: FastifyInstance) {
  // Register new user with tenant
  fastify.post('/register', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = registerSchema.parse(request.body);
      
      const result = await AuthService.register({
        email: body.email,
        password: body.password,
        name: body.name,
        tenantName: body.tenantName,
        tenantSlug: body.tenantSlug
      });

      const response: ApiResponse = {
        success: true,
        data: {
          user: {
            id: result.user.id,
            email: result.user.email,
            name: result.user.name,
            role: result.user.role,
            tenant: {
              id: result.user.tenant.id,
              name: result.user.tenant.name,
              slug: result.user.tenant.slug,
              plan: result.user.tenant.plan
            }
          },
          token: result.token,
          refreshToken: result.refreshToken,
          expiresAt: result.expiresAt
        }
      };

      return reply.code(201).send(response);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.code(400).send({
          success: false,
          error: {
            code: ErrorCodes.VALIDATION_ERROR,
            message: 'Validation failed',
            details: error.errors
          }
        });
      }

      if (error instanceof ZapinError) {
        return reply.code(error.statusCode).send({
          success: false,
          error: {
            code: error.code,
            message: error.message
          }
        });
      }

      return reply.code(500).send({
        success: false,
        error: {
          code: ErrorCodes.INTERNAL_ERROR,
          message: 'Registration failed'
        }
      });
    }
  });

  // Login user
  fastify.post('/login', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = loginSchema.parse(request.body);
      
      const result = await AuthService.login({
        email: body.email,
        password: body.password
      });

      const response: ApiResponse = {
        success: true,
        data: {
          user: {
            id: result.user.id,
            email: result.user.email,
            name: result.user.name,
            role: result.user.role,
            tenant: {
              id: result.user.tenant.id,
              name: result.user.tenant.name,
              slug: result.user.tenant.slug,
              plan: result.user.tenant.plan
            }
          },
          token: result.token,
          refreshToken: result.refreshToken,
          expiresAt: result.expiresAt
        }
      };

      return reply.code(200).send(response);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.code(400).send({
          success: false,
          error: {
            code: ErrorCodes.VALIDATION_ERROR,
            message: 'Validation failed',
            details: error.errors
          }
        });
      }

      if (error instanceof ZapinError) {
        return reply.code(error.statusCode).send({
          success: false,
          error: {
            code: error.code,
            message: error.message
          }
        });
      }

      return reply.code(500).send({
        success: false,
        error: {
          code: ErrorCodes.INTERNAL_ERROR,
          message: 'Login failed'
        }
      });
    }
  });

  // Refresh token
  fastify.post('/refresh', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = refreshTokenSchema.parse(request.body);
      
      const result = await AuthService.refreshToken(body.refreshToken);

      const response: ApiResponse = {
        success: true,
        data: {
          user: {
            id: result.user.id,
            email: result.user.email,
            name: result.user.name,
            role: result.user.role,
            tenant: {
              id: result.user.tenant.id,
              name: result.user.tenant.name,
              slug: result.user.tenant.slug,
              plan: result.user.tenant.plan
            }
          },
          token: result.token,
          refreshToken: result.refreshToken,
          expiresAt: result.expiresAt
        }
      };

      return reply.code(200).send(response);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.code(400).send({
          success: false,
          error: {
            code: ErrorCodes.VALIDATION_ERROR,
            message: 'Validation failed',
            details: error.errors
          }
        });
      }

      if (error instanceof ZapinError) {
        return reply.code(error.statusCode).send({
          success: false,
          error: {
            code: error.code,
            message: error.message
          }
        });
      }

      return reply.code(500).send({
        success: false,
        error: {
          code: ErrorCodes.INTERNAL_ERROR,
          message: 'Token refresh failed'
        }
      });
    }
  });

  // Logout user
  fastify.post('/logout', { preHandler: [authMiddleware] }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const authHeader = request.headers.authorization;
      const token = authHeader?.slice(7); // Remove 'Bearer '
      const refreshToken = (request.body as any)?.refreshToken;

      if (token) {
        await AuthService.logout(token, refreshToken);
      }

      const response: ApiResponse = {
        success: true,
        data: { message: 'Logged out successfully' }
      };

      return reply.code(200).send(response);
    } catch (error) {
      return reply.code(500).send({
        success: false,
        error: {
          code: ErrorCodes.INTERNAL_ERROR,
          message: 'Logout failed'
        }
      });
    }
  });

  // Get current user profile
  fastify.get('/me', { preHandler: [authMiddleware] }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const response: ApiResponse = {
        success: true,
        data: {
          user: {
            id: request.user.id,
            email: request.user.email,
            name: request.user.name,
            role: request.user.role,
            avatar: request.user.avatar,
            tenant: {
              id: request.tenant.id,
              name: request.tenant.name,
              slug: request.tenant.slug,
              plan: request.tenant.plan,
              status: request.tenant.status
            }
          }
        }
      };

      return reply.code(200).send(response);
    } catch (error) {
      return reply.code(500).send({
        success: false,
        error: {
          code: ErrorCodes.INTERNAL_ERROR,
          message: 'Failed to get user profile'
        }
      });
    }
  });

  // Change password
  fastify.post('/change-password', { preHandler: [authMiddleware] }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = changePasswordSchema.parse(request.body);
      
      await AuthService.changePassword(
        request.user.id,
        body.currentPassword,
        body.newPassword
      );

      const response: ApiResponse = {
        success: true,
        data: { message: 'Password changed successfully' }
      };

      return reply.code(200).send(response);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.code(400).send({
          success: false,
          error: {
            code: ErrorCodes.VALIDATION_ERROR,
            message: 'Validation failed',
            details: error.errors
          }
        });
      }

      if (error instanceof ZapinError) {
        return reply.code(error.statusCode).send({
          success: false,
          error: {
            code: error.code,
            message: error.message
          }
        });
      }

      return reply.code(500).send({
        success: false,
        error: {
          code: ErrorCodes.INTERNAL_ERROR,
          message: 'Password change failed'
        }
      });
    }
  });

  // Create API key
  fastify.post('/api-keys', { preHandler: [authMiddleware] }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = createApiKeySchema.parse(request.body);
      
      const result = await AuthService.createApiKey(
        request.user.id,
        request.tenant.id,
        {
          name: body.name,
          scopes: body.scopes,
          expiresAt: body.expiresAt ? new Date(body.expiresAt) : undefined
        }
      );

      const response: ApiResponse = {
        success: true,
        data: result
      };

      return reply.code(201).send(response);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.code(400).send({
          success: false,
          error: {
            code: ErrorCodes.VALIDATION_ERROR,
            message: 'Validation failed',
            details: error.errors
          }
        });
      }

      if (error instanceof ZapinError) {
        return reply.code(error.statusCode).send({
          success: false,
          error: {
            code: error.code,
            message: error.message
          }
        });
      }

      return reply.code(500).send({
        success: false,
        error: {
          code: ErrorCodes.INTERNAL_ERROR,
          message: 'API key creation failed'
        }
      });
    }
  });

  // List API keys
  fastify.get('/api-keys', { preHandler: [authMiddleware] }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const apiKeys = await AuthService.listApiKeys(request.user.id, request.tenant.id);

      const response: ApiResponse = {
        success: true,
        data: { apiKeys }
      };

      return reply.code(200).send(response);
    } catch (error) {
      return reply.code(500).send({
        success: false,
        error: {
          code: ErrorCodes.INTERNAL_ERROR,
          message: 'Failed to list API keys'
        }
      });
    }
  });

  // Revoke API key
  fastify.delete('/api-keys/:keyId', { preHandler: [authMiddleware] }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { keyId } = request.params as { keyId: string };
      
      await AuthService.revokeApiKey(keyId, request.user.id, request.tenant.id);

      const response: ApiResponse = {
        success: true,
        data: { message: 'API key revoked successfully' }
      };

      return reply.code(200).send(response);
    } catch (error) {
      if (error instanceof ZapinError) {
        return reply.code(error.statusCode).send({
          success: false,
          error: {
            code: error.code,
            message: error.message
          }
        });
      }

      return reply.code(500).send({
        success: false,
        error: {
          code: ErrorCodes.INTERNAL_ERROR,
          message: 'API key revocation failed'
        }
      });
    }
  });
}