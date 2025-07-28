import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { redis } from '../../lib/redis';
import { logger } from '../../lib/logger';
import { dbOptimizer } from '../../lib/database-optimization';

export class APIPerformanceOptimizer {
  private app: FastifyInstance;
  private responseCache = new Map<string, { data: any; timestamp: number; ttl: number }>();
  private rateLimiters = new Map<string, { count: number; resetTime: number }>();

  constructor(app: FastifyInstance) {
    this.app = app;
    this.setupMiddleware();
    this.setupCaching();
    this.setupCompression();
    this.setupRateLimiting();
  }

  /**
   * Setup performance middleware
   */
  private setupMiddleware() {
    // Request timing middleware
    this.app.addHook('onRequest', async (request: FastifyRequest, reply: FastifyReply) => {
      (request as any).startTime = Date.now();
    });

    // Response timing middleware
    this.app.addHook('onSend', async (request: FastifyRequest, reply: FastifyReply, payload) => {
      const responseTime = Date.now() - (request as any).startTime;
      reply.header('X-Response-Time', `${responseTime}ms`);

      // Log slow requests
      if (responseTime > 1000) {
        logger.warn('Slow API request detected', {
          method: request.method,
          url: request.url,
          responseTime: `${responseTime}ms`,
          statusCode: reply.statusCode,
          tenantId: (request as any).tenant?.id
        });
      }

      return payload;
    });

    // Memory usage monitoring
    this.app.addHook('onResponse', async (request: FastifyRequest, reply: FastifyReply) => {
      const memUsage = process.memoryUsage();
      if (memUsage.heapUsed > 500 * 1024 * 1024) { // 500MB threshold
        logger.warn('High memory usage detected', {
          heapUsed: `${Math.round(memUsage.heapUsed / 1024 / 1024)}MB`,
          heapTotal: `${Math.round(memUsage.heapTotal / 1024 / 1024)}MB`,
          external: `${Math.round(memUsage.external / 1024 / 1024)}MB`
        });
      }
    });
  }

  /**
   * Setup response caching
   */
  private setupCaching() {
    this.app.addHook('onRequest', async (request: FastifyRequest, reply: FastifyReply) => {
      // Only cache GET requests
      if (request.method !== 'GET') return;

      const cacheKey = this.generateCacheKey(request);
      const cached = await this.getCachedResponse(cacheKey);

      if (cached) {
        reply.header('X-Cache', 'HIT');
        reply.header('X-Cache-TTL', cached.ttl.toString());
        reply.send(cached.data);
        return;
      }

      // Mark for caching
      (request as any).shouldCache = true;
      (request as any).cacheKey = cacheKey;
    });

    this.app.addHook('onSend', async (request: FastifyRequest, reply: FastifyReply, payload) => {
      if (!(request as any).shouldCache || reply.statusCode !== 200) {
        return payload;
      }

      const cacheKey = (request as any).cacheKey;
      const ttl = this.getCacheTTL(request.url);

      // Cache the response
      await this.setCachedResponse(cacheKey, JSON.parse(payload as string), ttl);
      reply.header('X-Cache', 'MISS');

      return payload;
    });
  }

  /**
   * Setup response compression
   */
  private setupCompression() {
    // Fastify compression is typically handled by the compression plugin
    // This is a placeholder for custom compression logic if needed
    this.app.addHook('onSend', async (request: FastifyRequest, reply: FastifyReply, payload) => {
      // Add compression headers for large responses
      if (typeof payload === 'string' && payload.length > 1024) {
        reply.header('Content-Encoding', 'gzip');
      }
      return payload;
    });
  }

  /**
   * Setup rate limiting
   */
  private setupRateLimiting() {
    this.app.addHook('preHandler', async (request: FastifyRequest, reply: FastifyReply) => {
      const key = this.getRateLimitKey(request);
      const limit = this.getRateLimit(request);

      if (await this.isRateLimited(key, limit)) {
        reply.code(429).send({
          success: false,
          error: {
            code: 'RATE_LIMIT_EXCEEDED',
            message: 'Too many requests, please try again later'
          }
        });
        return;
      }
    });
  }

  /**
   * Generate cache key for request
   */
  private generateCacheKey(request: FastifyRequest): string {
    const tenant = (request as any).tenant;
    const user = (request as any).user;
    const queryString = new URLSearchParams(request.query as any).toString();
    
    return `api:${tenant?.id || 'anonymous'}:${user?.id || 'anonymous'}:${request.method}:${request.url}:${queryString}`;
  }

