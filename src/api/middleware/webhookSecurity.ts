import { FastifyRequest, FastifyReply } from 'fastify';
import { ZapinError, ErrorCodes } from '../../types';
import { redis } from '../../lib/redis';
import crypto from 'crypto';

// IP whitelist for webhook sources
const ALLOWED_IPS = [
  '127.0.0.1',
  '::1',
  // Add Evolution API server IPs here
  // '192.168.1.100',
  // '10.0.0.50'
];

// Rate limiting configuration for webhooks
const WEBHOOK_RATE_LIMITS = {
  perIP: {
    max: 1000, // requests per window
    window: 60000, // 1 minute
  },
  perInstance: {
    max: 500, // requests per window per instance
    window: 60000, // 1 minute
  },
  global: {
    max: 5000, // total requests per window
    window: 60000, // 1 minute
  }
};

/**
 * Webhook security middleware
 */
export async function webhookSecurityMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
) {
  try {
    // Skip security checks for non-webhook endpoints
    if (!request.url.includes('/webhook/')) {
      return;
    }

    // 1. IP Whitelist Check (if configured)
    if (process.env.WEBHOOK_IP_WHITELIST_ENABLED === 'true') {
      await checkIPWhitelist(request);
    }

    // 2. Rate Limiting
    await checkRateLimits(request);

    // 3. Request Size Validation
    await validateRequestSize(request);

    // 4. Content Type Validation
    validateContentType(request);

    // 5. User Agent Validation
    validateUserAgent(request);

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
        message: 'Security validation failed'
      }
    });
  }
}

/**
 * Check if request IP is in whitelist
 */
async function checkIPWhitelist(request: FastifyRequest): Promise<void> {
  const clientIP = getClientIP(request);
  
  // Get dynamic whitelist from Redis
  const dynamicWhitelist = await redis.smembers('webhook:ip_whitelist');
  const allowedIPs = [...ALLOWED_IPS, ...dynamicWhitelist];
  
  if (!allowedIPs.includes(clientIP)) {
    // Log suspicious request
    await logSecurityEvent('IP_NOT_WHITELISTED', {
      ip: clientIP,
      userAgent: request.headers['user-agent'],
      url: request.url,
      timestamp: new Date().toISOString()
    });

    throw new ZapinError(
      ErrorCodes.UNAUTHORIZED,
      'IP address not authorized for webhook access',
      403
    );
  }
}

/**
 * Check rate limits for webhook requests
 */
async function checkRateLimits(request: FastifyRequest): Promise<void> {
  const clientIP = getClientIP(request);
  const now = Date.now();
  const windowStart = now - WEBHOOK_RATE_LIMITS.perIP.window;

  // Check per-IP rate limit
  const ipKey = `webhook:ratelimit:ip:${clientIP}`;
  const ipRequests = await redis.zcount(ipKey, windowStart, now);
  
  if (ipRequests >= WEBHOOK_RATE_LIMITS.perIP.max) {
    await logSecurityEvent('RATE_LIMIT_EXCEEDED_IP', {
      ip: clientIP,
      requests: ipRequests,
      limit: WEBHOOK_RATE_LIMITS.perIP.max,
      timestamp: new Date().toISOString()
    });

    throw new ZapinError(
      ErrorCodes.RATE_LIMIT_EXCEEDED,
      'Rate limit exceeded for IP address',
      429
    );
  }

  // Record this request
  await redis.zadd(ipKey, now, `${now}-${Math.random()}`);
  await redis.expire(ipKey, Math.ceil(WEBHOOK_RATE_LIMITS.perIP.window / 1000));

  // Clean old entries
  await redis.zremrangebyscore(ipKey, 0, windowStart);

  // Check per-instance rate limit (if instance is identifiable)
  const payload = request.body as any;
  if (payload?.instance) {
    const instanceKey = `webhook:ratelimit:instance:${payload.instance}`;
    const instanceRequests = await redis.zcount(instanceKey, windowStart, now);
    
    if (instanceRequests >= WEBHOOK_RATE_LIMITS.perInstance.max) {
      await logSecurityEvent('RATE_LIMIT_EXCEEDED_INSTANCE', {
        instance: payload.instance,
        ip: clientIP,
        requests: instanceRequests,
        limit: WEBHOOK_RATE_LIMITS.perInstance.max,
        timestamp: new Date().toISOString()
      });

      throw new ZapinError(
        ErrorCodes.RATE_LIMIT_EXCEEDED,
        'Rate limit exceeded for instance',
        429
      );
    }

    await redis.zadd(instanceKey, now, `${now}-${Math.random()}`);
    await redis.expire(instanceKey, Math.ceil(WEBHOOK_RATE_LIMITS.perInstance.window / 1000));
    await redis.zremrangebyscore(instanceKey, 0, windowStart);
  }

  // Check global rate limit
  const globalKey = 'webhook:ratelimit:global';
  const globalRequests = await redis.zcount(globalKey, windowStart, now);
  
  if (globalRequests >= WEBHOOK_RATE_LIMITS.global.max) {
    await logSecurityEvent('RATE_LIMIT_EXCEEDED_GLOBAL', {
      ip: clientIP,
      requests: globalRequests,
      limit: WEBHOOK_RATE_LIMITS.global.max,
      timestamp: new Date().toISOString()
    });

    throw new ZapinError(
      ErrorCodes.RATE_LIMIT_EXCEEDED,
      'Global rate limit exceeded',
      429
    );
  }

  await redis.zadd(globalKey, now, `${now}-${Math.random()}`);
  await redis.expire(globalKey, Math.ceil(WEBHOOK_RATE_LIMITS.global.window / 1000));
  await redis.zremrangebyscore(globalKey, 0, windowStart);
}

