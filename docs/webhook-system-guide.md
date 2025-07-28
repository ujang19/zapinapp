# Zapin Webhook System - Complete Implementation Guide

## Overview

The Zapin Webhook System is a comprehensive real-time event processing platform that handles webhooks from Evolution API, enabling real-time updates for instance status, message delivery, bot interactions, and other WhatsApp events. This system provides enterprise-grade features including security, analytics, monitoring, and real-time notifications.

## Architecture

### Core Components

1. **Webhook Service** (`src/services/webhookService.ts`)
   - Central webhook event processing logic
   - Event validation and authentication
   - Event routing and processing based on event types
   - Real-time database updates
   - WebSocket broadcasting for real-time UI updates

2. **Webhook API Routes** (`src/api/routes/webhooks.ts`)
   - Webhook endpoint for Evolution API callbacks
   - Event validation and security checks
   - Tenant-based event routing
   - Event logging and monitoring
   - Webhook configuration management

3. **Event Processors** (`src/services/eventProcessors/`)
   - **Message Processor**: Handles message events (MESSAGES_UPSERT, MESSAGES_UPDATE, SEND_MESSAGE)
   - **Connection Processor**: Manages connection events (CONNECTION_UPDATE, QRCODE_UPDATED)
   - **Bot Processor**: Processes bot events (TYPEBOT_START, TYPEBOT_CHANGE_STATUS, OPENAI_START, OPENAI_CHANGE_STATUS)

4. **Real-time Updates System** (`src/services/websocketService.ts`)
   - WebSocket integration for real-time dashboard updates
   - Event broadcasting to connected clients
   - Real-time instance status updates
   - Live message delivery status
   - Bot session monitoring

5. **Security Layer** (`src/api/middleware/webhookSecurity.ts`)
   - IP whitelist management
   - Rate limiting and DDoS protection
   - Request validation and sanitization
   - Signature verification
   - Security event logging

6. **Analytics Service** (`src/services/webhookAnalyticsService.ts`)
   - Comprehensive event analytics
   - Performance metrics tracking
   - Health status monitoring
   - Event timeline analysis

7. **Monitoring Service** (`src/services/webhookMonitoringService.ts`)
   - Real-time system monitoring
   - Alert management
   - Security monitoring
   - Performance tracking

## Supported Event Types

### Application Events
- `APPLICATION_STARTUP`: Evolution API startup notification
- `QRCODE_UPDATED`: QR code generation/update for instance connection
- `CONNECTION_UPDATE`: Instance connection state changes

### Message Events
- `MESSAGES_SET`: Initial message synchronization
- `MESSAGES_UPSERT`: New or updated messages
- `MESSAGES_UPDATE`: Message status updates (read receipts, delivery status)
- `MESSAGES_DELETE`: Message deletion events
- `SEND_MESSAGE`: Outbound message confirmation

### Contact Events
- `CONTACTS_SET`: Initial contact synchronization
- `CONTACTS_UPSERT`: New or updated contacts
- `CONTACTS_UPDATE`: Contact information updates
- `PRESENCE_UPDATE`: Contact presence status changes

### Chat Events
- `CHATS_SET`: Initial chat synchronization
- `CHATS_UPSERT`: New or updated chats
- `CHATS_UPDATE`: Chat information updates
- `CHATS_DELETE`: Chat deletion events

### Group Events
- `GROUPS_UPSERT`: New or updated groups
- `GROUP_UPDATE`: Group information updates
- `GROUP_PARTICIPANTS_UPDATE`: Group membership changes

### Bot Events
- `TYPEBOT_START`: Typebot session initiation
- `TYPEBOT_CHANGE_STATUS`: Typebot session status changes
- `OPENAI_START`: OpenAI bot session initiation
- `OPENAI_CHANGE_STATUS`: OpenAI bot session status changes

### Call Events
- `CALL`: Incoming/outgoing call events

## API Endpoints

### Webhook Reception
```
POST /api/webhook/evolution
```
Main endpoint for receiving webhooks from Evolution API.

**Headers:**
- `Content-Type: application/json`
- `User-Agent: Evolution-API/1.0` (or similar)
- `X-Evolution-Signature: <signature>` (optional, for signature verification)

**Request Body:**
```json
{
  "event": "MESSAGES_UPSERT",
  "instance": "instance-name",
  "data": {
    "key": {
      "remoteJid": "5511999999999@s.whatsapp.net",
      "fromMe": false,
      "id": "message-id"
    },
    "message": {
      "conversation": "Hello, World!"
    },
    "messageTimestamp": 1640995200
  },
  "destination": "webhook-destination",
  "date_time": "2024-01-01T12:00:00Z",
  "sender": "evolution-api",
  "server_url": "https://evolution.api.server"
}
```

**Response:**
```json
{
  "success": true,
  "eventId": "event-12345",
  "message": "Webhook processed successfully"
}
```

### Webhook Configuration Management

#### Get Webhook Configurations
```
GET /api/webhook/configs
Authorization: Bearer <token>
```

