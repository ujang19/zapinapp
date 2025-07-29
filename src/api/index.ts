import Fastify, { FastifyInstance } from 'fastify';
// Import Fastify plugins
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { prisma } from '../lib/prisma';
import { redis } from '../lib/redis';

// Import routes
import { authRoutes } from './routes/auth';
import instanceRoutes from './routes/instances';
import v1Routes from './routes/v1';
import webhookRoutes from './routes/webhooks';
import { registerSwagger } from './docs/swagger';

// Import middleware
import { authMiddleware } from './middleware/auth';
import { quotaMiddleware } from './middleware/quota';
import { errorHandler } from './middleware/error';
import { metricsMiddleware, metricsOnSendHook } from './middleware/metrics';

const PORT = parseInt(process.env.API_PORT || '3001');
const HOST = process.env.HOST || '0.0.0.0';

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL || 'info',
      transport: process.env.NODE_ENV === 'development' ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'HH:MM:ss Z',
          ignore: 'pid,hostname',
        },
      } : undefined,
    },
    requestIdHeader: 'x-request-id',
    requestIdLogLabel: 'reqId',
    genReqId: () => Math.random().toString(36).substring(2, 15),
  });

  // Register plugins
  await app.register(helmet, {
    contentSecurityPolicy: false, // Disable for API
  });

  await app.register(cors, {
    origin: process.env.CORS_ORIGIN?.split(',') || ['http://localhost:3000'],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  });

  await app.register(rateLimit, {
    max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100'),
    timeWindow: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000'),
    redis: redis,
    keyGenerator: (request: any) => {
      return request.ip || 'anonymous';
    },
  });

  // Register Swagger documentation
  await registerSwagger(app);

  // Global middleware
  app.addHook('preHandler', metricsMiddleware);
  app.addHook('onSend', metricsOnSendHook);
  app.setErrorHandler(errorHandler);

  // Health check
  app.get('/health', async (request, reply) => {
    try {
      // Check database connection
      await prisma.$queryRaw`SELECT 1`;
      
      // Check Redis connection
      await redis.ping();

      return {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        version: process.env.APP_VERSION || '1.0.0',
        services: {
          database: 'healthy',
          redis: 'healthy',
        },
      };
    } catch (error) {
      reply.code(503);
      return {
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  });

  // Metrics endpoint
  app.get('/metrics', async (request, reply) => {
    const { register } = await import('../lib/metrics');
    reply.type('text/plain');
    return register.metrics();
  });

  // Register routes
  await app.register(authRoutes, { prefix: '/auth' });
  
  // Legacy instance routes (for backward compatibility)
  await app.register(instanceRoutes, {
    prefix: '/instances',
    preHandler: [authMiddleware]
  });
  
  // Main Evolution API proxy routes
  await app.register(v1Routes, {
    prefix: '/api/v1'
  });

  // Webhook routes (no auth required for incoming webhooks)
  await app.register(webhookRoutes, {
    prefix: '/api'
  });

  // 404 handler
  app.setNotFoundHandler((request, reply) => {
    reply.code(404).send({
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: `Route ${request.method} ${request.url} not found`,
      },
    });
  });

  return app;
}

async function start() {
  try {
    const app = await buildApp();
    
    // Graceful shutdown
    const gracefulShutdown = async (signal: string) => {
      app.log.info(`Received ${signal}, shutting down gracefully...`);
      
      try {
        await app.close();
        await prisma.$disconnect();
        await redis.disconnect();
        app.log.info('Server closed successfully');
        process.exit(0);
      } catch (error) {
        app.log.error('Error during shutdown:', error);
        process.exit(1);
      }
    };

    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));

    // Start server
    await app.listen({ port: PORT, host: HOST });
    app.log.info(`🚀 Zapin API server started on http://${HOST}:${PORT}`);
    app.log.info(`📚 API documentation available at http://${HOST}:${PORT}/docs`);
    
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

// Start server if this file is run directly
if (require.main === module) {
  start();
}

export { buildApp, start };
export default buildApp;