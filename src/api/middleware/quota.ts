import { FastifyRequest, FastifyReply } from 'fastify';
import { redis } from '../../lib/redis';
import { prisma } from '../../lib/prisma';
import { ZapinError, ErrorCodes, PLAN_CONFIGS, QuotaResult } from '../../types';

export async function quotaMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
) {
  try {
    if (!request.tenant) {
      throw new ZapinError(
        ErrorCodes.UNAUTHORIZED,
        'Tenant information required',
        401
      );
    }

    const quotaResult = await checkQuota(
      request.tenant.id,
      request.tenant.plan,
      request.url,
      request.method
    );

    if (!quotaResult.allowed) {
      const resetTime = quotaResult.limits[quotaResult.mostRestrictive].resetAt;
      
      return reply.code(429).send({
        success: false,
        error: {
          code: ErrorCodes.QUOTA_EXCEEDED,
          message: `Quota exceeded for ${quotaResult.mostRestrictive} limit`,
          details: {
            limit: quotaResult.limits[quotaResult.mostRestrictive].limit,
            remaining: quotaResult.limits[quotaResult.mostRestrictive].remaining,
            resetAt: resetTime.toISOString(),
            period: quotaResult.mostRestrictive
          }
        },
        quota: {
          hourly: {
            remaining: quotaResult.limits.hourly.remaining,
            limit: quotaResult.limits.hourly.limit,
            resetAt: quotaResult.limits.hourly.resetAt.toISOString()
          },
          daily: {
            remaining: quotaResult.limits.daily.remaining,
            limit: quotaResult.limits.daily.limit,
            resetAt: quotaResult.limits.daily.resetAt.toISOString()
          },
          monthly: {
            remaining: quotaResult.limits.monthly.remaining,
            limit: quotaResult.limits.monthly.limit,
            resetAt: quotaResult.limits.monthly.resetAt.toISOString()
          }
        }
      });
    }

    // Add quota info to response headers
    reply.header('X-RateLimit-Limit-Hourly', quotaResult.limits.hourly.limit);
    reply.header('X-RateLimit-Remaining-Hourly', quotaResult.limits.hourly.remaining);
    reply.header('X-RateLimit-Reset-Hourly', Math.floor(quotaResult.limits.hourly.resetAt.getTime() / 1000));
    
    reply.header('X-RateLimit-Limit-Daily', quotaResult.limits.daily.limit);
    reply.header('X-RateLimit-Remaining-Daily', quotaResult.limits.daily.remaining);
    reply.header('X-RateLimit-Reset-Daily', Math.floor(quotaResult.limits.daily.resetAt.getTime() / 1000));
    
    reply.header('X-RateLimit-Limit-Monthly', quotaResult.limits.monthly.limit);
    reply.header('X-RateLimit-Remaining-Monthly', quotaResult.limits.monthly.remaining);
    reply.header('X-RateLimit-Reset-Monthly', Math.floor(quotaResult.limits.monthly.resetAt.getTime() / 1000));

    // Store quota info in request for later consumption
    (request as any).quotaInfo = quotaResult;

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

    request.log.error('Quota middleware error:', error);
    return reply.code(500).send({
      success: false,
      error: {
        code: ErrorCodes.INTERNAL_ERROR,
        message: 'Quota check failed',
      },
    });
  }
}

