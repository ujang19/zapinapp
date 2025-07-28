import Redis from 'ioredis';
import { logger } from './logger';

export class RedisOptimizer {
  private redis: Redis;
  private connectionPool: Redis[] = [];
  private poolSize: number = 10;
  private currentPoolIndex: number = 0;
  private metrics = {
    hits: 0,
    misses: 0,
    operations: 0,
    errors: 0,
    connectionErrors: 0
  };

  constructor(redisUrl: string) {
    this.redis = new Redis(redisUrl, {
      // Connection optimization
      connectTimeout: 10000,
      lazyConnect: true,
      maxRetriesPerRequest: 3,
      enableReadyCheck: false,
      
      // Performance optimization
      keepAlive: 30000,
      family: 4,
      
      // Cluster settings (if using Redis Cluster)
      enableOfflineQueue: false
    });

    this.setupConnectionPool();
    this.setupEventHandlers();
    this.setupHealthMonitoring();
  }

  /**
   * Setup connection pool for better performance
   */
  private setupConnectionPool() {
    this.connectionPool = [];
    
    for (let i = 0; i < this.poolSize; i++) {
      const connection = this.redis.duplicate();
      this.connectionPool.push(connection);
    }

    logger.info(`Redis connection pool initialized with ${this.poolSize} connections`);
  }

  /**
   * Get connection from pool using round-robin
   */
  private getConnection(): Redis {
    const connection = this.connectionPool[this.currentPoolIndex];
    this.currentPoolIndex = (this.currentPoolIndex + 1) % this.poolSize;
    return connection;
  }

  /**
   * Setup event handlers for monitoring
   */
  private setupEventHandlers() {
    this.redis.on('connect', () => {
      logger.info('Redis connected successfully');
    });

    this.redis.on('ready', () => {
      logger.info('Redis ready for operations');
    });

    this.redis.on('error', (error) => {
      this.metrics.connectionErrors++;
      logger.error('Redis connection error', error);
    });

    this.redis.on('close', () => {
      logger.warn('Redis connection closed');
    });

    this.redis.on('reconnecting', (delay: number) => {
      logger.info(`Redis reconnecting in ${delay}ms`);
    });

    // Setup pool connection handlers
    this.connectionPool.forEach((connection, index) => {
      connection.on('error', (error) => {
        logger.error(`Redis pool connection ${index} error`, error);
      });
    });
  }

  /**
   * Setup health monitoring
   */
  private setupHealthMonitoring() {
    setInterval(async () => {
      try {
        await this.healthCheck();
      } catch (error) {
        logger.error('Redis health check failed', error);
      }
    }, 30000); // Every 30 seconds
  }

  /**
   * Optimized GET operation with fallback
   */
  async get(key: string): Promise<string | null> {
    this.metrics.operations++;
    
    try {
      const connection = this.getConnection();
      const result = await connection.get(key);
      
      if (result !== null) {
        this.metrics.hits++;
      } else {
        this.metrics.misses++;
      }
      
      return result;
    } catch (error) {
      this.metrics.errors++;
      logger.error('Redis GET operation failed', { key, error });
      
      // Try with main connection as fallback
      try {
        const result = await this.redis.get(key);
        return result;
      } catch (fallbackError) {
        logger.error('Redis GET fallback failed', { key, error: fallbackError });
        return null;
      }
    }
  }

  /**
   * Optimized SET operation with expiration
   */
  async set(key: string, value: string, ttl?: number): Promise<boolean> {
    this.metrics.operations++;
    
    try {
      const connection = this.getConnection();
      
      if (ttl) {
        await connection.setex(key, ttl, value);
      } else {
        await connection.set(key, value);
      }
      
      return true;
    } catch (error) {
      this.metrics.errors++;
      logger.error('Redis SET operation failed', { key, error });
      return false;
    }
  }

  /**
   * Optimized SETEX operation
   */
  async setex(key: string, ttl: number, value: string): Promise<boolean> {
    return this.set(key, value, ttl);
  }

  /**
   * Batch GET operations using pipeline
   */
  async mget(keys: string[]): Promise<(string | null)[]> {
    this.metrics.operations += keys.length;
    
    try {
      const connection = this.getConnection();
      const pipeline = connection.pipeline();
      
      keys.forEach(key => pipeline.get(key));
      const results = await pipeline.exec();
      
      if (!results) {
        throw new Error('Pipeline execution failed');
      }
      
      const values = results.map(([error, result]) => {
        if (error) {
          this.metrics.errors++;
          return null;
        }
        
        if (result !== null) {
          this.metrics.hits++;
        } else {
          this.metrics.misses++;
        }
        
        return result as string | null;
      });
      
      return values;
    } catch (error) {
      this.metrics.errors += keys.length;
      logger.error('Redis MGET operation failed', { keys, error });
      return keys.map(() => null);
    }
  }