  /**
   * Get cached response
   */
  private async getCachedResponse(cacheKey: string): Promise<{ data: any; ttl: number } | null> {
    // Check memory cache first
    const memCached = this.responseCache.get(cacheKey);
    if (memCached && Date.now() - memCached.timestamp < memCached.ttl) {
      return { data: memCached.data, ttl: memCached.ttl };
    }

    // Check Redis cache
    try {
      const redisData = await redis.get(cacheKey);
      if (redisData) {
        const parsed = JSON.parse(redisData);
        const ttl = await redis.ttl(cacheKey);
        
        // Update memory cache
        this.responseCache.set(cacheKey, {
          data: parsed,
          timestamp: Date.now(),
          ttl: ttl * 1000
        });

        return { data: parsed, ttl };
      }
    } catch (error) {
      logger.warn('Redis cache read failed', { cacheKey, error });
    }

    return null;
  }

  /**
   * Set cached response
   */
  private async setCachedResponse(cacheKey: string, data: any, ttl: number): Promise<void> {
    // Set in memory cache
    this.responseCache.set(cacheKey, {
      data,
      timestamp: Date.now(),
      ttl
    });

    // Set in Redis cache
    try {
      await redis.setex(cacheKey, Math.floor(ttl / 1000), JSON.stringify(data));
    } catch (error) {
      logger.warn('Redis cache write failed', { cacheKey, error });
    }
  }

  /**
   * Get cache TTL based on endpoint
   */
  private getCacheTTL(url: string): number {
    // Different TTLs for different endpoints
    if (url.includes('/instances')) return 300000; // 5 minutes
    if (url.includes('/bots')) return 600000; // 10 minutes
    if (url.includes('/messages')) return 60000; // 1 minute
    if (url.includes('/health')) return 30000; // 30 seconds
    if (url.includes('/analytics')) return 900000; // 15 minutes
    
    return 180000; // Default: 3 minutes
  }

  /**
   * Get rate limit key
   */
  private getRateLimitKey(request: FastifyRequest): string {
    const tenant = (request as any).tenant;
    const apiKey = (request as any).apiKey;
    
    if (apiKey) {
      return `rate_limit:api_key:${apiKey.id}`;
    }
    
    if (tenant) {
      return `rate_limit:tenant:${tenant.id}`;
    }
    
    return `rate_limit:ip:${request.ip}`;
  }

  /**
   * Get rate limit for request
   */
  private getRateLimit(request: FastifyRequest): { requests: number; window: number } {
    const tenant = (request as any).tenant;
    const apiKey = (request as any).apiKey;

    // API key limits
    if (apiKey) {
      return { requests: 1000, window: 3600 }; // 1000 requests per hour
    }

    // Tenant-based limits
    if (tenant) {
      switch (tenant.plan) {
        case 'BASIC':
          return { requests: 100, window: 3600 }; // 100 requests per hour
        case 'PRO':
          return { requests: 1000, window: 3600 }; // 1000 requests per hour
        case 'ENTERPRISE':
          return { requests: 10000, window: 3600 }; // 10000 requests per hour
        default:
          return { requests: 50, window: 3600 }; // 50 requests per hour
      }
    }

    // IP-based limits for unauthenticated requests
    return { requests: 10, window: 3600 }; // 10 requests per hour
  }

  /**
   * Check if request is rate limited
   */
  private async isRateLimited(key: string, limit: { requests: number; window: number }): Promise<boolean> {
    try {
      const current = await redis.get(key);
      const count = current ? parseInt(current) : 0;

      if (count >= limit.requests) {
        return true;
      }

      // Increment counter
      const pipeline = redis.pipeline();
      pipeline.incr(key);
      if (count === 0) {
        pipeline.expire(key, limit.window);
      }
      await pipeline.exec();

      return false;
    } catch (error) {
      logger.warn('Rate limiting check failed', { key, error });
      return false; // Fail open
    }
  }

  /**
   * Optimize database queries with connection pooling
   */
  async optimizeQuery<T>(queryFn: () => Promise<T>, cacheKey?: string): Promise<T> {
    if (cacheKey) {
      return await dbOptimizer.getCachedQuery(cacheKey, queryFn);
    }
    return await queryFn();
  }

  /**
   * Batch multiple operations
   */
  async batchOperations<T>(operations: Array<() => Promise<T>>): Promise<T[]> {
    const batchSize = 10;
    const results: T[] = [];

    for (let i = 0; i < operations.length; i += batchSize) {
      const batch = operations.slice(i, i + batchSize);
      const batchResults = await Promise.all(batch.map(op => op()));
      results.push(...batchResults);
    }

    return results;
  }

