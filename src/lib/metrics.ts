import client from 'prom-client';

// Export the client for use in other modules
export const promClient = client;

// Create a Registry which registers the metrics
export const register = new client.Registry();

// Add a default label which is added to all metrics
register.setDefaultLabels({
  app: 'zapin-api',
  version: process.env.APP_VERSION || '1.0.0',
});

// Enable the collection of default metrics
client.collectDefaultMetrics({ register });

// Custom metrics
export const httpRequestDuration = new client.Histogram({
  name: 'zapin_http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code', 'tenant_id'],
  buckets: [0.1, 0.3, 0.5, 0.7, 1, 3, 5, 7, 10],
});

export const httpRequestsTotal = new client.Counter({
  name: 'zapin_http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code', 'tenant_id'],
});

export const messagesSentTotal = new client.Counter({
  name: 'zapin_messages_sent_total',
  help: 'Total number of messages sent',
  labelNames: ['tenant_id', 'instance_id', 'message_type', 'status'],
});

export const messagesReceivedTotal = new client.Counter({
  name: 'zapin_messages_received_total',
  help: 'Total number of messages received',
  labelNames: ['tenant_id', 'instance_id', 'message_type'],
});

export const quotaUsageGauge = new client.Gauge({
  name: 'zapin_quota_usage',
  help: 'Current quota usage by tenant',
  labelNames: ['tenant_id', 'quota_type', 'period'],
});

export const quotaLimitGauge = new client.Gauge({
  name: 'zapin_quota_limit',
  help: 'Quota limits by tenant',
  labelNames: ['tenant_id', 'quota_type', 'period'],
});

export const activeInstancesGauge = new client.Gauge({
  name: 'zapin_active_instances',
  help: 'Number of active WhatsApp instances',
  labelNames: ['tenant_id', 'status'],
});

export const activeBotsGauge = new client.Gauge({
  name: 'zapin_active_bots',
  help: 'Number of active bots',
  labelNames: ['tenant_id', 'bot_type'],
});

export const botSessionsGauge = new client.Gauge({
  name: 'zapin_bot_sessions',
  help: 'Number of active bot sessions',
  labelNames: ['tenant_id', 'bot_id', 'status'],
});

export const evolutionApiRequestDuration = new client.Histogram({
  name: 'zapin_evolution_api_request_duration_seconds',
  help: 'Duration of Evolution API requests in seconds',
  labelNames: ['method', 'endpoint', 'status_code', 'tenant_id'],
  buckets: [0.1, 0.5, 1, 2, 5, 10, 30],
});

export const evolutionApiRequestsTotal = new client.Counter({
  name: 'zapin_evolution_api_requests_total',
  help: 'Total number of Evolution API requests',
  labelNames: ['method', 'endpoint', 'status_code', 'tenant_id'],
});

export const evolutionApiErrorsTotal = new client.Counter({
  name: 'zapin_evolution_api_errors_total',
  help: 'Total number of Evolution API errors',
  labelNames: ['method', 'endpoint', 'error_type', 'tenant_id'],
});

export const databaseConnectionsGauge = new client.Gauge({
  name: 'zapin_database_connections',
  help: 'Number of active database connections',
});

export const redisConnectionsGauge = new client.Gauge({
  name: 'zapin_redis_connections',
  help: 'Number of active Redis connections',
});

export const activeConnections = new client.Gauge({
  name: 'zapin_active_connections',
  help: 'Number of active HTTP connections',
});

export const webhookEventsTotal = new client.Counter({
  name: 'zapin_webhook_events_total',
  help: 'Total number of webhook events received',
  labelNames: ['tenant_id', 'instance_id', 'event_type', 'status'],
});

export const apiKeyUsageTotal = new client.Counter({
  name: 'zapin_api_key_usage_total',
  help: 'Total API key usage',
  labelNames: ['tenant_id', 'api_key_id', 'endpoint'],
});

export const billingAmountGauge = new client.Gauge({
  name: 'zapin_billing_amount',
  help: 'Current billing amount by tenant',
  labelNames: ['tenant_id', 'period', 'status'],
});