async function checkQuota(
  tenantId: string,
  plan: string,
  endpoint: string,
  method: string
): Promise<QuotaResult> {
  const config = PLAN_CONFIGS[plan] || PLAN_CONFIGS.BASIC;
  const quotaType = getQuotaType(endpoint, method);
  const weight = getQuotaWeight(endpoint, method);

  const now = new Date();
  const hourKey = `quota:${tenantId}:hourly:${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}-${String(now.getHours()).padStart(2, '0')}`;
  const dayKey = `quota:${tenantId}:daily:${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const monthKey = `quota:${tenantId}:monthly:${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  try {
    const [hourlyUsed, dailyUsed, monthlyUsed] = await Promise.all([
      redis.get(hourKey).then(val => parseInt(val || '0')),
      redis.get(dayKey).then(val => parseInt(val || '0')),
      redis.get(monthKey).then(val => parseInt(val || '0'))
    ]);

    const hourlyLimit = getHourlyLimit(config, quotaType);
    const dailyLimit = getDailyLimit(config, quotaType);
    const monthlyLimit = getMonthlyLimit(config, quotaType);

    const hourlyRemaining = Math.max(0, hourlyLimit - hourlyUsed);
    const dailyRemaining = Math.max(0, dailyLimit - dailyUsed);
    const monthlyRemaining = Math.max(0, monthlyLimit - monthlyUsed);

    const hourlyResetAt = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours() + 1, 0, 0, 0);
    const dailyResetAt = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 0);
    const monthlyResetAt = new Date(now.getFullYear(), now.getMonth() + 1, 1, 0, 0, 0, 0);

    const limits = {
      hourly: { remaining: hourlyRemaining, limit: hourlyLimit, resetAt: hourlyResetAt },
      daily: { remaining: dailyRemaining, limit: dailyLimit, resetAt: dailyResetAt },
      monthly: { remaining: monthlyRemaining, limit: monthlyLimit, resetAt: monthlyResetAt }
    };

    // Check if any limit would be exceeded
    const wouldExceedHourly = hourlyUsed + weight > hourlyLimit;
    const wouldExceedDaily = dailyUsed + weight > dailyLimit;
    const wouldExceedMonthly = monthlyUsed + weight > monthlyLimit;

    let mostRestrictive: 'hourly' | 'daily' | 'monthly' = 'monthly';
    if (wouldExceedHourly) mostRestrictive = 'hourly';
    else if (wouldExceedDaily) mostRestrictive = 'daily';
    else if (wouldExceedMonthly) mostRestrictive = 'monthly';

    const allowed = !wouldExceedHourly && !wouldExceedDaily && !wouldExceedMonthly;

    return {
      allowed,
      limits,
      mostRestrictive
    };

  } catch (error) {
    throw new ZapinError(
      ErrorCodes.REDIS_ERROR,
      'Failed to check quota limits',
      500,
      { error: error instanceof Error ? error.message : 'Unknown error' }
    );
  }
}

export async function consumeQuota(
  tenantId: string,
  endpoint: string,
  method: string
): Promise<void> {
  const weight = getQuotaWeight(endpoint, method);
  const now = new Date();
  
  const hourKey = `quota:${tenantId}:hourly:${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}-${String(now.getHours()).padStart(2, '0')}`;
  const dayKey = `quota:${tenantId}:daily:${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const monthKey = `quota:${tenantId}:monthly:${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  const hourlyExpire = 3600; // 1 hour
  const dailyExpire = 86400; // 24 hours
  const monthlyExpire = 2592000; // 30 days

  try {
    const pipeline = redis.pipeline();
    
    pipeline.incrby(hourKey, weight);
    pipeline.expire(hourKey, hourlyExpire);
    
    pipeline.incrby(dayKey, weight);
    pipeline.expire(dayKey, dailyExpire);
    
    pipeline.incrby(monthKey, weight);
    pipeline.expire(monthKey, monthlyExpire);
    
    await pipeline.exec();
  } catch (error) {
    throw new ZapinError(
      ErrorCodes.REDIS_ERROR,
      'Failed to consume quota',
      500,
      { error: error instanceof Error ? error.message : 'Unknown error' }
    );
  }
}

function getQuotaType(endpoint: string, method: string): string {
  if (endpoint.includes('/message/send')) return 'messages';
  if (endpoint.includes('/instance/create')) return 'instances';
  if (endpoint.includes('/bot/create') || endpoint.includes('/typebot/create') || endpoint.includes('/openai/create')) return 'bots';
  return 'api_calls';
}

function getQuotaWeight(endpoint: string, method: string): number {
  // Message sending endpoints have higher weight
  if (endpoint.includes('/message/send')) {
    if (endpoint.includes('Media') || endpoint.includes('Audio') || endpoint.includes('Document')) {
      return 2; // Media messages cost more
    }
    return 1;
  }
  
  // Instance creation has higher weight
  if (endpoint.includes('/instance/create')) return 5;
  
  // Bot creation has higher weight
  if (endpoint.includes('/bot/create') || endpoint.includes('/typebot/create') || endpoint.includes('/openai/create')) {
    return 3;
  }
  
  // Default weight for API calls
  return 1;
}

function getHourlyLimit(config: any, quotaType: string): number {
  switch (quotaType) {
    case 'messages': return config.messagesPerHour;
    case 'api_calls': return config.apiCallsPerHour;
    default: return config.apiCallsPerHour;
  }
}

function getDailyLimit(config: any, quotaType: string): number {
  switch (quotaType) {
    case 'messages': return config.messagesPerDay;
    case 'api_calls': return config.apiCallsPerHour * 24;
    default: return config.apiCallsPerHour * 24;
  }
}

function getMonthlyLimit(config: any, quotaType: string): number {
  switch (quotaType) {
    case 'messages': return config.messagesPerMonth;
    case 'api_calls': return config.apiCallsPerHour * 24 * 30;
    default: return config.apiCallsPerHour * 24 * 30;
  }
}