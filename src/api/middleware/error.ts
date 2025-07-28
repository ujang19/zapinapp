import { FastifyRequest, FastifyReply, FastifyError } from 'fastify';
import { ZapinError, ErrorCodes } from '../../types';

export async function errorHandler(
  error: FastifyError,
  request: FastifyRequest,
  reply: FastifyReply
) {
  // Log the error
  request.log.error({
    error: {
      message: error.message,
      stack: error.stack,
      code: error.code,
    },
    request: {
      method: request.method,
      url: request.url,
      headers: request.headers,
      body: request.body,
    },
  }, 'Request error occurred');

  // Handle Zapin custom errors
  if (error instanceof ZapinError) {
    return reply.code(error.statusCode).send({
      success: false,
      error: {
        code: error.code,
        message: error.message,
        details: error.details,
      },
      timestamp: new Date().toISOString(),
      requestId: request.id,
    });
  }

  // Handle Fastify validation errors
  if (error.validation) {
    return reply.code(400).send({
      success: false,
      error: {
        code: ErrorCodes.VALIDATION_ERROR,
        message: 'Validation failed',
        details: error.validation,
      },
      timestamp: new Date().toISOString(),
      requestId: request.id,
    });
  }

  // Handle Prisma errors
  if (error.code?.startsWith('P')) {
    return handlePrismaError(error, reply, request);
  }

  // Handle JWT errors
  if (error.name === 'JsonWebTokenError') {
    return reply.code(401).send({
      success: false,
      error: {
        code: ErrorCodes.UNAUTHORIZED,
        message: 'Invalid token',
      },
      timestamp: new Date().toISOString(),
      requestId: request.id,
    });
  }

  if (error.name === 'TokenExpiredError') {
    return reply.code(401).send({
      success: false,
      error: {
        code: ErrorCodes.UNAUTHORIZED,
        message: 'Token expired',
      },
      timestamp: new Date().toISOString(),
      requestId: request.id,
    });
  }

  // Handle rate limit errors
  if (error.statusCode === 429) {
    return reply.code(429).send({
      success: false,
      error: {
        code: ErrorCodes.RATE_LIMIT_EXCEEDED,
        message: 'Too many requests',
        details: {
          retryAfter: (error as any).headers?.['retry-after'],
        },
      },
      timestamp: new Date().toISOString(),
      requestId: request.id,
    });
  }

  // Handle timeout errors
  if (error.code === 'ETIMEDOUT' || error.code === 'ECONNRESET') {
    return reply.code(504).send({
      success: false,
      error: {
        code: ErrorCodes.EVOLUTION_API_TIMEOUT,
        message: 'Request timeout',
      },
      timestamp: new Date().toISOString(),
      requestId: request.id,
    });
  }

  // Handle network errors
  if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
    return reply.code(503).send({
      success: false,
      error: {
        code: ErrorCodes.EVOLUTION_API_UNAVAILABLE,
        message: 'Service unavailable',
      },
      timestamp: new Date().toISOString(),
      requestId: request.id,
    });
  }

  // Default internal server error
  const statusCode = error.statusCode || 500;
  return reply.code(statusCode).send({
    success: false,
    error: {
      code: ErrorCodes.INTERNAL_ERROR,
      message: process.env.NODE_ENV === 'production' 
        ? 'An unexpected error occurred' 
        : error.message,
      ...(process.env.NODE_ENV !== 'production' && {
        stack: error.stack,
        details: error,
      }),
    },
    timestamp: new Date().toISOString(),
    requestId: request.id,
  });
}

function handlePrismaError(
  error: any,
  reply: FastifyReply,
  request: FastifyRequest
) {
  const errorCode = error.code;
  
  switch (errorCode) {
    case 'P2002':
      // Unique constraint violation
      return reply.code(409).send({
        success: false,
        error: {
          code: ErrorCodes.VALIDATION_ERROR,
          message: 'Resource already exists',
          details: {
            field: error.meta?.target,
          },
        },
        timestamp: new Date().toISOString(),
        requestId: request.id,
      });

    case 'P2025':
      // Record not found
      return reply.code(404).send({
        success: false,
        error: {
          code: ErrorCodes.VALIDATION_ERROR,
          message: 'Record not found',
        },
        timestamp: new Date().toISOString(),
        requestId: request.id,
      });

    case 'P2003':
      // Foreign key constraint violation
      return reply.code(400).send({
        success: false,
        error: {
          code: ErrorCodes.VALIDATION_ERROR,
          message: 'Invalid reference',
          details: {
            field: error.meta?.field_name,
          },
        },
        timestamp: new Date().toISOString(),
        requestId: request.id,
      });

    case 'P2014':
      // Required relation violation
      return reply.code(400).send({
        success: false,
        error: {
          code: ErrorCodes.VALIDATION_ERROR,
          message: 'Required relation missing',
          details: {
            relation: error.meta?.relation_name,
          },
        },
        timestamp: new Date().toISOString(),
        requestId: request.id,
      });

    default:
      // Generic database error
      return reply.code(500).send({
        success: false,
        error: {
          code: ErrorCodes.DATABASE_ERROR,
          message: 'Database operation failed',
          ...(process.env.NODE_ENV !== 'production' && {
            details: error.message,
          }),
        },
        timestamp: new Date().toISOString(),
        requestId: request.id,
      });
  }
}

// Circuit breaker for external API calls
export class CircuitBreaker {
  private failures: number = 0;
  private lastFailureTime: number = 0;
  private state: 'CLOSED' | 'OPEN' | 'HALF_OPEN' = 'CLOSED';
  private readonly failureThreshold: number;
  private readonly recoveryTimeout: number;

  constructor(failureThreshold: number = 5, recoveryTimeout: number = 60000) {
    this.failureThreshold = failureThreshold;
    this.recoveryTimeout = recoveryTimeout;
  }

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (this.state === 'OPEN') {
      if (Date.now() - this.lastFailureTime > this.recoveryTimeout) {
        this.state = 'HALF_OPEN';
      } else {
        throw new ZapinError(
          ErrorCodes.EVOLUTION_API_UNAVAILABLE,
          'Circuit breaker is OPEN - service temporarily unavailable',
          503
        );
      }
    }

    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess(): void {
    this.failures = 0;
    this.state = 'CLOSED';
  }

  private onFailure(): void {
    this.failures++;
    this.lastFailureTime = Date.now();

    if (this.failures >= this.failureThreshold) {
      this.state = 'OPEN';
    }
  }

  getState(): string {
    return this.state;
  }

  getFailures(): number {
    return this.failures;
  }
}

// Global circuit breaker instance for Evolution API
export const evolutionApiCircuitBreaker = new CircuitBreaker(5, 60000);