export const systemResourcesGauge = new client.Gauge({
  name: 'zapin_system_resources',
  help: 'System resource usage',
  labelNames: ['resource_type'],
});

// Register all custom metrics
register.registerMetric(httpRequestDuration);
register.registerMetric(httpRequestsTotal);
register.registerMetric(messagesSentTotal);
register.registerMetric(messagesReceivedTotal);
register.registerMetric(quotaUsageGauge);
register.registerMetric(quotaLimitGauge);
register.registerMetric(activeInstancesGauge);
register.registerMetric(activeBotsGauge);
register.registerMetric(botSessionsGauge);
register.registerMetric(evolutionApiRequestDuration);
register.registerMetric(evolutionApiRequestsTotal);
register.registerMetric(evolutionApiErrorsTotal);
register.registerMetric(databaseConnectionsGauge);
register.registerMetric(redisConnectionsGauge);
register.registerMetric(activeConnections);
register.registerMetric(webhookEventsTotal);
register.registerMetric(apiKeyUsageTotal);
register.registerMetric(billingAmountGauge);
register.registerMetric(systemResourcesGauge);

// Helper functions for common metric operations
export function recordMessageSent(
  tenantId: string,
  instanceId: string,
  messageType: string,
  status: string
) {
  messagesSentTotal.labels(tenantId, instanceId, messageType, status).inc();
}

export function recordMessageReceived(
  tenantId: string,
  instanceId: string,
  messageType: string
) {
  messagesReceivedTotal.labels(tenantId, instanceId, messageType).inc();
}

export function updateQuotaMetrics(
  tenantId: string,
  quotaType: string,
  period: string,
  usage: number,
  limit: number
) {
  quotaUsageGauge.labels(tenantId, quotaType, period).set(usage);
  quotaLimitGauge.labels(tenantId, quotaType, period).set(limit);
}

export function updateInstanceMetrics(tenantId: string, status: string, count: number) {
  activeInstancesGauge.labels(tenantId, status).set(count);
}

export function updateBotMetrics(tenantId: string, botType: string, count: number) {
  activeBotsGauge.labels(tenantId, botType).set(count);
}

export function recordEvolutionApiRequest(
  method: string,
  endpoint: string,
  statusCode: number,
  duration: number,
  tenantId: string
) {
  evolutionApiRequestDuration
    .labels(method, endpoint, statusCode.toString(), tenantId)
    .observe(duration);
  
  evolutionApiRequestsTotal
    .labels(method, endpoint, statusCode.toString(), tenantId)
    .inc();
}

export function recordEvolutionApiError(
  method: string,
  endpoint: string,
  errorType: string,
  tenantId: string
) {
  evolutionApiErrorsTotal
    .labels(method, endpoint, errorType, tenantId)
    .inc();
}

export function recordWebhookEvent(
  tenantId: string,
  instanceId: string,
  eventType: string,
  status: string
) {
  webhookEventsTotal.labels(tenantId, instanceId, eventType, status).inc();
}

export function recordApiKeyUsage(
  tenantId: string,
  apiKeyId: string,
  endpoint: string
) {
  apiKeyUsageTotal.labels(tenantId, apiKeyId, endpoint).inc();
}

export function updateBillingMetrics(
  tenantId: string,
  period: string,
  status: string,
  amount: number
) {
  billingAmountGauge.labels(tenantId, period, status).set(amount);
}

export function updateSystemMetrics() {
  const memUsage = process.memoryUsage();
  systemResourcesGauge.labels('memory_used').set(memUsage.heapUsed);
  systemResourcesGauge.labels('memory_total').set(memUsage.heapTotal);
  systemResourcesGauge.labels('memory_external').set(memUsage.external);
  
  const cpuUsage = process.cpuUsage();
  systemResourcesGauge.labels('cpu_user').set(cpuUsage.user);
  systemResourcesGauge.labels('cpu_system').set(cpuUsage.system);
}

// Start collecting system metrics every 30 seconds
setInterval(updateSystemMetrics, 30000);

export default register;