#### Create Webhook Configuration
```
POST /api/webhook/configs
Authorization: Bearer <token>
Content-Type: application/json

{
  "url": "https://your-domain.com/webhook",
  "events": ["MESSAGES_UPSERT", "CONNECTION_UPDATE"],
  "secret": "your-webhook-secret",
  "isActive": true,
  "retryAttempts": 3,
  "retryDelay": 5000,
  "timeout": 30000,
  "headers": {
    "Authorization": "Bearer your-token"
  }
}
```

#### Update Webhook Configuration
```
PUT /api/webhook/configs/{configId}
Authorization: Bearer <token>
```

#### Delete Webhook Configuration
```
DELETE /api/webhook/configs/{configId}
Authorization: Bearer <token>
```

#### Test Webhook Configuration
```
POST /api/webhook/configs/{configId}/test
Authorization: Bearer <token>
```

### Analytics and Monitoring

#### Get Webhook Statistics
```
GET /api/webhook/stats?period=24h
Authorization: Bearer <token>
```

#### Get Recent Webhook Events
```
GET /api/webhook/events?limit=50
Authorization: Bearer <token>
```

## Security Features

### IP Whitelist
Configure allowed IP addresses for webhook requests:

```typescript
// Environment variable
WEBHOOK_IP_WHITELIST_ENABLED=true

// Dynamic whitelist management
await addIPToWhitelist('192.168.1.100', 'Evolution API server');
await removeIPFromWhitelist('192.168.1.100', 'Server decommissioned');
```

### Rate Limiting
Multiple layers of rate limiting:
- **Per IP**: 1000 requests per minute
- **Per Instance**: 500 requests per minute
- **Global**: 5000 requests per minute

### Signature Verification
Verify webhook authenticity using HMAC signatures:

```typescript
// Environment variable
EVOLUTION_WEBHOOK_SECRET=your-secret-key

// Signature verification is automatic
// Signatures can be in GitHub format: sha256=<hash>
// Or simple format: <hash>
```

### Request Validation
- Content-Type validation (must be application/json)
- User-Agent validation
- Payload size limits (configurable, default 1MB)
- JSON structure validation
- XSS and injection protection

## Real-time Features

### WebSocket Integration
Connect to real-time updates:

```javascript
const socket = io('/socket.io', {
  auth: {
    token: 'your-jwt-token'
  }
});

// Subscribe to webhook events
socket.emit('subscribe:webhooks');

// Listen for real-time updates
socket.on('webhook:event', (data) => {
  console.log('New webhook event:', data);
});

// Listen for alerts
socket.on('webhook:alert', (alert) => {
  console.log('Webhook alert:', alert);
});
```

### Event Broadcasting
Events are automatically broadcast to:
- Tenant-specific channels
- Instance-specific channels
- Bot-specific channels
- Global admin channels

## Analytics and Monitoring

### Health Monitoring
The system continuously monitors:
- Event processing rates
- Error rates and types
- Processing latencies
- System resource usage
- Security events

### Alerting System
Automatic alerts for:
- High error rates (>50%)
- Processing delays (>10 seconds)
- No events received (>30 minutes)
- Security breaches
- System failures

### Performance Metrics
Track key performance indicators:
- Average response time
- 95th and 99th percentile response times
- Throughput (events per second)
- Error rates
- System uptime

## Configuration

### Environment Variables

```bash
# Webhook Security
WEBHOOK_IP_WHITELIST_ENABLED=true
WEBHOOK_BLOCK_GENERIC_CLIENTS=true
WEBHOOK_MAX_PAYLOAD_SIZE=1048576
EVOLUTION_WEBHOOK_SECRET=your-secret-key

# Rate Limiting
WEBHOOK_RATE_LIMIT_MAX_REQUESTS=1000
WEBHOOK_RATE_LIMIT_WINDOW_MS=60000

# Database and Cache
DATABASE_URL=postgresql://user:pass@localhost:5432/zapin
REDIS_URL=redis://localhost:6379

# CORS
CORS_ORIGIN=http://localhost:3000,https://your-domain.com
```

### Webhook Configuration in Evolution API

Configure Evolution API to send webhooks to Zapin:

```json
{
  "webhook": {
    "url": "https://your-zapin-instance.com/api/webhook/evolution",
    "byEvents": true,
    "base64": false,
    "events": [
      "APPLICATION_STARTUP",
      "QRCODE_UPDATED",
      "CONNECTION_UPDATE",
      "MESSAGES_UPSERT",
      "MESSAGES_UPDATE",
      "SEND_MESSAGE",
      "CONTACTS_UPSERT",
      "CONTACTS_UPDATE",
      "CHATS_UPSERT",
      "CHATS_UPDATE",
      "GROUPS_UPSERT",
      "GROUP_UPDATE",
      "GROUP_PARTICIPANTS_UPDATE",
      "TYPEBOT_START",
      "TYPEBOT_CHANGE_STATUS",
      "OPENAI_START",
      "OPENAI_CHANGE_STATUS",
      "CALL"
    ]
  }
}
```

## Usage Examples

### Processing Message Events