  /**
   * Batch SET operations using pipeline
   */
  async mset(keyValues: Array<{ key: string; value: string; ttl?: number }>): Promise<boolean> {
    this.metrics.operations += keyValues.length;
    
    try {
      const connection = this.getConnection();
      const pipeline = connection.pipeline();
      
      keyValues.forEach(({ key, value, ttl }) => {
        if (ttl) {
          pipeline.setex(key, ttl, value);
        } else {
          pipeline.set(key, value);
        }
      });
      
      const results = await pipeline.exec();
      
      if (!results) {
        throw new Error('Pipeline execution failed');
      }
      
      // Check for errors
      const hasErrors = results.some(([error]) => error !== null);
      if (hasErrors) {
        this.metrics.errors += keyValues.length;
        logger.error('Redis MSET pipeline had errors', { keyValues });
        return false;
      }
      
      return true;
    } catch (error) {
      this.metrics.errors += keyValues.length;
      logger.error('Redis MSET operation failed', { keyValues, error });
      return false;
    }
  }

  /**
   * Optimized DELETE operation
   */
  async del(key: string): Promise<boolean> {
    this.metrics.operations++;
    
    try {
      const connection = this.getConnection();
      const result = await connection.del(key);
      return result > 0;
    } catch (error) {
      this.metrics.errors++;
      logger.error('Redis DEL operation failed', { key, error });
      return false;
    }
  }

  /**
   * Batch DELETE operations
   */
  async mdel(keys: string[]): Promise<number> {
    this.metrics.operations += keys.length;
    
    try {
      const connection = this.getConnection();
      const result = await connection.del(...keys);
      return result;
    } catch (error) {
      this.metrics.errors += keys.length;
      logger.error('Redis MDEL operation failed', { keys, error });
      return 0;
    }
  }

  /**
   * Check if key exists
   */
  async exists(key: string): Promise<boolean> {
    this.metrics.operations++;
    
    try {
      const connection = this.getConnection();
      const result = await connection.exists(key);
      return result === 1;
    } catch (error) {
      this.metrics.errors++;
      logger.error('Redis EXISTS operation failed', { key, error });
      return false;
    }
  }

  /**
   * Get TTL for key
   */
  async ttl(key: string): Promise<number> {
    this.metrics.operations++;
    
    try {
      const connection = this.getConnection();
      const result = await connection.ttl(key);
      return result;
    } catch (error) {
      this.metrics.errors++;
      logger.error('Redis TTL operation failed', { key, error });
      return -1;
    }
  }

  /**
   * Set expiration for key
   */
  async expire(key: string, ttl: number): Promise<boolean> {
    this.metrics.operations++;
    
    try {
      const connection = this.getConnection();
      const result = await connection.expire(key, ttl);
      return result === 1;
    } catch (error) {
      this.metrics.errors++;
      logger.error('Redis EXPIRE operation failed', { key, ttl, error });
      return false;
    }
  }

  /**
   * Increment counter with optional expiration
   */
  async incr(key: string, ttl?: number): Promise<number> {
    this.metrics.operations++;
    
    try {
      const connection = this.getConnection();
      const pipeline = connection.pipeline();
      
      pipeline.incr(key);
      if (ttl) {
        pipeline.expire(key, ttl);
      }
      
      const results = await pipeline.exec();
      
      if (!results || results[0][1] === null) {
        throw new Error('INCR operation failed');
      }
      
      return results[0][1] as number;
    } catch (error) {
      this.metrics.errors++;
      logger.error('Redis INCR operation failed', { key, ttl, error });
      return 0;
    }
  }

  /**
   * Hash operations - optimized HGET
   */
  async hget(key: string, field: string): Promise<string | null> {
    this.metrics.operations++;
    
    try {
      const connection = this.getConnection();
      const result = await connection.hget(key, field);
      
      if (result !== null) {
        this.metrics.hits++;
      } else {
        this.metrics.misses++;
      }
      
      return result;
    } catch (error) {
      this.metrics.errors++;
      logger.error('Redis HGET operation failed', { key, field, error });
      return null;
    }
  }

  /**
   * Hash operations - optimized HSET
   */
  async hset(key: string, field: string, value: string): Promise<boolean> {
    this.metrics.operations++;
    
    try {
      const connection = this.getConnection();
      await connection.hset(key, field, value);
      return true;
    } catch (error) {
      this.metrics.errors++;
      logger.error('Redis HSET operation failed', { key, field, error });
      return false;
    }
  }

  /**
   * Hash operations - get all fields
   */
  async hgetall(key: string): Promise<Record<string, string> | null> {
    this.metrics.operations++;
    
    try {
      const connection = this.getConnection();
      const result = await connection.hgetall(key);
      
      if (Object.keys(result).length > 0) {
        this.metrics.hits++;
      } else {
        this.metrics.misses++;
      }
      
      return result;
    } catch (error) {
      this.metrics.errors++;
      logger.error('Redis HGETALL operation failed', { key, error });
      return null;
    }
  }

  /**
   * List operations - push to list
   */
  async lpush(key: string, ...values: string[]): Promise<number> {
    this.metrics.operations++;
    
    try {
      const connection = this.getConnection();
      const result = await connection.lpush(key, ...values);
      return result;
    } catch (error) {
      this.metrics.errors++;
      logger.error('Redis LPUSH operation failed', { key, values, error });
      return 0;
    }
  }

