import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../../lib/prisma';
import { redis } from '../../lib/redis';
import { promClient } from '../../lib/metrics';
import { performance } from 'perf_hooks';

// Health check types
interface HealthCheckResult {
  status: 'healthy' | 'unhealthy' | 'degraded';
  timestamp: string;
  uptime: number;
  version: string;
  environment: string;
  checks: {
    database: HealthCheck;
    redis: HealthCheck;
    evolutionApi: HealthCheck;
    memory: HealthCheck;
    disk: HealthCheck;
  };
  metrics: {
    responseTime: number;
    memoryUsage: NodeJS.MemoryUsage;
    cpuUsage: NodeJS.CpuUsage;
  };
}

interface HealthCheck {
  status: 'healthy' | 'unhealthy' | 'degraded';
  responseTime: number;
  message?: string;
  details?: any;
}

// Health check service
class HealthCheckService {
  private static instance: HealthCheckService;
  private healthHistory: Array<{ timestamp: number; status: string }> = [];
  private maxHistorySize = 100;

  static getInstance(): HealthCheckService {
    if (!HealthCheckService.instance) {
      HealthCheckService.instance = new HealthCheckService();
    }
    return HealthCheckService.instance;
  }

  async checkDatabase(): Promise<HealthCheck> {
    const startTime = performance.now();
    
    try {
      // Test database connection with a simple query
      await prisma.$queryRaw`SELECT 1 as test`;
      
      const responseTime = performance.now() - startTime;
      
      return {
        status: responseTime < 100 ? 'healthy' : 'degraded',
        responseTime,
        message: responseTime < 100 ? 'Database connection is healthy' : 'Database response time is slow',
      };
    } catch (error) {
      const responseTime = performance.now() - startTime;
      
      return {
        status: 'unhealthy',
        responseTime,
        message: 'Database connection failed',
        details: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async checkRedis(): Promise<HealthCheck> {
    const startTime = performance.now();
    
    try {
      // Test Redis connection with ping
      const result = await redis.ping();
      const responseTime = performance.now() - startTime;
      
      if (result === 'PONG') {
        return {
          status: responseTime < 50 ? 'healthy' : 'degraded',
          responseTime,
          message: responseTime < 50 ? 'Redis connection is healthy' : 'Redis response time is slow',
        };
      } else {
        return {
          status: 'unhealthy',
          responseTime,
          message: 'Redis ping failed',
          details: { result },
        };
      }
    } catch (error) {
      const responseTime = performance.now() - startTime;
      
      return {
        status: 'unhealthy',
        responseTime,
        message: 'Redis connection failed',
        details: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async checkEvolutionApi(): Promise<HealthCheck> {
    const startTime = performance.now();
    
    try {
      const evolutionApiUrl = process.env.EVOLUTION_API_BASE_URL;
      const apiKey = process.env.EVOLUTION_GLOBAL_API_KEY;
      
      if (!evolutionApiUrl || !apiKey) {
        return {
          status: 'unhealthy',
          responseTime: 0,
          message: 'Evolution API configuration missing',
        };
      }

      // Test Evolution API connection
      const response = await fetch(`${evolutionApiUrl}/manager/instances`, {
        method: 'GET',
        headers: {
          'apikey': apiKey,
          'Content-Type': 'application/json',
        },
        signal: AbortSignal.timeout(5000), // 5 second timeout
      });

      const responseTime = performance.now() - startTime;

      if (response.ok) {
        return {
          status: responseTime < 1000 ? 'healthy' : 'degraded',
          responseTime,
          message: responseTime < 1000 ? 'Evolution API is healthy' : 'Evolution API response time is slow',
        };
      } else {
        return {
          status: 'unhealthy',
          responseTime,
          message: 'Evolution API returned error',
          details: { status: response.status, statusText: response.statusText },
        };
      }
    } catch (error) {
      const responseTime = performance.now() - startTime;
      
      return {
        status: 'unhealthy',
        responseTime,
        message: 'Evolution API connection failed',
        details: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  checkMemory(): HealthCheck {
    const memoryUsage = process.memoryUsage();
    const totalMemory = memoryUsage.heapTotal;
    const usedMemory = memoryUsage.heapUsed;
    const memoryUsagePercent = (usedMemory / totalMemory) * 100;

    let status: 'healthy' | 'unhealthy' | 'degraded' = 'healthy';
    let message = 'Memory usage is normal';

    if (memoryUsagePercent > 90) {
      status = 'unhealthy';
      message = 'Memory usage is critically high';
    } else if (memoryUsagePercent > 75) {
      status = 'degraded';
      message = 'Memory usage is high';
    }

    return {
      status,
      responseTime: 0,
      message,
      details: {
        heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024),
        heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024),
        rss: Math.round(memoryUsage.rss / 1024 / 1024),
        external: Math.round(memoryUsage.external / 1024 / 1024),
        usagePercent: Math.round(memoryUsagePercent),
      },
    };
  }

  async checkDisk(): Promise<HealthCheck> {
    try {
      const fs = await import('fs/promises');
      const stats = await fs.statfs('./');
      
      const totalSpace = stats.blocks * stats.bsize;
      const freeSpace = stats.bavail * stats.bsize;
      const usedSpace = totalSpace - freeSpace;
      const usagePercent = (usedSpace / totalSpace) * 100;

      let status: 'healthy' | 'unhealthy' | 'degraded' = 'healthy';
      let message = 'Disk usage is normal';

      if (usagePercent > 95) {
        status = 'unhealthy';
        message = 'Disk usage is critically high';
      } else if (usagePercent > 85) {
        status = 'degraded';
        message = 'Disk usage is high';
      }

      return {
        status,
        responseTime: 0,
        message,
        details: {
          totalGB: Math.round(totalSpace / 1024 / 1024 / 1024),
          freeGB: Math.round(freeSpace / 1024 / 1024 / 1024),
          usedGB: Math.round(usedSpace / 1024 / 1024 / 1024),
          usagePercent: Math.round(usagePercent),
        },
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        responseTime: 0,
        message: 'Unable to check disk usage',
        details: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async performHealthCheck(): Promise<HealthCheckResult> {
    const startTime = performance.now();
    const cpuUsageStart = process.cpuUsage();

    // Run all health checks in parallel
    const [database, redis, evolutionApi, memory, disk] = await Promise.all([
      this.checkDatabase(),
      this.checkRedis(),
      this.checkEvolutionApi(),
      Promise.resolve(this.checkMemory()),
      this.checkDisk(),
    ]);

    const responseTime = performance.now() - startTime;
    const cpuUsage = process.cpuUsage(cpuUsageStart);
    const memoryUsage = process.memoryUsage();

    // Determine overall status
    const checks = { database, redis, evolutionApi, memory, disk };
    const statuses = Object.values(checks).map(check => check.status);
    
    let overallStatus: 'healthy' | 'unhealthy' | 'degraded' = 'healthy';
    
    if (statuses.includes('unhealthy')) {
      overallStatus = 'unhealthy';
    } else if (statuses.includes('degraded')) {
      overallStatus = 'degraded';
    }

    // Record health status in history
    this.recordHealthStatus(overallStatus);

    const result: HealthCheckResult = {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: process.env.npm_package_version || '1.0.0',
      environment: process.env.NODE_ENV || 'development',
      checks,
      metrics: {
        responseTime,
        memoryUsage,
        cpuUsage,
      },
    };

    // Update Prometheus metrics
    this.updateMetrics(result);

    return result;
  }

  private recordHealthStatus(status: string): void {
    this.healthHistory.push({
      timestamp: Date.now(),
      status,
    });

    // Keep only recent history
    if (this.healthHistory.length > this.maxHistorySize) {
      this.healthHistory = this.healthHistory.slice(-this.maxHistorySize);
    }
  }

  private updateMetrics(result: HealthCheckResult): void {
    // Update health check metrics
    const healthGauge = new promClient.Gauge({
      name: 'zapin_health_status',
      help: 'Overall health status (1=healthy, 0.5=degraded, 0=unhealthy)',
      labelNames: ['service'],
    });

    const responseTimeGauge = new promClient.Gauge({
      name: 'zapin_health_check_response_time_ms',
      help: 'Health check response time in milliseconds',
      labelNames: ['check'],
    });

    // Set overall health status
    const statusValue = result.status === 'healthy' ? 1 : result.status === 'degraded' ? 0.5 : 0;
    healthGauge.set({ service: 'overall' }, statusValue);

    // Set individual check response times
    Object.entries(result.checks).forEach(([checkName, check]) => {
      responseTimeGauge.set({ check: checkName }, check.responseTime);
      
      const checkStatusValue = check.status === 'healthy' ? 1 : check.status === 'degraded' ? 0.5 : 0;
      healthGauge.set({ service: checkName }, checkStatusValue);
    });
  }

  getHealthHistory(): Array<{ timestamp: number; status: string }> {
    return [...this.healthHistory];
  }

  getHealthSummary(): {
    current: string;
    uptime: number;
    totalChecks: number;
    healthyChecks: number;
    degradedChecks: number;
    unhealthyChecks: number;
  } {
    const recentChecks = this.healthHistory.slice(-10);
    const healthyCount = recentChecks.filter(h => h.status === 'healthy').length;
    const degradedCount = recentChecks.filter(h => h.status === 'degraded').length;
    const unhealthyCount = recentChecks.filter(h => h.status === 'unhealthy').length;

    return {
      current: this.healthHistory[this.healthHistory.length - 1]?.status || 'unknown',
      uptime: process.uptime(),
      totalChecks: recentChecks.length,
      healthyChecks: healthyCount,
      degradedChecks: degradedCount,
      unhealthyChecks: unhealthyCount,
    };
  }
}

// Health check routes
export async function healthRoutes(fastify: FastifyInstance) {
  const healthService = HealthCheckService.getInstance();

  // Basic health check endpoint
  fastify.get('/health', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const healthResult = await healthService.performHealthCheck();
      
      const statusCode = healthResult.status === 'healthy' ? 200 : 
                        healthResult.status === 'degraded' ? 200 : 503;
      
      return reply.status(statusCode).send({
        success: true,
        data: healthResult,
      });
    } catch (error) {
      return reply.status(500).send({
        success: false,
        error: 'Health check failed',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  // Detailed health check endpoint
  fastify.get('/health/detailed', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const healthResult = await healthService.performHealthCheck();
      const healthHistory = healthService.getHealthHistory();
      const healthSummary = healthService.getHealthSummary();
      
      return reply.send({
        success: true,
        data: {
          current: healthResult,
          history: healthHistory,
          summary: healthSummary,
        },
      });
    } catch (error) {
      return reply.status(500).send({
        success: false,
        error: 'Detailed health check failed',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  // Liveness probe (for Kubernetes)
  fastify.get('/health/live', async (request: FastifyRequest, reply: FastifyReply) => {
    // Simple liveness check - just verify the process is running
    return reply.send({
      status: 'alive',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    });
  });

  // Readiness probe (for Kubernetes)
  fastify.get('/health/ready', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      // Check if essential services are ready
      const [dbCheck, redisCheck] = await Promise.all([
        healthService.checkDatabase(),
        healthService.checkRedis(),
      ]);

      const isReady = dbCheck.status !== 'unhealthy' && redisCheck.status !== 'unhealthy';
      
      if (isReady) {
        return reply.send({
          status: 'ready',
          timestamp: new Date().toISOString(),
          checks: {
            database: dbCheck.status,
            redis: redisCheck.status,
          },
        });
      } else {
        return reply.status(503).send({
          status: 'not_ready',
          timestamp: new Date().toISOString(),
          checks: {
            database: dbCheck.status,
            redis: redisCheck.status,
          },
        });
      }
    } catch (error) {
      return reply.status(503).send({
        status: 'not_ready',
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  // Health check for specific service
  fastify.get('/health/:service', async (request: FastifyRequest<{
    Params: { service: string };
  }>, reply: FastifyReply) => {
    const { service } = request.params;
    
    try {
      let check: HealthCheck;
      
      switch (service) {
        case 'database':
          check = await healthService.checkDatabase();
          break;
        case 'redis':
          check = await healthService.checkRedis();
          break;
        case 'evolution-api':
          check = await healthService.checkEvolutionApi();
          break;
        case 'memory':
          check = healthService.checkMemory();
          break;
        case 'disk':
          check = await healthService.checkDisk();
          break;
        default:
          return reply.status(404).send({
            success: false,
            error: 'Service not found',
            message: `Health check for service '${service}' is not available`,
          });
      }
      
      const statusCode = check.status === 'unhealthy' ? 503 : 200;
      
      return reply.status(statusCode).send({
        success: true,
        data: {
          service,
          ...check,
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      return reply.status(500).send({
        success: false,
        error: 'Service health check failed',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });
}

// Export health service for use in other parts of the application
export { HealthCheckService };