import { User, Tenant, Instance, Bot, ApiKey, QuotaUsage, MessageLog } from '@prisma/client';

// Extended types with relations
export type UserWithTenant = User & {
  tenant: Tenant;
};

export type TenantWithUsers = Tenant & {
  users: User[];
  instances: Instance[];
  bots: Bot[];
  apiKeys: ApiKey[];
};

export type InstanceWithBots = Instance & {
  bots: Bot[];
  _count: {
    messageLogs: number;
  };
};

export type BotWithInstance = Bot & {
  instance: Instance;
};

export type ApiKeyWithTenant = ApiKey & {
  tenant: Tenant;
  user: User;
};

// Authentication types
export interface AuthResult {
  success: boolean;
  user?: UserWithTenant;
  tenant?: Tenant;
  apiKey?: ApiKey;
  authType?: 'jwt' | 'api_key';
  error?: string;
}

export interface JWTPayload {
  userId: string;
  tenantId: string;
  role: string;
  iat?: number;
  exp?: number;
}

// API Request/Response types
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
  quota?: QuotaInfo;
}

export interface QuotaInfo {
  hourly: { remaining: number; limit: number; resetAt: string };
  daily: { remaining: number; limit: number; resetAt: string };
  monthly: { remaining: number; limit: number; resetAt: string };
}

export interface QuotaResult {
  allowed: boolean;
  limits: {
    hourly: { remaining: number; limit: number; resetAt: Date };
    daily: { remaining: number; limit: number; resetAt: Date };
    monthly: { remaining: number; limit: number; resetAt: Date };
  };
  mostRestrictive: 'hourly' | 'daily' | 'monthly';
}

// Evolution API types
export interface EvolutionApiResponse<T = any> {
  status: number;
  data: T;
  headers: Record<string, string>;
}

export interface SendTextMessageRequest {
  instanceId: string;
  recipient: string;
  text: string;
  delay?: number;
  quoted?: {
    key: {
      id: string;
    };
  };
  mentionsEveryOne?: boolean;
  mentioned?: string[];
}

export interface SendMediaMessageRequest {
  instanceId: string;
  recipient: string;
  mediatype: 'image' | 'video' | 'audio' | 'document';
  media: string; // base64 or URL
  caption?: string;
  fileName?: string;
  delay?: number;
}

export interface CreateInstanceRequest {
  instanceName: string;
  integration?: 'WHATSAPP-BAILEYS';
  qrcode?: boolean;
  webhook?: {
    url: string;
    byEvents: boolean;
    events: string[];
  };
}

export interface InstanceConnectionState {
  state: 'open' | 'connecting' | 'close';
  qrcode?: {
    base64: string;
    code: string;
  };
}

// Bot types
export interface CreateTypebotRequest {
  tenantId: string;
  instanceId: string;
  name: string;
  typebotUrl: string;
  typebotId: string;
  triggerType: 'all' | 'keyword';
  triggerValue?: string;
  settings: TypebotSettings;
}

export interface TypebotSettings {
  enabled: boolean;
  expire?: number;
  keywordFinish?: string;
  delayMessage?: number;
  unknownMessage?: string;
  listeningFromMe?: boolean;
  stopBotFromMe?: boolean;
  keepOpen?: boolean;
  debounceTime?: number;
}

export interface CreateOpenAIBotRequest {
  tenantId: string;
  instanceId: string;
  name: string;
  model: string;
  systemPrompt: string;
  triggerType: 'all' | 'keyword';
  triggerValue?: string;
  settings: OpenAISettings;
}

export interface OpenAISettings {
  apiKey: string;
  maxTokens?: number;
  temperature?: number;
  topP?: number;
  presencePenalty?: number;
  frequencyPenalty?: number;
  expire?: number;
  keywordFinish?: string;
  delayMessage?: number;
  unknownMessage?: string;
  listeningFromMe?: boolean;
  stopBotFromMe?: boolean;
  keepOpen?: boolean;
  debounceTime?: number;
}