/**
 * Validate request size
 */
async function validateRequestSize(request: FastifyRequest): Promise<void> {
  const maxSize = parseInt(process.env.WEBHOOK_MAX_PAYLOAD_SIZE || '1048576'); // 1MB default
  const contentLength = parseInt(request.headers['content-length'] || '0');
  
  if (contentLength > maxSize) {
    await logSecurityEvent('PAYLOAD_TOO_LARGE', {
      ip: getClientIP(request),
      contentLength,
      maxSize,
      timestamp: new Date().toISOString()
    });

    throw new ZapinError(
      ErrorCodes.VALIDATION_ERROR,
      'Payload too large',
      413
    );
  }
}

/**
 * Validate content type
 */
function validateContentType(request: FastifyRequest): void {
  const contentType = request.headers['content-type'];
  
  if (!contentType || !contentType.includes('application/json')) {
    throw new ZapinError(
      ErrorCodes.VALIDATION_ERROR,
      'Invalid content type. Expected application/json',
      400
    );
  }
}

/**
 * Validate user agent
 */
function validateUserAgent(request: FastifyRequest): void {
  const userAgent = request.headers['user-agent'];
  
  if (!userAgent) {
    throw new ZapinError(
      ErrorCodes.VALIDATION_ERROR,
      'User-Agent header is required',
      400
    );
  }

  // Block known malicious user agents
  const blockedUserAgents = [
    'curl', // Block basic curl requests
    'wget',
    'python-requests',
    'postman'
  ];

  const isBlocked = blockedUserAgents.some(blocked => 
    userAgent.toLowerCase().includes(blocked.toLowerCase())
  );

  if (isBlocked && process.env.WEBHOOK_BLOCK_GENERIC_CLIENTS === 'true') {
    throw new ZapinError(
      ErrorCodes.UNAUTHORIZED,
      'User agent not allowed',
      403
    );
  }
}

/**
 * Get client IP address
 */
function getClientIP(request: FastifyRequest): string {
  // Check for forwarded IP headers (for reverse proxy setups)
  const forwarded = request.headers['x-forwarded-for'] as string;
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }

  const realIP = request.headers['x-real-ip'] as string;
  if (realIP) {
    return realIP;
  }

  return request.ip || '127.0.0.1';
}

/**
 * Log security events
 */
async function logSecurityEvent(eventType: string, details: any): Promise<void> {
  const event = {
    type: eventType,
    details,
    timestamp: new Date().toISOString()
  };

  // Store in Redis with expiration
  const key = `security:events:${Date.now()}:${Math.random()}`;
  await redis.setex(key, 86400 * 7, JSON.stringify(event)); // 7 days retention

  // Also publish to monitoring channel
  await redis.publish('security:webhook:events', JSON.stringify(event));

  console.warn(`Webhook security event: ${eventType}`, details);
}