  /**
   * Implement circuit breaker pattern
   */
  private circuitBreakers = new Map<string, {
    failures: number;
    lastFailure: number;
    state: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
  }>();

  async executeWithCircuitBreaker<T>(
    key: string,
    operation: () => Promise<T>,
    options: {
      failureThreshold: number;
      timeout: number;
      resetTimeout: number;
    } = {
      failureThreshold: 5,
      timeout: 30000,
      resetTimeout: 60000
    }
  ): Promise<T> {
    const breaker = this.circuitBreakers.get(key) || {
      failures: 0,
      lastFailure: 0,
      state: 'CLOSED' as const
    };

    // Check circuit breaker state
    if (breaker.state === 'OPEN') {
      if (Date.now() - breaker.lastFailure > options.resetTimeout) {
        breaker.state = 'HALF_OPEN';
      } else {
        throw new Error(`Circuit breaker is OPEN for ${key}`);
      }
    }

    try {
      const result = await Promise.race([
        operation(),
        new Promise<never>((_, reject) => 
          setTimeout(() => reject(new Error('Operation timeout')), options.timeout)
        )
      ]);

      // Success - reset circuit breaker
      breaker.failures = 0;
      breaker.state = 'CLOSED';
      this.circuitBreakers.set(key, breaker);

      return result;
    } catch (error) {
      // Failure - update circuit breaker
      breaker.failures++;
      breaker.lastFailure = Date.now();

      if (breaker.failures >= options.failureThreshold) {
        breaker.state = 'OPEN';
        logger.warn(`Circuit breaker opened for ${key}`, {
          failures: breaker.failures,
          threshold: options.failureThreshold
        });
      }

      this.circuitBreakers.set(key, breaker);
      throw error;
    }
  }

  /**
   * Implement request deduplication
   */
  private pendingRequests = new Map<string, Promise<any>>();

  async deduplicateRequest<T>(key: string, operation: () => Promise<T>): Promise<T> {
    // Check if request is already pending
    const pending = this.pendingRequests.get(key);
    if (pending) {
      return await pending;
    }

    // Execute operation
    const promise = operation();
    this.pendingRequests.set(key, promise);

    try {
      const result = await promise;
      return result;
    } finally {
      this.pendingRequests.delete(key);
    }
  }

  /**
   * Get performance metrics
   */
  getPerformanceMetrics() {
    return {
      cacheStats: {
        memoryCache: {
          size: this.responseCache.size,
          hitRate: this.calculateCacheHitRate()
        },
        circuitBreakers: Array.from(this.circuitBreakers.entries()).map(([key, breaker]) => ({
          key,
          state: breaker.state,
          failures: breaker.failures
        }))
      },
      rateLimiters: {
        active: this.rateLimiters.size
      },
      pendingRequests: {
        count: this.pendingRequests.size
      }
    };
  }

  /**
   * Calculate cache hit rate
   */
  private cacheHits = 0;
  private cacheMisses = 0;

  private calculateCacheHitRate(): number {
    const total = this.cacheHits + this.cacheMisses;
    return total > 0 ? this.cacheHits / total : 0;
  }

  /**
   * Clear all caches
   */
  async clearCaches(): Promise<void> {
    // Clear memory caches
    this.responseCache.clear();
    this.pendingRequests.clear();

    // Clear Redis caches
    try {
      const keys = await redis.keys('api:*');
      if (keys.length > 0) {
        await redis.del(...keys);
      }
    } catch (error) {
      logger.warn('Failed to clear Redis caches', error);
    }
  }

  /**
   * Warm up caches with frequently accessed data
   */
  async warmupCaches(tenantId: string): Promise<void> {
    try {
      // Pre-load tenant data
      await dbOptimizer.getTenantWithRelations(tenantId);

      // Pre-load instances
      await dbOptimizer.getInstancesPaginated(tenantId, 1, 10);

      // Pre-load quota usage
      const now = new Date();
      const hourlyPeriod = now.toISOString().slice(0, 13);
      const dailyPeriod = now.toISOString().slice(0, 10);
      const monthlyPeriod = now.toISOString().slice(0, 7);

      await Promise.all([
        dbOptimizer.getQuotaUsage(tenantId, 'MESSAGES_HOURLY', hourlyPeriod),
        dbOptimizer.getQuotaUsage(tenantId, 'MESSAGES_DAILY', dailyPeriod),
        dbOptimizer.getQuotaUsage(tenantId, 'MESSAGES_MONTHLY', monthlyPeriod)
      ]);

      logger.info('Cache warmup completed', { tenantId });
    } catch (error) {
      logger.warn('Cache warmup failed', { tenantId, error });
    }
  }
}

export default APIPerformanceOptimizer;