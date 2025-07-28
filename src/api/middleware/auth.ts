import { FastifyRequest, FastifyReply } from 'fastify';
import jwt from 'jsonwebtoken';
import { prisma } from '../../lib/prisma';
import { ZapinError, ErrorCodes, JWTPayload, AuthResult } from '../../types';

// Extend FastifyRequest to include user and tenant
declare module 'fastify' {
  interface FastifyRequest {
    user?: any;
    tenant?: any;
    apiKey?: any;
    authType?: 'jwt' | 'api_key';
  }
}

export async function authMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
) {
  try {
    const authResult = await authenticateRequest(request);
    
    if (!authResult.success) {
      throw new ZapinError(
        ErrorCodes.UNAUTHORIZED,
        authResult.error || 'Authentication failed',
        401
      );
    }

    // Attach auth info to request
    request.user = authResult.user;
    request.tenant = authResult.tenant;
    request.apiKey = authResult.apiKey;
    request.authType = authResult.authType;

  } catch (error) {
    if (error instanceof ZapinError) {
      return reply.code(error.statusCode).send({
        success: false,
        error: {
          code: error.code,
          message: error.message,
        },
      });
    }

    return reply.code(401).send({
      success: false,
      error: {
        code: ErrorCodes.UNAUTHORIZED,
        message: 'Authentication failed',
      },
    });
  }
}

async function authenticateRequest(request: FastifyRequest): Promise<AuthResult> {
  const authHeader = request.headers.authorization;
  
  if (!authHeader?.startsWith('Bearer ')) {
    return { 
      success: false, 
      error: 'Missing or invalid authorization header' 
    };
  }

  const token = authHeader.slice(7);
  
  // Try JWT first
  const jwtResult = await validateJWT(token);
  if (jwtResult.success) {
    return jwtResult;
  }
  
  // Fallback to API key
  return await validateAPIKey(token);
}

async function validateJWT(token: string): Promise<AuthResult> {
  try {
    const secret = process.env.JWT_SECRET;
    if (!secret) {
      throw new Error('JWT_SECRET not configured');
    }

    const decoded = jwt.verify(token, secret) as JWTPayload;
    
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      include: { tenant: true }
    });
    
    if (!user || !user.isActive) {
      return { 
        success: false, 
        error: 'User not found or inactive' 
      };
    }

    if (!user.tenant || user.tenant.status !== 'ACTIVE') {
      return { 
        success: false, 
        error: 'Tenant not found or inactive' 
      };
    }

    return {
      success: true,
      user,
      tenant: user.tenant,
      authType: 'jwt'
    };
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      return { 
        success: false, 
        error: 'Token expired' 
      };
    }
    
    if (error instanceof jwt.JsonWebTokenError) {
      return { 
        success: false, 
        error: 'Invalid token' 
      };
    }
    
    return { 
      success: false, 
      error: 'JWT validation failed' 
    };
  }
}

async function validateAPIKey(apiKey: string): Promise<AuthResult> {
  try {
    const key = await prisma.apiKey.findUnique({
      where: { 
        key: apiKey,
        isActive: true
      },
      include: { 
        tenant: true,
        user: true
      }
    });

    if (!key) {
      return { 
        success: false, 
        error: 'Invalid API key' 
      };
    }

    // Check if API key is expired
    if (key.expiresAt && key.expiresAt < new Date()) {
      return { 
        success: false, 
        error: 'API key expired' 
      };
    }

    // Check if tenant is active
    if (!key.tenant || key.tenant.status !== 'ACTIVE') {
      return { 
        success: false, 
        error: 'Tenant not found or inactive' 
      };
    }

    // Update last used timestamp
    await prisma.apiKey.update({
      where: { id: key.id },
      data: { lastUsedAt: new Date() }
    });

    return {
      success: true,
      tenant: key.tenant,
      apiKey: key,
      authType: 'api_key'
    };
  } catch (error) {
    return { 
      success: false, 
      error: 'API key validation failed' 
    };
  }
}

// Middleware to check specific permissions
export function requirePermission(permission: string) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    if (request.authType === 'jwt') {
      // JWT users have full access (for now)
      return;
    }

    if (request.authType === 'api_key' && request.apiKey) {
      const hasPermission = request.apiKey.scopes.includes(permission) || 
                           request.apiKey.scopes.includes('*');
      
      if (!hasPermission) {
        throw new ZapinError(
          ErrorCodes.INSUFFICIENT_PERMISSIONS,
          `Missing required permission: ${permission}`,
          403
        );
      }
    } else {
      throw new ZapinError(
        ErrorCodes.UNAUTHORIZED,
        'Authentication required',
        401
      );
    }
  };
}

// Middleware to check if user owns a specific instance
export async function requireInstanceAccess(
  request: FastifyRequest,
  reply: FastifyReply
) {
  const instanceId = (request.params as any)?.instanceId || (request.body as any)?.instanceId;
  
  if (!instanceId) {
    throw new ZapinError(
      ErrorCodes.VALIDATION_ERROR,
      'Instance ID is required',
      400
    );
  }

  const instance = await prisma.instance.findFirst({
    where: {
      id: instanceId,
      tenantId: request.tenant.id
    }
  });

  if (!instance) {
    throw new ZapinError(
      ErrorCodes.INSTANCE_NOT_FOUND,
      'Instance not found or access denied',
      404
    );
  }

  // Attach instance to request for later use
  (request as any).instance = instance;
}

// Optional authentication middleware (doesn't throw on failure)
export async function optionalAuth(
  request: FastifyRequest,
  reply: FastifyReply
) {
  try {
    const authResult = await authenticateRequest(request);
    
    if (authResult.success) {
      request.user = authResult.user;
      request.tenant = authResult.tenant;
      request.apiKey = authResult.apiKey;
      request.authType = authResult.authType;
    }
  } catch (error) {
    // Silently fail for optional auth
    request.log.debug('Optional auth failed:', error);
  }
}