  /**
   * List operations - pop from list
   */
  async lpop(key: string): Promise<string | null> {
    this.metrics.operations++;
    
    try {
      const connection = this.getConnection();
      const result = await connection.lpop(key);
      return result;
    } catch (error) {
      this.metrics.errors++;
      logger.error('Redis LPOP operation failed', { key, error });
      return null;
    }
  }

  /**
   * Set operations - add to set
   */
  async sadd(key: string, ...members: string[]): Promise<number> {
    this.metrics.operations++;
    
    try {
      const connection = this.getConnection();
      const result = await connection.sadd(key, ...members);
      return result;
    } catch (error) {
      this.metrics.errors++;
      logger.error('Redis SADD operation failed', { key, members, error });
      return 0;
    }
  }

  /**
   * Set operations - get all members
   */
  async smembers(key: string): Promise<string[]> {
    this.metrics.operations++;
    
    try {
      const connection = this.getConnection();
      const result = await connection.smembers(key);
      return result;
    } catch (error) {
      this.metrics.errors++;
      logger.error('Redis SMEMBERS operation failed', { key, error });
      return [];
    }
  }

  /**
   * Flush all data (use with caution)
   */
  async flushall(): Promise<boolean> {
    try {
      await this.redis.flushall();
      logger.warn('Redis FLUSHALL executed - all data cleared');
      return true;
    } catch (error) {
      logger.error('Redis FLUSHALL failed', error);
      return false;
    }
  }

  /**
   * Get keys matching pattern (use with caution in production)
   */
  async keys(pattern: string): Promise<string[]> {
    this.metrics.operations++;
    
    try {
      const connection = this.getConnection();
      const result = await connection.keys(pattern);
      return result;
    } catch (error) {
      this.metrics.errors++;
      logger.error('Redis KEYS operation failed', { pattern, error });
      return [];
    }
  }

  /**
   * Scan keys with cursor (preferred over KEYS)
   */
  async scan(cursor: string = '0', pattern?: string, count?: number): Promise<{ cursor: string; keys: string[] }> {
    this.metrics.operations++;
    
    try {
      const connection = this.getConnection();
      let result: [string, string[]];
      
      if (pattern && count) {
        result = await connection.scan(cursor, 'MATCH', pattern, 'COUNT', count);
      } else if (pattern) {
        result = await connection.scan(cursor, 'MATCH', pattern);
      } else if (count) {
        result = await connection.scan(cursor, 'COUNT', count);
      } else {
        result = await connection.scan(cursor);
      }
      
      const [newCursor, keys] = result;
      
      return {
        cursor: newCursor,
        keys: keys as string[]
      };
    } catch (error) {
      this.metrics.errors++;
      logger.error('Redis SCAN operation failed', { cursor, pattern, count, error });
      return { cursor: '0', keys: [] };
    }
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<boolean> {
    try {
      const start = Date.now();
      await this.redis.ping();
      const latency = Date.now() - start;
      
      logger.debug('Redis health check passed', { latency: `${latency}ms` });
      
      // Check connection pool health
      const poolHealth = await Promise.allSettled(
        this.connectionPool.map(conn => conn.ping())
      );
      
      const healthyConnections = poolHealth.filter(result => result.status === 'fulfilled').length;
      
      if (healthyConnections < this.poolSize * 0.5) {
        logger.warn('Redis connection pool degraded', {
          healthy: healthyConnections,
          total: this.poolSize
        });
      }
      
      return true;
    } catch (error) {
      logger.error('Redis health check failed', error);
      return false;
    }
  }

  /**
   * Get performance metrics
   */
  getMetrics() {
    const hitRate = this.metrics.hits + this.metrics.misses > 0 
      ? this.metrics.hits / (this.metrics.hits + this.metrics.misses) 
      : 0;

    return {
      ...this.metrics,
      hitRate: Math.round(hitRate * 100) / 100,
      poolSize: this.poolSize,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Reset metrics
   */
  resetMetrics() {
    this.metrics = {
      hits: 0,
      misses: 0,
      operations: 0,
      errors: 0,
      connectionErrors: 0
    };
  }

  /**
   * Get Redis info
   */
  async getInfo(): Promise<string> {
    try {
      const info = await this.redis.info();
      return info;
    } catch (error) {
      logger.error('Failed to get Redis info', error);
      return '';
    }
  }

  /**
   * Close all connections
   */
  async close(): Promise<void> {
    try {
      await Promise.all([
        this.redis.quit(),
        ...this.connectionPool.map(conn => conn.quit())
      ]);
      
      logger.info('All Redis connections closed');
    } catch (error) {
      logger.error('Error closing Redis connections', error);
    }
  }
}

// Export optimized Redis instance
export const optimizedRedis = new RedisOptimizer(
  process.env.REDIS_URL || 'redis://localhost:6379'
);

export default optimizedRedis;