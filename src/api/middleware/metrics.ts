import { FastifyRequest, FastifyReply } from 'fastify';

export async function metricsMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
) {
  const startTime = Date.now();
  
  // Add response time header
  reply.header('X-Response-Time', '0ms');
  
  // Hook into the response to calculate metrics
  (reply as any).addHook('onSend', async (request: any, reply: any, payload: any) => {
    const responseTime = Date.now() - startTime;
    
    // Update response time header
    reply.header('X-Response-Time', `${responseTime}ms`);
    
    // Record metrics
    try {
      const { 
        httpRequestDuration, 
        httpRequestsTotal, 
        activeConnections 
      } = await import('../../lib/metrics');
      
      // Record request duration
      httpRequestDuration
        .labels(
          request.method,
          request.routerPath || request.url,
          reply.statusCode.toString(),
          (request as any).tenant?.id || 'anonymous'
        )
        .observe(responseTime / 1000);
      
      // Increment request counter
      httpRequestsTotal
        .labels(
          request.method,
          request.routerPath || request.url,
          reply.statusCode.toString(),
          (request as any).tenant?.id || 'anonymous'
        )
        .inc();
      
      // Update active connections (approximate)
      activeConnections.set(process.memoryUsage().external);
      
    } catch (error) {
      request.log.warn('Failed to record metrics:', error);
    }
    
    return payload;
  });
}