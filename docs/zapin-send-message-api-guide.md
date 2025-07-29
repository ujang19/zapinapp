# Zapin Send Message API - Complete Implementation Guide

## Table of Contents

1. [System Architecture Overview](#system-architecture-overview)
2. [Send-Text Endpoint Usage](#send-text-endpoint-usage)
3. [Fastify Proxy Flow](#fastify-proxy-flow)
4. [Authentication System](#authentication-system)
5. [Quota Management](#quota-management)
6. [Error Handling](#error-handling)
7. [Monitoring & Observability](#monitoring--observability)
8. [Deployment & Configuration](#deployment--configuration)
9. [Testing Strategies](#testing-strategies)
10. [Code Examples](#code-examples)

---

## System Architecture Overview

Zapin adalah sistem multi-tenant SaaS API gateway untuk WhatsApp yang berperan sebagai proxy layer di atas Evolution API v2.2.x. Sistem ini menyediakan:

- **Isolasi tenant** dengan pemisahan data per pengguna
- **API proxy** tanpa mengubah format Evolution API
- **Sistem quota dan rate limiting** per tenant
- **Autentikasi JWT + API Key**
- **Feature flags** berbasis paket langganan

### Architecture Flow Diagram

```mermaid
graph TD
    A[Client Application] -->|POST /v1/messages/send-text| B[Zapin Proxy]
    B --> C{Authentication}
    C -->|JWT| D[Validate JWT Token]
    C -->|API Key| E[Validate API Key]
    D --> F[Extract Tenant Info]
    E --> F
    F --> G[Resolve Instance & Evolution Key]
    G --> H{Quota Check}
    H -->|Exceeded| I[Return 429 Rate Limited]
    H -->|Allowed| J[Transform Request]
    J --> K[Proxy to Evolution API]
    K -->|POST /v2/message/sendText/{instance}| L[Evolution API Core]
    L --> M[WhatsApp Message Sent]
    M --> N[Log Usage & Update Quota]
    N --> O[Return Response to Client]
    
    style B fill:#e1f5fe
    style L fill:#f3e5f5
    style M fill:#e8f5e8
```

---

## Send-Text Endpoint Usage

### Endpoint Details

**URL:** `POST /v1/messages/send-text`  
**Evolution API Target:** `POST https://core.zapin.tech/v2/message/sendText/{instance}`

### Request Format

```json
{
  "instanceId": "uuid-of-instance",
  "recipient": "+628123456789",
  "text": "Hello World",
  "delay": 1200,
  "quoted": {
    "key": {
      "id": "message-id-to-quote"
    }
  },
  "mentionsEveryOne": false,
  "mentioned": ["+628123456789"]
}
```

### Response Format

```json
{
  "success": true,
  "data": {
    "messageId": "ABCD1234...",
    "timestamp": 1694012345
  },
  "quota": {
    "hourly": { "remaining": 99 },
    "daily": { "remaining": 999 },
    "monthly": { "remaining": 9999 }
  }
}
```

### Headers

**Authentication (choose one):**
- `apikey: <API_KEY>` (Evolution API style - recommended)
- `Authorization: Bearer <JWT_TOKEN>` atau `Authorization: Bearer <API_KEY>` (legacy format)

**Required:**
- `Content-Type: application/json`

### Curl Examples

**Using apikey header (Evolution API style - recommended):**
```bash
curl -X POST "https://api.zapin.tech/v1/messages/send-text" \
  -H "apikey: your-api-key-here" \
  -H "Content-Type: application/json" \
  -d '{
    "instanceId": "your-instance-uuid",
    "recipient": "+628123456789",
    "text": "Hello from Zapin!",
    "delay": 1000
  }'
```

**Using Authorization Bearer header (legacy format):**
```bash
curl -X POST "https://api.zapin.tech/v1/messages/send-text" \
  -H "Authorization: Bearer your-api-key-here" \
  -H "Content-Type: application/json" \
  -d '{
    "instanceId": "your-instance-uuid",
    "recipient": "+628123456789",
    "text": "Hello from Zapin!",
    "delay": 1000
  }'
```

---

## Fastify Proxy Flow

Zapin proxy mengimplementasikan flow komprehensif menggunakan Fastify dengan 7 langkah utama:

### 1. Authentication & Authorization

```typescript
// Validasi JWT atau API Key
const authResult = await authenticateRequest(req);
if (!authResult.success) {
  return reply.code(401).send({ error: 'Unauthorized' });
}
```

### 2. Tenant & Instance Resolution

```typescript
// Resolve tenant dan instance
const tenant = authResult.tenant;
const instanceId = req.body.instanceId;
const evolutionKey = await getEvolutionKey(tenant.id, instanceId);
```

### 3. Quota Validation

```typescript
// Cek quota sebelum mengirim
const quotaCheck = await validateQuota(tenant.id, instanceId);
if (!quotaCheck.allowed) {
  return reply.code(429).send({ 
    error: 'Quota exceeded',
    resetTime: quotaCheck.resetTime
  });
}
```

### 4. Request Transformation

```typescript
// Transform request untuk Evolution API
const evolutionUrl = `https://core.zapin.tech/v2${req.url.slice(3)}`;
const transformedBody = transformRequestBody(req.body, tenant);
```

### 5. Proxy to Evolution API

```typescript
// Kirim request ke Evolution API
const result = await fetch(evolutionUrl, {
  method: req.method,
  headers: {
    'Authorization': `apikey ${evolutionKey}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify(transformedBody),
});
```

### 6. Usage Logging & Quota Update

```typescript
// Log penggunaan dan update quota
await logUsage(tenant.id, instanceId, req.url, req.method);
await updateQuotaUsage(tenant.id, instanceId);
```

### 7. Response with Rate Limit Headers

```typescript
// Return response dengan rate limit headers
reply
  .code(result.status)
  .headers({
    'X-RateLimit-Limit': quotaCheck.limit,
    'X-RateLimit-Remaining': quotaCheck.remaining - 1,
    'X-RateLimit-Reset': quotaCheck.resetTime
  })
  .send(data);
```

---

## Authentication System

Zapin mendukung dual authentication system:

### JWT Authentication (Dashboard Users)

```typescript
async function validateJWT(token: string) {
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      include: { tenant: true }
    });
    
    return {
      success: true,
      user,
      tenant: user.tenant,
      authType: 'jwt'
    };
  } catch (error) {
    return { success: false, error: 'Invalid JWT' };
  }
}
```

### API Key Authentication (Public API)

```typescript
async function validateAPIKey(apiKey: string) {
  const key = await prisma.apiKey.findUnique({
    where: { 
      key: apiKey,
      isActive: true,
      expiresAt: { gt: new Date() }
    },
    include: { tenant: true }
  });

  if (!key) {
    return { success: false, error: 'Invalid API key' };
  }

  // Check scope permissions
  const hasPermission = key.scopes.includes('messages:send') || 
                       key.scopes.includes('*');
  
  if (!hasPermission) {
    return { success: false, error: 'Insufficient permissions' };
  }

  return {
    success: true,
    tenant: key.tenant,
    apiKey: key,
    authType: 'api_key'
  };
}
```

### Authentication Middleware

```typescript
async function authenticateRequest(req: FastifyRequest) {
  const authHeader = req.headers.authorization;
  
  if (!authHeader?.startsWith('Bearer ')) {
    return { success: false, error: 'Missing authorization header' };
  }

  const token = authHeader.slice(7);
  
  // Try JWT first, fallback to API Key
  const jwtResult = await validateJWT(token);
  if (jwtResult.success) {
    return jwtResult;
  }
  
  return await validateAPIKey(token);
}
```

---

## Quota Management

Sistem quota menggunakan Redis untuk real-time tracking dengan multiple time periods:

### Quota Configuration

```typescript
const PLAN_QUOTAS: Record<string, QuotaConfig> = {
  basic: {
    messagesPerHour: 100,
    messagesPerDay: 1000,
    messagesPerMonth: 10000,
    instancesLimit: 1
  },
  pro: {
    messagesPerHour: 1000,
    messagesPerDay: 10000,
    messagesPerMonth: 100000,
    instancesLimit: 5
  },
  enterprise: {
    messagesPerHour: 10000,
    messagesPerDay: 100000,
    messagesPerMonth: 1000000,
    instancesLimit: 50
  }
};
```

### Quota Manager Implementation

```typescript
export class QuotaManager {
  private hourlyLimiter: RateLimiterRedis;
  private dailyLimiter: RateLimiterRedis;
  private monthlyLimiter: RateLimiterRedis;

  constructor() {
    this.hourlyLimiter = new RateLimiterRedis({
      storeClient: redis,
      keyPrefix: 'quota_hour',
      points: 1,
      duration: 3600, // 1 hour
    });

    this.dailyLimiter = new RateLimiterRedis({
      storeClient: redis,
      keyPrefix: 'quota_day',
      points: 1,
      duration: 86400, // 24 hours
    });

    this.monthlyLimiter = new RateLimiterRedis({
      storeClient: redis,
      keyPrefix: 'quota_month',
      points: 1,
      duration: 2592000, // 30 days
    });
  }

  async checkQuota(tenantId: string, plan: string) {
    const config = PLAN_QUOTAS[plan] || PLAN_QUOTAS.basic;
    const key = tenantId;

    try {
      const [hourlyRes, dailyRes, monthlyRes] = await Promise.all([
        this.checkLimit(this.hourlyLimiter, key, config.messagesPerHour),
        this.checkLimit(this.dailyLimiter, key, config.messagesPerDay),
        this.checkLimit(this.monthlyLimiter, key, config.messagesPerMonth)
      ]);

      const limits = [hourlyRes, dailyRes, monthlyRes];
      const mostRestrictive = limits.reduce((min, current) => 
        current.remaining < min.remaining ? current : min
      );

      return {
        allowed: mostRestrictive.allowed,
        limits: {
          hourly: hourlyRes,
          daily: dailyRes,
          monthly: monthlyRes
        },
        mostRestrictive: mostRestrictive.period
      };
    } catch (error) {
      return {
        allowed: false,
        error: 'Quota check failed'
      };
    }
  }
}
```

---

## Error Handling

### Error Codes & Custom Errors

```typescript
export enum ErrorCodes {
  // Authentication Errors
  UNAUTHORIZED = 'UNAUTHORIZED',
  INVALID_API_KEY = 'INVALID_API_KEY',
  API_KEY_EXPIRED = 'API_KEY_EXPIRED',
  
  // Quota Errors
  QUOTA_EXCEEDED = 'QUOTA_EXCEEDED',
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  
  // Instance Errors
  INSTANCE_NOT_FOUND = 'INSTANCE_NOT_FOUND',
  INSTANCE_NOT_CONNECTED = 'INSTANCE_NOT_CONNECTED',
  
  // Message Errors
  INVALID_RECIPIENT = 'INVALID_RECIPIENT',
  MESSAGE_TOO_LONG = 'MESSAGE_TOO_LONG',
  
  // Evolution API Errors
  EVOLUTION_API_ERROR = 'EVOLUTION_API_ERROR',
  EVOLUTION_API_TIMEOUT = 'EVOLUTION_API_TIMEOUT',
  
  // System Errors
  INTERNAL_ERROR = 'INTERNAL_ERROR'
}

export class ZapinError extends Error {
  constructor(
    public code: ErrorCodes,
    public message: string,
    public statusCode: number = 500,
    public details?: any
  ) {
    super(message);
    this.name = 'ZapinError';
  }
}
```

### Error Handler

```typescript
export class ErrorHandler {
  static handle(error: any, reply: any) {
    console.error('Error occurred:', {
      error: error.message,
      stack: error.stack,
      code: error.code
    });

    if (error instanceof ZapinError) {
      return reply.code(error.statusCode).send({
        success: false,
        error: {
          code: error.code,
          message: error.message,
          details: error.details
        }
      });
    }

    // Default internal server error
    return reply.code(500).send({
      success: false,
      error: {
        code: ErrorCodes.INTERNAL_ERROR,
        message: 'An unexpected error occurred'
      }
    });
  }
}
```

### Circuit Breaker Pattern

```typescript
export class CircuitBreaker {
  private failures: number = 0;
  private state: 'CLOSED' | 'OPEN' | 'HALF_OPEN' = 'CLOSED';

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (this.state === 'OPEN') {
      throw new ZapinError(
        ErrorCodes.EVOLUTION_API_UNAVAILABLE,
        'Evolution API is temporarily unavailable',
        503
      );
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
}
```

---

## Monitoring & Observability

### Structured Logging

```typescript
import winston from 'winston';

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.Http({
      host: process.env.LOG_HOST,
      path: process.env.LOG_PATH,
      headers: {
        'Authorization': `Bearer ${process.env.LOG_TOKEN}`
      }
    })
  ]
});
```

### Prometheus Metrics

```typescript
import client from 'prom-client';

export const httpRequestDuration = new client.Histogram({
  name: 'zapin_http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code', 'tenant_id'],
  buckets: [0.1, 0.3, 0.5, 0.7, 1, 3, 5, 7, 10]
});

export const messagesSentTotal = new client.Counter({
  name: 'zapin_messages_sent_total',
  help: 'Total number of messages sent',
  labelNames: ['tenant_id', 'instance_id', 'message_type', 'status']
});

export const quotaUsage = new client.Gauge({
  name: 'zapin_quota_usage',
  help: 'Current quota usage by tenant',
  labelNames: ['tenant_id', 'quota_type']
});
```

### Health Check System

```typescript
export class HealthCheckService {
  async runAll() {
    const results = {
      database: await this.checkDatabase(),
      redis: await this.checkRedis(),
      evolutionApi: await this.checkEvolutionApi()
    };

    const isHealthy = Object.values(results)
      .every(check => check.status === 'healthy');

    return {
      status: isHealthy ? 'healthy' : 'unhealthy',
      timestamp: new Date().toISOString(),
      checks: results
    };
  }

  private async checkDatabase() {
    try {
      await prisma.$queryRaw`SELECT 1`;
      return { status: 'healthy' };
    } catch (error) {
      return { status: 'unhealthy', error: error.message };
    }
  }
}
```

---

## Deployment & Configuration

### Environment Configuration

```typescript
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'staging', 'production']),
  PORT: z.string().transform(Number).default(3000),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  EVOLUTION_API_BASE_URL: z.string().url(),
  JWT_SECRET: z.string().min(32),
  EVOLUTION_GLOBAL_API_KEY: z.string(),
  SENTRY_DSN: z.string().url().optional(),
});

export const env = envSchema.parse(process.env);
```

### Docker Configuration

```dockerfile
FROM node:18-alpine AS base

FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --only=production

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
RUN npm run build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json

EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1

CMD ["node", "dist/index.js"]
```

### Kubernetes Deployment

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: zapin-proxy
spec:
  replicas: 3
  selector:
    matchLabels:
      app: zapin-proxy
  template:
    metadata:
      labels:
        app: zapin-proxy
    spec:
      containers:
      - name: zapin-proxy
        image: zapin/proxy:latest
        ports:
        - containerPort: 3000
        resources:
          requests:
            memory: "256Mi"
            cpu: "250m"
          limits:
            memory: "512Mi"
            cpu: "500m"
        livenessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 30
        readinessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 5
```

---

## Testing Strategies

### Unit Tests

```typescript
describe('QuotaManager', () => {
  let quotaManager: QuotaManager;

  beforeEach(() => {
    quotaManager = new QuotaManager();
  });

  it('should allow requests within quota limits', async () => {
    const result = await quotaManager.checkQuota('tenant-1', 'basic');
    
    expect(result.allowed).toBe(true);
    expect(result.limits.hourly.remaining).toBe(100);
  });

  it('should deny requests when quota exceeded', async () => {
    const tenantId = 'tenant-2';
    
    // Consume all hourly quota
    for (let i = 0; i < 100; i++) {
      await quotaManager.consumeQuota(tenantId, 'basic');
    }
    
    const result = await quotaManager.checkQuota(tenantId, 'basic');
    expect(result.allowed).toBe(false);
  });
});
```

### Integration Tests

```typescript
describe('Message Routes Integration', () => {
  let app: FastifyInstance;
  let authToken: string;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
  });

  it('should send text message successfully', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/messages/send-text',
      headers: {
        authorization: `Bearer ${authToken}`,
        'content-type': 'application/json'
      },
      payload: {
        instanceId: 'test-instance',
        recipient: '+628123456789',
        text: 'Hello World'
      }
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
  });
});
```

---

## Code Examples

### Complete Client Usage Example

```typescript
// Client-side usage
class ZapinClient {
  constructor(private apiKey: string, private baseUrl: string = 'https://api.zapin.tech') {}

  async sendTextMessage(params: {
    instanceId: string;
    recipient: string;
    text: string;
    delay?: number;
  }) {
    const response = await fetch(`${this.baseUrl}/v1/messages/send-text`, {
      method: 'POST',
      headers: {
        'apikey': this.apiKey,  // Evolution API style
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(params)
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Failed to send message: ${error.error.message}`);
    }

    const result = await response.json();
    return result.data;
  }
}

// Usage
const client = new ZapinClient('your-api-key');

try {
  const result = await client.sendTextMessage({
    instanceId: 'your-instance-uuid',
    recipient: '+628123456789',
    text: 'Hello from Zapin!',
    delay: 1000
  });
  
  console.log('Message sent:', result.messageId);
} catch (error) {
  console.error('Failed to send message:', error.message);
}
```

### Complete Server Implementation

```typescript
// Main application setup
import Fastify from 'fastify';
import { authMiddleware } from './middleware/auth';
import { metricsMiddleware } from './lib/metrics';
import { messageRoutes } from './routes/messages';

export async function buildApp() {
  const app = Fastify({
    logger: true,
    requestIdHeader: 'x-request-id'
  });

  // Register middleware
  app.addHook('preHandler', authMiddleware);
  app.addHook('preHandler', metricsMiddleware);

  // Register routes
  app.register(messageRoutes, { prefix: '/v1' });

  // Health check
  app.get('/health', async () => {
    return { status: 'healthy', timestamp: new Date().toISOString() };
  });

  // Metrics endpoint
  app.get('/metrics', async (request, reply) => {
    reply.type('text/plain');
    return register.metrics();
  });

  return app;
}

// Start server
async function start() {
  try {
    const app = await buildApp();
    await app.listen({ port: 3000, host: '0.0.0.0' });
    console.log('Zapin Proxy server started on port 3000');
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

start();
```

---

## Troubleshooting Common Issues

### 1. QUOTA_EXCEEDED Error
**Penyebab:** User telah melebihi batas quota plan mereka  
**Solusi:** Upgrade plan atau tunggu quota reset  
**Pencegahan:** Implementasi quota warning pada 80% usage

### 2. INSTANCE_NOT_CONNECTED Error
**Penyebab:** WhatsApp instance terputus  
**Solusi:** Reconnect instance via QR code scan  
**Pencegahan:** Monitor connection status via webhooks

### 3. EVOLUTION_API_TIMEOUT Error
**Penyebab:** Evolution API lambat atau tidak responsif  
**Solusi:** Retry dengan exponential backoff  
**Pencegahan:** Implementasi circuit breaker pattern

### 4. INVALID_RECIPIENT Error
**Penyebab:** Format nomor telepon salah atau tidak terdaftar di WhatsApp  
**Solusi:** Validasi nomor telepon sebelum mengirim  
**Pencegahan:** Gunakan WhatsApp number validation endpoint

---

## Security Best Practices

1. **API Key Management**
   - Rotate API keys secara berkala
   - Gunakan scope yang minimal untuk setiap key
   - Monitor penggunaan API key yang tidak biasa

2. **Rate Limiting**
   - Implementasi multiple layer rate limiting
   - Monitor dan alert pada spike traffic
   - Gunakan distributed rate limiting untuk high availability

3. **Data Protection**
   - Encrypt sensitive data at rest
   - Implement proper access controls
   - Regular security audits dan penetration testing

4. **Monitoring & Alerting**
   - Real-time monitoring untuk semua critical metrics
   - Alert pada error rate tinggi atau quota abuse
   - Log semua security events untuk audit trail

---

## Performance Optimization

1. **Database Optimization**
   - Proper indexing pada frequently queried fields
   - Connection pooling untuk database connections
   - Query optimization dan monitoring

2. **Redis Optimization**
   - Proper key expiration untuk memory management
   - Redis clustering untuk high availability
   - Monitor Redis performance metrics

3. **API Performance**
   - Response caching untuk frequently accessed data
   - Async processing untuk non-critical operations
   - Load balancing across multiple instances

---

## Conclusion

Dokumentasi ini memberikan panduan lengkap untuk implementasi Zapin Send Message API yang production-ready. Sistem ini dirancang untuk:

- **Scalability**: Mendukung ribuan tenant dengan millions of messages
- **Reliability**: High availability dengan proper error handling
- **Security**: Multi-layer security dengan proper authentication
- **Observability**: Comprehensive monitoring dan logging
- **Maintainability**: Clean code architecture dengan extensive testing

Untuk pertanyaan lebih lanjut atau support, silakan hubungi tim development Zapin.