/**
 * Verify webhook signature
 */
export function verifyWebhookSignature(
  payload: string,
  signature: string,
  secret: string
): boolean {
  if (!signature || !secret) {
    return false;
  }

  // Support different signature formats
  let expectedSignature: string;
  
  if (signature.startsWith('sha256=')) {
    // GitHub-style signature
    expectedSignature = 'sha256=' + crypto
      .createHmac('sha256', secret)
      .update(payload)
      .digest('hex');
  } else {
    // Simple HMAC signature
    expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(payload)
      .digest('hex');
  }

  // Use timing-safe comparison
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}

/**
 * Webhook payload sanitization
 */
export function sanitizeWebhookPayload(payload: any): any {
  if (!payload || typeof payload !== 'object') {
    return payload;
  }

  // Remove potentially dangerous fields
  const sanitized = { ...payload };
  
  // Remove script tags and HTML from string fields
  const sanitizeString = (str: string): string => {
    if (typeof str !== 'string') return str;
    
    return str
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/<[^>]*>/g, '')
      .trim();
  };

  // Recursively sanitize object
  const sanitizeObject = (obj: any): any => {
    if (Array.isArray(obj)) {
      return obj.map(sanitizeObject);
    }
    
    if (obj && typeof obj === 'object') {
      const sanitizedObj: any = {};
      for (const [key, value] of Object.entries(obj)) {
        if (typeof value === 'string') {
          sanitizedObj[key] = sanitizeString(value);
        } else if (typeof value === 'object') {
          sanitizedObj[key] = sanitizeObject(value);
        } else {
          sanitizedObj[key] = value;
        }
      }
      return sanitizedObj;
    }
    
    return obj;
  };

  return sanitizeObject(sanitized);
}

/**
 * Get webhook security metrics
 */
export async function getWebhookSecurityMetrics(period: '1h' | '24h' | '7d' = '24h'): Promise<any> {
  const now = Date.now();
  let windowStart: number;

  switch (period) {
    case '1h':
      windowStart = now - 60 * 60 * 1000;
      break;
    case '24h':
      windowStart = now - 24 * 60 * 60 * 1000;
      break;
    case '7d':
      windowStart = now - 7 * 24 * 60 * 60 * 1000;
      break;
  }

  // Get security events
  const eventKeys = await redis.keys('security:events:*');
  const events: any[] = [];
  
  for (const key of eventKeys) {
    const eventData = await redis.get(key);
    if (eventData) {
      const event = JSON.parse(eventData);
      const eventTime = new Date(event.timestamp).getTime();
      
      if (eventTime >= windowStart) {
        events.push(event);
      }
    }
  }

  // Aggregate metrics
  const metrics = {
    totalEvents: events.length,
    eventsByType: {} as Record<string, number>,
    topIPs: {} as Record<string, number>,
    period
  };

  events.forEach((event: any) => {
    // Count by type
    metrics.eventsByType[event.type] = (metrics.eventsByType[event.type] || 0) + 1;
    
    // Count by IP
    if (event.details?.ip) {
      metrics.topIPs[event.details.ip] = (metrics.topIPs[event.details.ip] || 0) + 1;
    }
  });

  return metrics;
}

/**
 * Add IP to whitelist
 */
export async function addIPToWhitelist(ip: string, reason?: string): Promise<void> {
  await redis.sadd('webhook:ip_whitelist', ip);
  
  // Log the addition
  await logSecurityEvent('IP_WHITELISTED', {
    ip,
    reason: reason || 'Manual addition',
    timestamp: new Date().toISOString()
  });
}

/**
 * Remove IP from whitelist
 */
export async function removeIPFromWhitelist(ip: string, reason?: string): Promise<void> {
  await redis.srem('webhook:ip_whitelist', ip);
  
  // Log the removal
  await logSecurityEvent('IP_REMOVED_FROM_WHITELIST', {
    ip,
    reason: reason || 'Manual removal',
    timestamp: new Date().toISOString()
  });
}

/**
 * Get current IP whitelist
 */
export async function getIPWhitelist(): Promise<string[]> {
  const dynamicIPs = await redis.smembers('webhook:ip_whitelist');
  return [...ALLOWED_IPS, ...dynamicIPs];
}