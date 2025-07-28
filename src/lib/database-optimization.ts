import { PrismaClient } from '@prisma/client';
import { logger } from './logger';
import { redis } from './redis';

export class DatabaseOptimizer {
  private prisma: PrismaClient;
  private queryCache = new Map<string, { result: any; timestamp: number; ttl: number }>();

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
    this.setupQueryLogging();
    this.setupConnectionPooling();
  }

  /**
   * Setup query logging and performance monitoring
   */
  private setupQueryLogging() {
    this.prisma.$use(async (params, next) => {
      const start = Date.now();
      const result = await next(params);
      const duration = Date.now() - start;

      // Log slow queries
      if (duration > 1000) {
        logger.warn('Slow database query detected', {
          model: params.model,
          action: params.action,
          duration: `${duration}ms`,
          args: JSON.stringify(params.args).substring(0, 500)
        });
      }

      // Log all queries in debug mode
      logger.debug('Database query executed', {
        model: params.model,
        action: params.action,
        duration: `${duration}ms`
      });

      return result;
    });
  }

  /**
   * Setup connection pooling optimization
   */
  private setupConnectionPooling() {
    // Connection pool is configured via DATABASE_URL and Prisma schema
    // Monitor connection usage
    setInterval(async () => {
      try {
        const metrics = await this.getConnectionMetrics();
        logger.debug('Database connection metrics', metrics);
      } catch (error) {
        logger.error('Failed to get connection metrics', error);
      }
    }, 60000); // Every minute
  }

  /**
   * Get database connection metrics
   */
  async getConnectionMetrics() {
    const result = await this.prisma.$queryRaw`
      SELECT 
        count(*) as total_connections,
        count(*) FILTER (WHERE state = 'active') as active_connections,
        count(*) FILTER (WHERE state = 'idle') as idle_connections
      FROM pg_stat_activity 
      WHERE datname = current_database()
    ` as any[];

    return result[0];
  }

  /**
   * Optimize frequently used queries with caching
   */
  async getCachedQuery<T>(
    cacheKey: string,
    queryFn: () => Promise<T>,
    ttl: number = 300000 // 5 minutes default
  ): Promise<T> {
    // Check memory cache first
    const cached = this.queryCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < cached.ttl) {
      return cached.result;
    }

    // Check Redis cache
    try {
      const redisResult = await redis.get(`db:${cacheKey}`);
      if (redisResult) {
        const parsed = JSON.parse(redisResult);
        this.queryCache.set(cacheKey, {
          result: parsed,
          timestamp: Date.now(),
          ttl
        });
        return parsed;
      }
    } catch (error) {
      logger.warn('Redis cache miss for database query', { cacheKey, error });
    }

    // Execute query
    const result = await queryFn();

    // Cache the result
    this.queryCache.set(cacheKey, {
      result,
      timestamp: Date.now(),
      ttl
    });

    // Cache in Redis
    try {
      await redis.setex(`db:${cacheKey}`, Math.floor(ttl / 1000), JSON.stringify(result));
    } catch (error) {
      logger.warn('Failed to cache query result in Redis', { cacheKey, error });
    }

    return result;
  }

  /**
   * Invalidate cache for specific patterns
   */
  async invalidateCache(pattern: string) {
    // Clear memory cache
    const keys = Array.from(this.queryCache.keys());
    for (const key of keys) {
      if (key.includes(pattern)) {
        this.queryCache.delete(key);
      }
    }

    // Clear Redis cache
    try {
      const keys = await redis.keys(`db:*${pattern}*`);
      if (keys.length > 0) {
        await redis.del(...keys);
      }
    } catch (error) {
      logger.warn('Failed to invalidate Redis cache', { pattern, error });
    }
  }

  /**
   * Optimized tenant data retrieval
   */
  async getTenantWithRelations(tenantId: string) {
    return this.getCachedQuery(
      `tenant:${tenantId}:full`,
      async () => {
        return await this.prisma.tenant.findUnique({
          where: { id: tenantId },
          include: {
            users: {
              select: {
                id: true,
                email: true,
                name: true,
                role: true,
                isActive: true,
                createdAt: true
              }
            },
            instances: {
              select: {
                id: true,
                name: true,
                status: true,
                phoneNumber: true,
                isActive: true,
                lastConnectedAt: true,
                _count: {
                  select: {
                    messageLogs: true,
                    bots: true
                  }
                }
              }
            },
            _count: {
              select: {
                users: true,
                instances: true,
                bots: true,
                apiKeys: true
              }
            }
          }
        });
      },
      300000 // 5 minutes
    );
  }

  /**
   * Optimized instance listing with pagination
   */
  async getInstancesPaginated(
    tenantId: string,
    page: number = 1,
    limit: number = 10,
    filters: any = {}
  ) {
    const offset = (page - 1) * limit;
    const cacheKey = `instances:${tenantId}:${page}:${limit}:${JSON.stringify(filters)}`;

    return this.getCachedQuery(
      cacheKey,
      async () => {
        const where = {
          tenantId,
          ...filters
        };

        const [instances, total] = await Promise.all([
          this.prisma.instance.findMany({
            where,
            include: {
              bots: {
                select: {
                  id: true,
                  name: true,
                  type: true,
                  isActive: true
                }
              },
              _count: {
                select: {
                  messageLogs: true
                }
              }
            },
            orderBy: { createdAt: 'desc' },
            skip: offset,
            take: limit
          }),
          this.prisma.instance.count({ where })
        ]);

        return {
          instances,
          pagination: {
            page,
            limit,
            total,
            pages: Math.ceil(total / limit)
          }
        };
      },
      180000 // 3 minutes
    );
  }

  /**
   * Optimized quota usage retrieval
   */
  async getQuotaUsage(tenantId: string, quotaType: string, period: string) {
    return this.getCachedQuery(
      `quota:${tenantId}:${quotaType}:${period}`,
      async () => {
        return await this.prisma.quotaUsage.findUnique({
          where: {
            tenantId_quotaType_period: {
              tenantId,
              quotaType: quotaType as any,
              period
            }
          }
        });
      },
      60000 // 1 minute (quota data changes frequently)
    );
  }

  /**
   * Bulk quota updates for better performance
   */
  async updateQuotaUsageBulk(updates: Array<{
    tenantId: string;
    quotaType: string;
    period: string;
    increment: number;
  }>) {
    const queries = updates.map(update => {
      return this.prisma.quotaUsage.upsert({
        where: {
          tenantId_quotaType_period: {
            tenantId: update.tenantId,
            quotaType: update.quotaType as any,
            period: update.period
          }
        },
        update: {
          used: {
            increment: update.increment
          }
        },
        create: {
          tenantId: update.tenantId,
          quotaType: update.quotaType as any,
          period: update.period,
          used: update.increment,
          limit: this.getDefaultQuotaLimit(update.quotaType),
          resetAt: this.calculateResetTime(update.period)
        }
      });
    });

    await this.prisma.$transaction(queries);

    // Invalidate related caches
    for (const update of updates) {
      await this.invalidateCache(`quota:${update.tenantId}:${update.quotaType}`);
    }
  }

  /**
   * Optimized message log insertion with batching
   */
  async createMessageLogsBatch(logs: Array<{
    tenantId: string;
    instanceId: string;
    messageId?: string;
    endpoint: string;
    method: string;
    status: string;
    phoneNumber?: string;
    content?: string;
    metadata?: any;
  }>) {
    const batchSize = 100;
    const batches = [];

    for (let i = 0; i < logs.length; i += batchSize) {
      batches.push(logs.slice(i, i + batchSize));
    }

    for (const batch of batches) {
      await this.prisma.messageLog.createMany({
        data: batch.map(log => ({
          ...log,
          status: log.status as any,
          createdAt: new Date()
        })),
        skipDuplicates: true
      });
    }

    // Invalidate related caches
    const tenantIds = Array.from(new Set(logs.map(log => log.tenantId)));
    for (const tenantId of tenantIds) {
      await this.invalidateCache(`messages:${tenantId}`);
    }
  }

  /**
   * Database maintenance operations
   */
  async performMaintenance() {
    logger.info('Starting database maintenance');

    try {
      // Analyze tables for better query planning
      await this.analyzeDatabase();

      // Clean up old data
      await this.cleanupOldData();

      // Update statistics
      await this.updateStatistics();

      logger.info('Database maintenance completed successfully');
    } catch (error) {
      logger.error('Database maintenance failed', error);
      throw error;
    }
  }

  /**
   * Analyze database tables
   */
  private async analyzeDatabase() {
    const tables = [
      'users', 'tenants', 'instances', 'bots', 'message_logs',
      'quota_usage', 'api_keys', 'sessions', 'audit_logs'
    ];

    for (const table of tables) {
      try {
        await this.prisma.$executeRawUnsafe(`ANALYZE ${table}`);
        logger.debug(`Analyzed table: ${table}`);
      } catch (error) {
        logger.warn(`Failed to analyze table ${table}`, error);
      }
    }
  }

  /**
   * Clean up old data
   */
  private async cleanupOldData() {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    // Clean up old sessions
    const deletedSessions = await this.prisma.session.deleteMany({
      where: {
        expiresAt: {
          lt: new Date()
        }
      }
    });

    // Clean up old message logs (keep last 30 days)
    const deletedLogs = await this.prisma.messageLog.deleteMany({
      where: {
        createdAt: {
          lt: thirtyDaysAgo
        }
      }
    });

    // Clean up old audit logs (keep last 7 days for non-critical)
    const deletedAuditLogs = await this.prisma.auditLog.deleteMany({
      where: {
        createdAt: {
          lt: sevenDaysAgo
        },
        action: {
          notIn: ['user.login', 'user.logout', 'instance.create', 'instance.delete']
        }
      }
    });

    logger.info('Cleaned up old data', {
      deletedSessions: deletedSessions.count,
      deletedLogs: deletedLogs.count,
      deletedAuditLogs: deletedAuditLogs.count
    });
  }

  /**
   * Update database statistics
   */
  private async updateStatistics() {
    try {
      await this.prisma.$executeRaw`UPDATE pg_stat_user_tables SET n_tup_ins = 0, n_tup_upd = 0, n_tup_del = 0`;
      logger.debug('Updated database statistics');
    } catch (error) {
      logger.warn('Failed to update database statistics', error);
    }
  }

  /**
   * Get default quota limit based on type
   */
  private getDefaultQuotaLimit(quotaType: string): number {
    const limits: Record<string, number> = {
      'MESSAGES_HOURLY': 100,
      'MESSAGES_DAILY': 1000,
      'MESSAGES_MONTHLY': 10000,
      'INSTANCES': 1,
      'BOTS': 2,
      'API_CALLS': 500
    };

    return limits[quotaType] || 100;
  }

  /**
   * Calculate reset time based on period
   */
  private calculateResetTime(period: string): Date {
    const now = new Date();
    
    if (period.length === 13) { // Hourly: YYYY-MM-DD-HH
      return new Date(now.getTime() + 60 * 60 * 1000); // +1 hour
    } else if (period.length === 10) { // Daily: YYYY-MM-DD
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(0, 0, 0, 0);
      return tomorrow;
    } else if (period.length === 7) { // Monthly: YYYY-MM
      const nextMonth = new Date(now);
      nextMonth.setMonth(nextMonth.getMonth() + 1);
      nextMonth.setDate(1);
      nextMonth.setHours(0, 0, 0, 0);
      return nextMonth;
    }

    return new Date(now.getTime() + 60 * 60 * 1000); // Default: +1 hour
  }

  /**
   * Get database health metrics
   */
  async getHealthMetrics() {
    try {
      const [connectionMetrics, tableStats, cacheStats] = await Promise.all([
        this.getConnectionMetrics(),
        this.getTableStatistics(),
        this.getCacheStatistics()
      ]);

      return {
        connections: connectionMetrics,
        tables: tableStats,
        cache: cacheStats,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      logger.error('Failed to get database health metrics', error);
      throw error;
    }
  }

  /**
   * Get table statistics
   */
  private async getTableStatistics() {
    const result = await this.prisma.$queryRaw`
      SELECT 
        schemaname,
        tablename,
        n_tup_ins as inserts,
        n_tup_upd as updates,
        n_tup_del as deletes,
        n_live_tup as live_tuples,
        n_dead_tup as dead_tuples,
        last_vacuum,
        last_autovacuum,
        last_analyze,
        last_autoanalyze
      FROM pg_stat_user_tables
      ORDER BY n_live_tup DESC
    ` as any[];

    return result;
  }

  /**
   * Get cache statistics
   */
  private getCacheStatistics() {
    return {
      memoryCache: {
        size: this.queryCache.size,
        keys: Array.from(this.queryCache.keys())
      }
    };
  }
}

// Export singleton instance
export const dbOptimizer = new DatabaseOptimizer(new PrismaClient());

// Schedule maintenance tasks
if (process.env.NODE_ENV === 'production') {
  // Run maintenance daily at 2 AM
  setInterval(async () => {
    const now = new Date();
    if (now.getHours() === 2 && now.getMinutes() === 0) {
      try {
        await dbOptimizer.performMaintenance();
      } catch (error) {
        logger.error('Scheduled maintenance failed', error);
      }
    }
  }, 60000); // Check every minute
}

export default dbOptimizer;