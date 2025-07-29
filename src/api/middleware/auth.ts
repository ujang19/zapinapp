import { FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../../lib/prisma';
import { ZapinError, ErrorCodes, AuthResult } from '../../types';

// Extend FastifyRequest to include user and tenant
declare module 'fastify' {
  interface FastifyRequest {
    user?: any;
    tenant?: any;
    apiKey?: any;
    authType?: 'api_key';
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
  // Check for apikey header first (Evolution API style)
  const apikeyHeader = request.headers.apikey as string;
  if (apikeyHeader) {
    return await validateAPIKey(apikeyHeader);
  }

  // Fallback to Authorization Bearer header (original format)
  const authHeader = request.headers.authorization;
  if (!authHeader) {
    return { success: false, error: 'No authorization header or apikey provided' };
  }

  if (authHeader.startsWith('Bearer ')) {
    const apiKey = authHeader.substring(7);
    return await validateAPIKey(apiKey);
  }

  return { success: false, error: 'Invalid authorization format' };
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
      request.tenant = authResult.tenant;
      request.apiKey = authResult.apiKey;
      request.authType = authResult.authType;
    }
  } catch (error) {
    // Silently fail for optional auth
    request.log.debug('Optional auth failed:', error);
  }
}