```typescript
// Message events are automatically processed
// and stored in the database with analytics

// Access processed messages
const messages = await prisma.messageLog.findMany({
  where: {
    tenantId: 'your-tenant-id',
    createdAt: {
      gte: new Date(Date.now() - 24 * 60 * 60 * 1000) // Last 24 hours
    }
  },
  orderBy: { createdAt: 'desc' }
});
```

### Real-time Dashboard Updates

```typescript
// WebSocket events are automatically sent
// when webhook events are processed

// In your React component:
useEffect(() => {
  socket.on('message:update', (data) => {
    // Update message list in real-time
    setMessages(prev => [data, ...prev]);
  });

  socket.on('connection:update', (data) => {
    // Update instance status in real-time
    setInstanceStatus(data.status);
  });

  return () => {
    socket.off('message:update');
    socket.off('connection:update');
  };
}, []);
```

### Custom Event Processing

```typescript
// Add custom event processor
webhookService.eventProcessors.set(
  WebhookEventType.CUSTOM_EVENT,
  async (payload, tenant, instance) => {
    // Custom processing logic
    console.log('Processing custom event:', payload);
    
    // Store custom data
    await prisma.customEventLog.create({
      data: {
        eventType: payload.event,
        tenantId: tenant.id,
        instanceId: instance.id,
        data: payload.data
      }
    });
    
    // Broadcast custom update
    await redis.publish(`tenant:${tenant.id}:custom`, JSON.stringify({
      type: 'custom_event',
      data: payload.data
    }));
  }
);
```

## Troubleshooting

### Common Issues

1. **Webhooks not being received**
   - Check Evolution API webhook configuration
   - Verify webhook URL is accessible
   - Check firewall and network settings
   - Review webhook security settings (IP whitelist, etc.)

2. **High error rates**
   - Check database connectivity
   - Verify Redis connectivity
   - Review system resource usage
   - Check for malformed webhook payloads

3. **Processing delays**
   - Monitor system load
   - Check database query performance
   - Review Redis performance
   - Consider scaling resources

4. **Security alerts**
   - Review IP whitelist configuration
   - Check for suspicious activity patterns
   - Verify webhook signatures
   - Monitor rate limiting logs

### Debugging

Enable debug logging:

```bash
LOG_LEVEL=debug
```

Check webhook processing logs:

```bash
# View recent webhook events
redis-cli KEYS "webhook:event:*"

# View security events
redis-cli KEYS "security:events:*"

# View analytics data
redis-cli KEYS "analytics:webhook:*"
```

Monitor real-time events:

```bash
# Subscribe to Redis channels
redis-cli PSUBSCRIBE "tenant:*:*"
redis-cli PSUBSCRIBE "global:*"
```

## Performance Optimization

### Database Optimization
- Index frequently queried fields
- Implement data archiving for old events
- Use read replicas for analytics queries
- Optimize Prisma queries

### Redis Optimization
- Configure appropriate memory limits
- Use Redis clustering for high availability
- Implement data expiration policies
- Monitor Redis performance metrics

### Application Optimization
- Implement connection pooling
- Use async processing for heavy operations
- Cache frequently accessed data
- Implement circuit breakers for external calls

## Deployment

### Docker Deployment

```dockerfile
# Dockerfile already includes webhook system
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
RUN npm run build
EXPOSE 3001
CMD ["npm", "run", "start:api"]
```

### Environment Setup

```bash
# Production environment
NODE_ENV=production
API_PORT=3001
DATABASE_URL=postgresql://user:pass@db:5432/zapin
REDIS_URL=redis://redis:6379
JWT_SECRET=your-jwt-secret
EVOLUTION_WEBHOOK_SECRET=your-webhook-secret
```

### Health Checks

```bash
# API health check
curl http://localhost:3001/health

# Webhook system health
curl http://localhost:3001/api/webhook/stats \
  -H "Authorization: Bearer your-token"
```

## Monitoring and Alerting

### Metrics to Monitor
- Webhook event processing rate
- Error rates by event type
- Processing latency percentiles
- Database connection pool usage
- Redis memory usage
- WebSocket connection count

### Alert Thresholds
- Error rate > 10% (warning), > 25% (critical)
- Processing time > 5s (warning), > 10s (critical)
- No events for > 30 minutes (warning)
- Database connections > 80% (warning)
- Redis memory > 80% (warning)

### Integration with External Monitoring

```typescript
// Example: Send metrics to external monitoring service
import { webhookService } from './services/webhookService';

webhookService.on('event_processed', (event) => {
  // Send to monitoring service
  monitoring.increment('webhook.events.processed', {
    event_type: event.eventType,
    tenant_id: event.tenantId,
    success: event.success
  });
});
```

## Conclusion

The Zapin Webhook System provides a robust, scalable, and secure platform for processing real-time WhatsApp events. With comprehensive analytics, monitoring, and real-time capabilities, it enables businesses to build powerful WhatsApp automation solutions with enterprise-grade reliability and performance.

For additional support or questions, please refer to the API documentation or contact the development team.