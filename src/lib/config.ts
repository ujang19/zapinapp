import { z } from 'zod';
import path from 'path';
import fs from 'fs';

// Configuration schema validation
const configSchema = z.object({
  // Application
  NODE_ENV: z.enum(['development', 'staging', 'production', 'test']),
  APP_NAME: z.string().default('Zapin WhatsApp SaaS'),
  APP_VERSION: z.string().default('1.0.0'),
  APP_URL: z.string().url(),
  API_URL: z.string().url(),
  PORT: z.coerce.number().default(8080),
  API_PORT: z.coerce.number().default(3001),

  // Security
  JWT_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  JWT_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),
  ENCRYPTION_KEY: z.string().length(32),
  SESSION_SECRET: z.string().min(32),

  // Database
  DATABASE_URL: z.string().url(),
  DATABASE_POOL_SIZE: z.coerce.number().default(10),
  DATABASE_CONNECTION_TIMEOUT: z.coerce.number().default(30000),
  DATABASE_IDLE_TIMEOUT: z.coerce.number().default(600000),
  DATABASE_SSL: z.coerce.boolean().default(false),

  // Redis
  REDIS_URL: z.string().url(),
  REDIS_PASSWORD: z.string().optional(),
  REDIS_DB: z.coerce.number().default(0),
  REDIS_KEY_PREFIX: z.string().default('zapin:'),
  REDIS_CONNECTION_TIMEOUT: z.coerce.number().default(5000),
  REDIS_TLS_ENABLED: z.coerce.boolean().default(false),

  // Evolution API
  EVOLUTION_API_URL: z.string().url(),
  EVOLUTION_API_KEY: z.string().min(10),
  EVOLUTION_API_TIMEOUT: z.coerce.number().default(30000),
  EVOLUTION_API_RETRY_ATTEMPTS: z.coerce.number().default(3),
  EVOLUTION_API_RETRY_DELAY: z.coerce.number().default(1000),

  // Logging
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
  LOG_FILE_ENABLED: z.coerce.boolean().default(true),
  LOG_CONSOLE_ENABLED: z.coerce.boolean().default(true),
  LOG_MAX_FILES: z.coerce.number().default(5),
  LOG_MAX_SIZE: z.string().default('10MB'),

  // Monitoring
  METRICS_ENABLED: z.coerce.boolean().default(true),
  METRICS_PORT: z.coerce.number().default(9090),
  METRICS_PATH: z.string().default('/metrics'),
  HEALTH_CHECK_ENABLED: z.coerce.boolean().default(true),
  HEALTH_CHECK_PATH: z.string().default('/health'),

  // Rate Limiting
  RATE_LIMIT_ENABLED: z.coerce.boolean().default(true),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().default(900000),
  RATE_LIMIT_MAX_REQUESTS: z.coerce.number().default(100),
  RATE_LIMIT_SKIP_SUCCESSFUL_REQUESTS: z.coerce.boolean().default(false),

  // CORS
  CORS_ENABLED: z.coerce.boolean().default(true),
  CORS_ORIGIN: z.string(),
  CORS_CREDENTIALS: z.coerce.boolean().default(true),

  // File Upload
  UPLOAD_MAX_SIZE: z.string().default('10MB'),
  UPLOAD_ALLOWED_TYPES: z.string(),
  UPLOAD_DESTINATION: z.string().default('./uploads'),

  // Email
  SMTP_HOST: z.string(),
  SMTP_PORT: z.coerce.number(),
  SMTP_SECURE: z.coerce.boolean().default(false),
  SMTP_USER: z.string(),
  SMTP_PASS: z.string(),
  EMAIL_FROM: z.string().email(),
  EMAIL_FROM_NAME: z.string(),

  // Feature Flags
  FEATURE_REGISTRATION_ENABLED: z.coerce.boolean().default(true),
  FEATURE_EMAIL_VERIFICATION: z.coerce.boolean().default(false),
  FEATURE_TWO_FACTOR_AUTH: z.coerce.boolean().default(false),
  FEATURE_ANALYTICS: z.coerce.boolean().default(true),
  FEATURE_RATE_LIMITING: z.coerce.boolean().default(true),

  // External Services
  STRIPE_PUBLISHABLE_KEY: z.string().optional(),
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),

  // Storage
  STORAGE_TYPE: z.enum(['local', 's3']).default('local'),
  AWS_ACCESS_KEY_ID: z.string().optional(),
  AWS_SECRET_ACCESS_KEY: z.string().optional(),
  AWS_REGION: z.string().optional(),
  AWS_S3_BUCKET: z.string().optional(),

  // Cache
  CACHE_TTL_DEFAULT: z.coerce.number().default(3600),
  CACHE_TTL_USER_SESSION: z.coerce.number().default(86400),
  CACHE_TTL_API_RESPONSE: z.coerce.number().default(300),
  CACHE_TTL_STATIC_DATA: z.coerce.number().default(604800),

  // Queue
  QUEUE_REDIS_URL: z.string().url().optional(),
  QUEUE_CONCURRENCY: z.coerce.number().default(5),
  QUEUE_MAX_ATTEMPTS: z.coerce.number().default(3),
  QUEUE_BACKOFF_DELAY: z.coerce.number().default(5000),

  // Notifications
  NOTIFICATION_CHANNELS: z.string().default('console'),
  SLACK_WEBHOOK_URL: z.string().url().optional(),
  DISCORD_WEBHOOK_URL: z.string().url().optional(),

  // Security Headers
  SECURITY_HEADERS_ENABLED: z.coerce.boolean().default(true),
  HSTS_ENABLED: z.coerce.boolean().default(true),
  HSTS_MAX_AGE: z.coerce.number().default(31536000),
  CSP_ENABLED: z.coerce.boolean().default(true),
  CSP_REPORT_ONLY: z.coerce.boolean().default(false),

  // Performance
  COMPRESSION_ENABLED: z.coerce.boolean().default(true),
  COMPRESSION_LEVEL: z.coerce.number().default(6),
  STATIC_CACHE_MAX_AGE: z.coerce.number().default(86400),
  API_CACHE_MAX_AGE: z.coerce.number().default(300),

  // Backup
  BACKUP_ENABLED: z.coerce.boolean().default(false),
  BACKUP_SCHEDULE: z.string().optional(),
  BACKUP_RETENTION_DAYS: z.coerce.number().default(30),
  BACKUP_S3_BUCKET: z.string().optional(),

  // Scaling
  AUTO_SCALING_ENABLED: z.coerce.boolean().default(false),
  MIN_INSTANCES: z.coerce.number().default(1),
  MAX_INSTANCES: z.coerce.number().default(10),
  CPU_THRESHOLD: z.coerce.number().default(70),
  MEMORY_THRESHOLD: z.coerce.number().default(80),
});

