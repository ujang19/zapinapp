import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth';
import { ZapinError, ErrorCodes, ApiResponse } from '../../types';
import { prisma } from '../../lib/prisma';
import { randomBytes } from 'node:crypto';

// Validation schemas for API key management

const createApiKeySchema = z.object({
  name: z.string().min(1, 'API key name is required'),
  scopes: z.array(z.string()).min(1, 'At least one scope is required'),
  expiresAt: z.string().datetime().optional()
});

const revokeApiKeySchema = z.object({
  keyId: z.string().min(1, 'API key ID is required')
});

// Helper functions for API key management
function generateApiKey(): string {
  return 'zap_' + randomBytes(32).toString('hex');
}

// Route handlers
export async function authRoutes(fastify: FastifyInstance) {

  // Note: User authentication is now handled by Better Auth at /api/auth/*



  // Create API key
  fastify.post('/api-keys', { preHandler: [authMiddleware] }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = createApiKeySchema.parse(request.body);
      
      const apiKey = generateApiKey();
      
      const result = await prisma.apiKey.create({
        data: {
          name: body.name,
          key: apiKey,
          scopes: body.scopes,
          expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
          userId: request.user.id,
          tenantId: request.tenant.id,
          isActive: true
        }
      });

      const response: ApiResponse = {
        success: true,
        data: {
          id: result.id,
          name: result.name,
          key: result.key,
          scopes: result.scopes,
          expiresAt: result.expiresAt,
          createdAt: result.createdAt
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
          message: 'API key creation failed'
        }
      });
    }
  });

  // List API keys
  fastify.get('/api-keys', { preHandler: [authMiddleware] }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const apiKeys = await prisma.apiKey.findMany({
        where: {
          userId: request.user.id,
          tenantId: request.tenant.id
        },
        select: {
          id: true,
          name: true,
          scopes: true,
          isActive: true,
          lastUsedAt: true,
          expiresAt: true,
          createdAt: true,
          updatedAt: true
          // Note: key is excluded for security
        },
        orderBy: {
          createdAt: 'desc'
        }
      });

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
      
      // Check if API key exists and belongs to the user
      const apiKey = await prisma.apiKey.findFirst({
        where: {
          id: keyId,
          userId: request.user.id,
          tenantId: request.tenant.id
        }
      });

      if (!apiKey) {
        return reply.code(404).send({
          success: false,
          error: {
            code: ErrorCodes.VALIDATION_ERROR,
            message: 'API key not found'
          }
        });
      }

      // Deactivate the API key
      await prisma.apiKey.update({
        where: { id: keyId },
        data: { isActive: false }
      });

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