// Dashboard types
export interface DashboardOverview {
  instances: {
    total: number;
    connected: number;
  };
  messages: {
    today: number;
    thisMonth: number;
  };
  bots: {
    active: number;
  };
  quota: QuotaInfo;
  billing: {
    currentMonth: number;
    status: string;
  };
}

export interface InstanceAnalytics {
  messageStats: Array<{
    status: string;
    _count: number;
  }>;
  hourlyStats: Array<{
    hour: string;
    count: number;
  }>;
  period: '24h' | '7d' | '30d';
}

// Error types
export enum ErrorCodes {
  // Authentication Errors
  UNAUTHORIZED = 'UNAUTHORIZED',
  INVALID_API_KEY = 'INVALID_API_KEY',
  API_KEY_EXPIRED = 'API_KEY_EXPIRED',
  INSUFFICIENT_PERMISSIONS = 'INSUFFICIENT_PERMISSIONS',
  
  // Quota Errors
  QUOTA_EXCEEDED = 'QUOTA_EXCEEDED',
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  
  // Instance Errors
  INSTANCE_NOT_FOUND = 'INSTANCE_NOT_FOUND',
  INSTANCE_NOT_CONNECTED = 'INSTANCE_NOT_CONNECTED',
  INSTANCE_ACCESS_DENIED = 'INSTANCE_ACCESS_DENIED',
  
  // Message Errors
  INVALID_RECIPIENT = 'INVALID_RECIPIENT',
  MESSAGE_TOO_LONG = 'MESSAGE_TOO_LONG',
  INVALID_MEDIA_TYPE = 'INVALID_MEDIA_TYPE',
  
  // Evolution API Errors
  EVOLUTION_API_ERROR = 'EVOLUTION_API_ERROR',
  EVOLUTION_API_TIMEOUT = 'EVOLUTION_API_TIMEOUT',
  EVOLUTION_API_UNAVAILABLE = 'EVOLUTION_API_UNAVAILABLE',
  
  // System Errors
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  DATABASE_ERROR = 'DATABASE_ERROR',
  REDIS_ERROR = 'REDIS_ERROR',
  VALIDATION_ERROR = 'VALIDATION_ERROR'
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

// Plan configuration types
export interface PlanConfig {
  messagesPerHour: number;
  messagesPerDay: number;
  messagesPerMonth: number;
  instancesLimit: number;
  botsLimit: number;
  apiCallsPerHour: number;
  features: string[];
}

export const PLAN_CONFIGS: Record<string, PlanConfig> = {
  BASIC: {
    messagesPerHour: 100,
    messagesPerDay: 1000,
    messagesPerMonth: 10000,
    instancesLimit: 1,
    botsLimit: 2,
    apiCallsPerHour: 500,
    features: ['basic_messaging', 'webhook_support']
  },
  PRO: {
    messagesPerHour: 1000,
    messagesPerDay: 10000,
    messagesPerMonth: 100000,
    instancesLimit: 5,
    botsLimit: 10,
    apiCallsPerHour: 5000,
    features: ['basic_messaging', 'webhook_support', 'bot_integration', 'analytics']
  },
  ENTERPRISE: {
    messagesPerHour: 10000,
    messagesPerDay: 100000,
    messagesPerMonth: 1000000,
    instancesLimit: 50,
    botsLimit: 100,
    apiCallsPerHour: 50000,
    features: ['basic_messaging', 'webhook_support', 'bot_integration', 'analytics', 'priority_support', 'custom_integrations']
  }
};

// Webhook types
export interface WebhookEvent {
  event: string;
  instance: string;
  data: any;
  destination: string;
  date_time: string;
  sender: string;
  server_url: string;
}

export interface MessageWebhookData {
  key: {
    remoteJid: string;
    fromMe: boolean;
    id: string;
  };
  message: any;
  messageTimestamp: number;
  status?: string;
}

export interface ConnectionWebhookData {
  state: 'open' | 'connecting' | 'close';
  statusReason?: number;
}
