import winston from 'winston';
import path from 'path';
import fs from 'fs';

// Ensure logs directory exists
const logsDir = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Custom log format
const logFormat = winston.format.combine(
  winston.format.timestamp({
    format: 'YYYY-MM-DD HH:mm:ss'
  }),
  winston.format.errors({ stack: true }),
  winston.format.json(),
  winston.format.prettyPrint()
);

// Console format for development
const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({
    format: 'HH:mm:ss'
  }),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    let msg = `${timestamp} [${level}]: ${message}`;
    if (Object.keys(meta).length > 0) {
      msg += ` ${JSON.stringify(meta, null, 2)}`;
    }
    return msg;
  })
);

// Create logger instance
export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: logFormat,
  defaultMeta: {
    service: 'zapin-api',
    environment: process.env.NODE_ENV || 'development'
  },
  transports: [
    // Error log file
    new winston.transports.File({
      filename: path.join(logsDir, 'error.log'),
      level: 'error',
      maxsize: 5242880, // 5MB
      maxFiles: 5,
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
      )
    }),
    
    // Combined log file
    new winston.transports.File({
      filename: path.join(logsDir, 'combined.log'),
      maxsize: 5242880, // 5MB
      maxFiles: 5,
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
      )
    }),
    
    // Console output
    new winston.transports.Console({
      format: process.env.NODE_ENV === 'production' ? logFormat : consoleFormat
    })
  ],
  
  // Handle exceptions and rejections
  exceptionHandlers: [
    new winston.transports.File({
      filename: path.join(logsDir, 'exceptions.log'),
      maxsize: 5242880,
      maxFiles: 5
    })
  ],
  
  rejectionHandlers: [
    new winston.transports.File({
      filename: path.join(logsDir, 'rejections.log'),
      maxsize: 5242880,
      maxFiles: 5
    })
  ]
});

// Create child loggers for different modules
export const createModuleLogger = (module: string) => {
  return logger.child({ module });
};

// Specific loggers for different parts of the application
export const authLogger = createModuleLogger('auth');
export const apiLogger = createModuleLogger('api');
export const dbLogger = createModuleLogger('database');
export const cacheLogger = createModuleLogger('cache');
export const whatsappLogger = createModuleLogger('whatsapp');
export const monitoringLogger = createModuleLogger('monitoring');

// Request logging middleware helper
export const logRequest = (req: any, res: any, responseTime: number) => {
  const logData = {
    method: req.method,
    url: req.url,
    statusCode: res.statusCode,
    responseTime: `${responseTime}ms`,
    userAgent: req.get('User-Agent'),
    ip: req.ip || req.connection.remoteAddress,
    userId: req.user?.id,
    tenantId: req.tenant?.id
  };

  if (res.statusCode >= 400) {
    apiLogger.warn('HTTP Request', logData);
  } else {
    apiLogger.info('HTTP Request', logData);
  }
};

// Database query logging helper
export const logQuery = (query: string, duration: number, error?: any) => {
  const logData = {
    query: query.substring(0, 200), // Truncate long queries
    duration: `${duration}ms`
  };

  if (error) {
    dbLogger.error('Database Query Failed', { ...logData, error: error.message });
  } else if (duration > 1000) {
    dbLogger.warn('Slow Database Query', logData);
  } else {
    dbLogger.debug('Database Query', logData);
  }
};

// Cache operation logging helper
export const logCacheOperation = (operation: 'hit' | 'miss' | 'set' | 'del', key: string, duration?: number) => {
  const logData = {
    operation,
    key,
    ...(duration && { duration: `${duration}ms` })
  };

  cacheLogger.debug('Cache Operation', logData);
};

// WhatsApp operation logging helper
export const logWhatsAppOperation = (operation: string, instanceId: string, data?: any, error?: any) => {
  const logData = {
    operation,
    instanceId,
    ...(data && { data }),
    ...(error && { error: error.message })
  };

  if (error) {
    whatsappLogger.error('WhatsApp Operation Failed', logData);
  } else {
    whatsappLogger.info('WhatsApp Operation', logData);
  }
};

// Security event logging helper
export const logSecurityEvent = (event: string, details: any, severity: 'low' | 'medium' | 'high' | 'critical' = 'medium') => {
  const logData = {
    event,
    severity,
    timestamp: new Date().toISOString(),
    ...details
  };

  switch (severity) {
    case 'critical':
      logger.error('SECURITY ALERT', logData);
      break;
    case 'high':
      logger.warn('Security Event', logData);
      break;
    case 'medium':
      logger.info('Security Event', logData);
      break;
    case 'low':
      logger.debug('Security Event', logData);
      break;
  }
};

// Performance monitoring helper
export const logPerformance = (operation: string, duration: number, metadata?: any) => {
  const logData = {
    operation,
    duration: `${duration}ms`,
    ...(metadata && { metadata })
  };

  if (duration > 5000) {
    logger.warn('Slow Operation', logData);
  } else if (duration > 1000) {
    logger.info('Performance', logData);
  } else {
    logger.debug('Performance', logData);
  }
};

// Structured error logging helper
export const logError = (error: Error, context?: any) => {
  const logData = {
    message: error.message,
    stack: error.stack,
    name: error.name,
    ...(context && { context })
  };

  logger.error('Application Error', logData);
};

// Business logic logging helper
export const logBusinessEvent = (event: string, data: any, userId?: string, tenantId?: string) => {
  const logData = {
    event,
    data,
    ...(userId && { userId }),
    ...(tenantId && { tenantId }),
    timestamp: new Date().toISOString()
  };

  logger.info('Business Event', logData);
};

// Audit logging helper
export const logAudit = (action: string, resource: string, userId: string, tenantId: string, changes?: any) => {
  const logData = {
    action,
    resource,
    userId,
    tenantId,
    timestamp: new Date().toISOString(),
    ...(changes && { changes })
  };

  logger.info('Audit Log', logData);
};

// Log rotation and cleanup
export const cleanupLogs = () => {
  const maxAge = 30 * 24 * 60 * 60 * 1000; // 30 days
  const now = Date.now();

  try {
    const files = fs.readdirSync(logsDir);
    files.forEach(file => {
      const filePath = path.join(logsDir, file);
      const stats = fs.statSync(filePath);
      
      if (now - stats.mtime.getTime() > maxAge) {
        fs.unlinkSync(filePath);
        logger.info(`Cleaned up old log file: ${file}`);
      }
    });
  } catch (error) {
    logger.error('Failed to cleanup logs:', error);
  }
};

// Initialize log cleanup interval (run daily)
if (process.env.NODE_ENV === 'production') {
  setInterval(cleanupLogs, 24 * 60 * 60 * 1000);
}

export default logger;