export type Config = z.infer<typeof configSchema>;

class ConfigManager {
  private static instance: ConfigManager;
  private config: Config;
  private environment: string;

  private constructor() {
    this.environment = process.env.NODE_ENV || 'development';
    this.config = this.loadConfiguration();
  }

  static getInstance(): ConfigManager {
    if (!ConfigManager.instance) {
      ConfigManager.instance = new ConfigManager();
    }
    return ConfigManager.instance;
  }

  private loadConfiguration(): Config {
    // Load environment-specific configuration
    const envConfigPath = path.join(
      process.cwd(),
      'config',
      'environments',
      `${this.environment}.env`
    );

    // Load base environment variables
    const baseEnv = { ...process.env };

    // Load environment-specific variables if file exists
    if (fs.existsSync(envConfigPath)) {
      const envConfig = this.parseEnvFile(envConfigPath);
      Object.assign(baseEnv, envConfig);
    }

    // Validate and parse configuration
    try {
      const parsedConfig = configSchema.parse(baseEnv);
      console.log(`✅ Configuration loaded successfully for ${this.environment} environment`);
      return parsedConfig;
    } catch (error) {
      console.error('❌ Configuration validation failed:', error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Invalid configuration: ${errorMessage}`);
    }
  }

  private parseEnvFile(filePath: string): Record<string, string> {
    const content = fs.readFileSync(filePath, 'utf-8');
    const env: Record<string, string> = {};

    content.split('\n').forEach((line) => {
      // Skip comments and empty lines
      if (line.trim() === '' || line.trim().startsWith('#')) {
        return;
      }

      const [key, ...valueParts] = line.split('=');
      if (key && valueParts.length > 0) {
        const value = valueParts.join('=').trim();
        
        // Remove quotes if present
        const cleanValue = value.replace(/^["']|["']$/g, '');
        
        // Handle variable substitution (${VAR_NAME})
        const substitutedValue = cleanValue.replace(
          /\$\{([^}]+)\}/g,
          (match, varName) => process.env[varName] || match
        );
        
        env[key.trim()] = substitutedValue;
      }
    });

    return env;
  }

  getConfig(): Config {
    return this.config;
  }

  get<K extends keyof Config>(key: K): Config[K] {
    return this.config[key];
  }

  getEnvironment(): string {
    return this.environment;
  }

  isDevelopment(): boolean {
    return this.environment === 'development';
  }

  isStaging(): boolean {
    return this.environment === 'staging';
  }

  isProduction(): boolean {
    return this.environment === 'production';
  }

  isTest(): boolean {
    return this.environment === 'test';
  }

  // Feature flag helpers
  isFeatureEnabled(feature: string): boolean {
    const featureKey = `FEATURE_${feature.toUpperCase()}_ENABLED` as keyof Config;
    return Boolean(this.config[featureKey]);
  }

  // Database configuration
  getDatabaseConfig() {
    return {
      url: this.config.DATABASE_URL,
      poolSize: this.config.DATABASE_POOL_SIZE,
      connectionTimeout: this.config.DATABASE_CONNECTION_TIMEOUT,
      idleTimeout: this.config.DATABASE_IDLE_TIMEOUT,
      ssl: this.config.DATABASE_SSL,
    };
  }

  // Redis configuration
  getRedisConfig() {
    return {
      url: this.config.REDIS_URL,
      password: this.config.REDIS_PASSWORD,
      db: this.config.REDIS_DB,
      keyPrefix: this.config.REDIS_KEY_PREFIX,
      connectionTimeout: this.config.REDIS_CONNECTION_TIMEOUT,
      tls: this.config.REDIS_TLS_ENABLED,
    };
  }

  // JWT configuration
  getJWTConfig() {
    return {
      secret: this.config.JWT_SECRET,
      refreshSecret: this.config.JWT_REFRESH_SECRET,
      expiresIn: this.config.JWT_EXPIRES_IN,
      refreshExpiresIn: this.config.JWT_REFRESH_EXPIRES_IN,
    };
  }

  // Email configuration
  getEmailConfig() {
    return {
      host: this.config.SMTP_HOST,
      port: this.config.SMTP_PORT,
      secure: this.config.SMTP_SECURE,
      auth: {
        user: this.config.SMTP_USER,
        pass: this.config.SMTP_PASS,
      },
      from: this.config.EMAIL_FROM,
      fromName: this.config.EMAIL_FROM_NAME,
    };
  }

  // Storage configuration
  getStorageConfig() {
    return {
      type: this.config.STORAGE_TYPE,
      aws: {
        accessKeyId: this.config.AWS_ACCESS_KEY_ID,
        secretAccessKey: this.config.AWS_SECRET_ACCESS_KEY,
        region: this.config.AWS_REGION,
        bucket: this.config.AWS_S3_BUCKET,
      },
    };
  }

  // Rate limiting configuration
  getRateLimitConfig() {
    return {
      enabled: this.config.RATE_LIMIT_ENABLED,
      windowMs: this.config.RATE_LIMIT_WINDOW_MS,
      maxRequests: this.config.RATE_LIMIT_MAX_REQUESTS,
      skipSuccessfulRequests: this.config.RATE_LIMIT_SKIP_SUCCESSFUL_REQUESTS,
    };
  }

  // CORS configuration
  getCORSConfig() {
    return {
      enabled: this.config.CORS_ENABLED,
      origin: this.config.CORS_ORIGIN.split(',').map(o => o.trim()),
      credentials: this.config.CORS_CREDENTIALS,
    };
  }

  // Cache configuration
  getCacheConfig() {
    return {
      ttl: {
        default: this.config.CACHE_TTL_DEFAULT,
        userSession: this.config.CACHE_TTL_USER_SESSION,
        apiResponse: this.config.CACHE_TTL_API_RESPONSE,
        staticData: this.config.CACHE_TTL_STATIC_DATA,
      },
    };
  }

  // Monitoring configuration
  getMonitoringConfig() {
    return {
      metrics: {
        enabled: this.config.METRICS_ENABLED,
        port: this.config.METRICS_PORT,
        path: this.config.METRICS_PATH,
      },
      healthCheck: {
        enabled: this.config.HEALTH_CHECK_ENABLED,
        path: this.config.HEALTH_CHECK_PATH,
      },
    };
  }

  // Security configuration
  getSecurityConfig() {
    return {
      headers: {
        enabled: this.config.SECURITY_HEADERS_ENABLED,
        hsts: {
          enabled: this.config.HSTS_ENABLED,
          maxAge: this.config.HSTS_MAX_AGE,
        },
        csp: {
          enabled: this.config.CSP_ENABLED,
          reportOnly: this.config.CSP_REPORT_ONLY,
        },
      },
      encryption: {
        key: this.config.ENCRYPTION_KEY,
      },
    };
  }

  // Validation helpers
  validateRequiredSecrets(): void {
    const requiredSecrets = [
      'JWT_SECRET',
      'JWT_REFRESH_SECRET',
      'ENCRYPTION_KEY',
      'SESSION_SECRET',
      'DATABASE_URL',
      'REDIS_URL',
      'EVOLUTION_API_KEY',
    ];

    const missingSecrets = requiredSecrets.filter(
      secret => !this.config[secret as keyof Config]
    );

    if (missingSecrets.length > 0) {
      throw new Error(
        `Missing required secrets: ${missingSecrets.join(', ')}`
      );
    }
  }

  // Configuration summary for logging
  getConfigSummary() {
    return {
      environment: this.environment,
      app: {
        name: this.config.APP_NAME,
        version: this.config.APP_VERSION,
        url: this.config.APP_URL,
      },
      features: {
        registration: this.config.FEATURE_REGISTRATION_ENABLED,
        emailVerification: this.config.FEATURE_EMAIL_VERIFICATION,
        twoFactorAuth: this.config.FEATURE_TWO_FACTOR_AUTH,
        analytics: this.config.FEATURE_ANALYTICS,
        rateLimiting: this.config.FEATURE_RATE_LIMITING,
      },
      services: {
        database: !!this.config.DATABASE_URL,
        redis: !!this.config.REDIS_URL,
        evolutionApi: !!this.config.EVOLUTION_API_URL,
        email: !!this.config.SMTP_HOST,
        storage: this.config.STORAGE_TYPE,
      },
    };
  }
}

// Export singleton instance
export const config = ConfigManager.getInstance();

// Export individual configurations for convenience
export const databaseConfig = config.getDatabaseConfig();
export const redisConfig = config.getRedisConfig();
export const jwtConfig = config.getJWTConfig();
export const emailConfig = config.getEmailConfig();
export const storageConfig = config.getStorageConfig();
export const rateLimitConfig = config.getRateLimitConfig();
export const corsConfig = config.getCORSConfig();
export const cacheConfig = config.getCacheConfig();
export const monitoringConfig = config.getMonitoringConfig();
export const securityConfig = config.getSecurityConfig();

// Validate configuration on import
config.validateRequiredSecrets();

export default config;