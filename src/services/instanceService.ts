import { prisma } from '@/lib/prisma';
import { redis } from '@/lib/redis';
import { evolutionService } from './evolutionService';
import { ZapinError, ErrorCodes, PLAN_CONFIGS } from '@/types';
import { InstanceStatus, PlanType, Instance, Tenant } from '@prisma/client';
import { randomBytes } from 'crypto';
import { z } from 'zod';

// Validation schemas
export const CreateInstanceSchema = z.object({
  name: z.string().min(1).max(50).regex(/^[a-zA-Z0-9_-]+$/, 'Name can only contain letters, numbers, hyphens, and underscores'),
  webhookUrl: z.string().url().optional(),
  settings: z.object({
    rejectCall: z.boolean().default(false),
    msgCall: z.string().optional(),
    groupsIgnore: z.boolean().default(false),
    alwaysOnline: z.boolean().default(false),
    readMessages: z.boolean().default(false),
    readStatus: z.boolean().default(false),
    syncFullHistory: z.boolean().default(false),
  }).optional(),
});

export const UpdateInstanceSchema = z.object({
  name: z.string().min(1).max(50).regex(/^[a-zA-Z0-9_-]+$/).optional(),
  webhookUrl: z.string().url().nullable().optional(),
  settings: z.object({
    rejectCall: z.boolean().optional(),
    msgCall: z.string().optional(),
    groupsIgnore: z.boolean().optional(),
    alwaysOnline: z.boolean().optional(),
    readMessages: z.boolean().optional(),
    readStatus: z.boolean().optional(),
    syncFullHistory: z.boolean().optional(),
  }).optional(),
  isActive: z.boolean().optional(),
});

export interface CreateInstanceRequest {
  name: string;
  webhookUrl?: string;
  settings?: {
    rejectCall?: boolean;
    msgCall?: string;
    groupsIgnore?: boolean;
    alwaysOnline?: boolean;
    readMessages?: boolean;
    readStatus?: boolean;
    syncFullHistory?: boolean;
  };
}

export interface UpdateInstanceRequest {
  name?: string;
  webhookUrl?: string | null;
  settings?: {
    rejectCall?: boolean;
    msgCall?: string;
    groupsIgnore?: boolean;
    alwaysOnline?: boolean;
    readMessages?: boolean;
    readStatus?: boolean;
    syncFullHistory?: boolean;
  };
  isActive?: boolean;
}

export interface InstanceWithStats {
  id: string;
  name: string;
  evolutionKey: string;
  evolutionInstanceId: string;
  phoneNumber: string | null;
  status: InstanceStatus;
  qrCode: string | null;
  settings: any;
  webhookUrl: string | null;
  isActive: boolean;
  lastConnectedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  tenantId: string;
  _count: {
    messageLogs: number;
    bots: number;
  };
  tenant: {
    name: string;
    plan: PlanType;
  };
}

export interface QRCodeData {
  base64: string;
  code: string;
  expiresAt: Date;
}

export interface InstanceConnectionInfo {
  status: InstanceStatus;
  phoneNumber?: string;
  profileName?: string;
  profilePictureUrl?: string;
  lastConnectedAt?: Date;
  qrCode?: QRCodeData;
}

export class InstanceService {
  private readonly REDIS_PREFIX = 'instance:';
  private readonly QR_CODE_TTL = 300; // 5 minutes
  private readonly CONNECTION_CHECK_INTERVAL = 30000; // 30 seconds

  constructor() {
    // Start connection monitoring
    this.startConnectionMonitoring();
  }

  // Instance CRUD Operations
  async createInstance(tenantId: string, data: CreateInstanceRequest): Promise<Instance> {
    // Validate input
    const validatedData = CreateInstanceSchema.parse(data);

    // Check tenant exists and get plan
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      include: { instances: { where: { isActive: true } } },
    });

    if (!tenant) {
      throw new ZapinError(ErrorCodes.UNAUTHORIZED, 'Tenant not found', 404);
    }

    // Check instance quota
    const planConfig = PLAN_CONFIGS[tenant.plan];
    if (tenant.instances.length >= planConfig.instancesLimit) {
      throw new ZapinError(
        ErrorCodes.QUOTA_EXCEEDED,
        `Instance limit reached. Your ${tenant.plan} plan allows ${planConfig.instancesLimit} instances.`,
        403
      );
    }

    // Check if instance name is unique for tenant
    const existingInstance = await prisma.instance.findFirst({
      where: {
        tenantId,
        name: validatedData.name,
        isActive: true,
      },
    });

    if (existingInstance) {
      throw new ZapinError(ErrorCodes.VALIDATION_ERROR, 'Instance name already exists', 400);
    }

    // Generate unique keys
    const evolutionKey = this.generateEvolutionKey();
    const evolutionInstanceId = `${tenantId}_${validatedData.name}_${Date.now()}`;

    try {
      // Create instance in Evolution API
      const webhookUrl = validatedData.webhookUrl || `${process.env.WEBHOOK_BASE_URL}/webhook/${evolutionInstanceId}`;
      
      const evolutionPayload = {
        instanceName: evolutionInstanceId,
        integration: 'WHATSAPP-BAILEYS' as const,
        qrcode: true,
        webhook: {
          url: webhookUrl,
          byEvents: true,
          base64: false,
          events: [
            'QRCODE_UPDATED',
            'CONNECTION_UPDATE',
            'MESSAGES_UPSERT',
            'MESSAGES_UPDATE',
            'SEND_MESSAGE',
            'CONTACTS_UPDATE',
            'CONTACTS_UPSERT',
            'PRESENCE_UPDATE',
            'CHATS_UPDATE',
            'CHATS_UPSERT',
            'GROUPS_UPSERT',
            'GROUP_UPDATE',
            'GROUP_PARTICIPANTS_UPDATE',
            'NEW_JWT_TOKEN',
          ],
        },
        settings: validatedData.settings,
      };

      await evolutionService.createInstance(evolutionPayload);

      // Create instance in database
      const instance = await prisma.instance.create({
        data: {
          name: validatedData.name,
          evolutionKey,
          evolutionInstanceId,
          tenantId,
          status: InstanceStatus.CREATED,
          webhookUrl,
          settings: validatedData.settings || {},
          isActive: true,
        },
      });

      // Cache instance data
      await this.cacheInstanceData(instance);

      // Log audit event
      await this.logAuditEvent(tenantId, 'instance.created', instance.id, {
        instanceName: instance.name,
        evolutionInstanceId: instance.evolutionInstanceId,
      });

      return instance;
    } catch (error) {
      // Cleanup on failure
      try {
        await evolutionService.deleteInstance(evolutionInstanceId);
      } catch (cleanupError) {
        console.error('Failed to cleanup Evolution instance:', cleanupError);
      }

      if (error instanceof ZapinError) {
        throw error;
      }

      throw new ZapinError(
        ErrorCodes.EVOLUTION_API_ERROR,
        `Failed to create instance: ${error instanceof Error ? error.message : 'Unknown error'}`,
        500
      );
    }
  }

  async getInstanceById(tenantId: string, instanceId: string): Promise<InstanceWithStats | null> {
    const instance = await prisma.instance.findFirst({
      where: {
        id: instanceId,
        tenantId,
        isActive: true,
      },
      include: {
        _count: {
          select: {
            messageLogs: true,
            bots: true,
          },
        },
        tenant: {
          select: {
            name: true,
            plan: true,
          },
        },
      },
    });

    return instance;
  }

  async getInstanceByName(tenantId: string, name: string): Promise<Instance | null> {
    return prisma.instance.findFirst({
      where: {
        name,
        tenantId,
        isActive: true,
      },
    });
  }

  async getInstancesByTenant(tenantId: string): Promise<InstanceWithStats[]> {
    return prisma.instance.findMany({
      where: {
        tenantId,
        isActive: true,
      },
      include: {
        _count: {
          select: {
            messageLogs: true,
            bots: true,
          },
        },
        tenant: {
          select: {
            name: true,
            plan: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async updateInstance(tenantId: string, instanceId: string, data: UpdateInstanceRequest): Promise<Instance> {
    // Validate input
    const validatedData = UpdateInstanceSchema.parse(data);

    // Get existing instance
    const existingInstance = await this.getInstanceById(tenantId, instanceId);
    if (!existingInstance) {
      throw new ZapinError(ErrorCodes.INSTANCE_NOT_FOUND, 'Instance not found', 404);
    }

    // Check name uniqueness if changing name
    if (validatedData.name && validatedData.name !== existingInstance.name) {
      const nameExists = await prisma.instance.findFirst({
        where: {
          name: validatedData.name,
          tenantId,
          isActive: true,
          id: { not: instanceId },
        },
      });

      if (nameExists) {
        throw new ZapinError(ErrorCodes.VALIDATION_ERROR, 'Instance name already exists', 400);
      }
    }

    try {
      // Update Evolution API settings if provided
      if (validatedData.settings) {
        await evolutionService.updateInstanceSettings(
          existingInstance.evolutionInstanceId,
          validatedData.settings
        );
      }

      // Update webhook if provided
      if (validatedData.webhookUrl !== undefined) {
        const webhookUrl = validatedData.webhookUrl || 
          `${process.env.WEBHOOK_BASE_URL}/webhook/${existingInstance.evolutionInstanceId}`;
        
        await evolutionService.setWebhook(existingInstance.evolutionInstanceId, {
          url: webhookUrl,
          byEvents: true,
          base64: false,
          events: [
            'QRCODE_UPDATED',
            'CONNECTION_UPDATE',
            'MESSAGES_UPSERT',
            'MESSAGES_UPDATE',
            'SEND_MESSAGE',
            'CONTACTS_UPDATE',
            'CONTACTS_UPSERT',
            'PRESENCE_UPDATE',
            'CHATS_UPDATE',
            'CHATS_UPSERT',
            'GROUPS_UPSERT',
            'GROUP_UPDATE',
            'GROUP_PARTICIPANTS_UPDATE',
            'NEW_JWT_TOKEN',
          ],
        });
      }

      // Update database
      const updatedInstance = await prisma.instance.update({
        where: { id: instanceId },
        data: {
          ...(validatedData.name && { name: validatedData.name }),
          ...(validatedData.webhookUrl !== undefined && { webhookUrl: validatedData.webhookUrl }),
          ...(validatedData.settings && {
            settings: {
              ...(existingInstance.settings as object || {}),
              ...validatedData.settings,
            },
          }),
          ...(validatedData.isActive !== undefined && { isActive: validatedData.isActive }),
          updatedAt: new Date(),
        },
      });

      // Update cache
      await this.cacheInstanceData(updatedInstance);

      // Log audit event
      await this.logAuditEvent(tenantId, 'instance.updated', instanceId, validatedData);

      return updatedInstance;
    } catch (error) {
      if (error instanceof ZapinError) {
        throw error;
      }

      throw new ZapinError(
        ErrorCodes.EVOLUTION_API_ERROR,
        `Failed to update instance: ${error instanceof Error ? error.message : 'Unknown error'}`,
        500
      );
    }
  }

  async deleteInstance(tenantId: string, instanceId: string): Promise<void> {
    // Get existing instance
    const instance = await this.getInstanceById(tenantId, instanceId);
    if (!instance) {
      throw new ZapinError(ErrorCodes.INSTANCE_NOT_FOUND, 'Instance not found', 404);
    }

    try {
      // Delete from Evolution API
      await evolutionService.deleteInstance(instance.evolutionInstanceId);

      // Soft delete in database
      await prisma.instance.update({
        where: { id: instanceId },
        data: {
          isActive: false,
          updatedAt: new Date(),
        },
      });

      // Remove from cache
      await this.removeCachedInstanceData(instance.evolutionInstanceId);

      // Log audit event
      await this.logAuditEvent(tenantId, 'instance.deleted', instanceId, {
        instanceName: instance.name,
        evolutionInstanceId: instance.evolutionInstanceId,
      });
    } catch (error) {
      if (error instanceof ZapinError) {
        throw error;
      }

      throw new ZapinError(
        ErrorCodes.EVOLUTION_API_ERROR,
        `Failed to delete instance: ${error instanceof Error ? error.message : 'Unknown error'}`,
        500
      );
    }
  }

  // Connection Management
  async connectInstance(tenantId: string, instanceId: string): Promise<InstanceConnectionInfo> {
    const instance = await this.getInstanceById(tenantId, instanceId);
    if (!instance) {
      throw new ZapinError(ErrorCodes.INSTANCE_NOT_FOUND, 'Instance not found', 404);
    }

    try {
      // Connect via Evolution API
      const connectionState = await evolutionService.connectInstance(instance.evolutionInstanceId);

      // Update instance status
      const status = this.mapEvolutionStatusToInstanceStatus(connectionState.instance.status);
      
      await prisma.instance.update({
        where: { id: instanceId },
        data: {
          status,
          ...(connectionState.qrcode && { qrCode: connectionState.qrcode.base64 }),
          updatedAt: new Date(),
        },
      });

      // Cache QR code if available
      if (connectionState.qrcode) {
        await this.cacheQRCode(instance.evolutionInstanceId, {
          base64: connectionState.qrcode.base64,
          code: connectionState.qrcode.code,
          expiresAt: new Date(Date.now() + this.QR_CODE_TTL * 1000),
        });
      }

      return {
        status,
        qrCode: connectionState.qrcode ? {
          base64: connectionState.qrcode.base64,
          code: connectionState.qrcode.code,
          expiresAt: new Date(Date.now() + this.QR_CODE_TTL * 1000),
        } : undefined,
      };
    } catch (error) {
      if (error instanceof ZapinError) {
        throw error;
      }

      throw new ZapinError(
        ErrorCodes.EVOLUTION_API_ERROR,
        `Failed to connect instance: ${error instanceof Error ? error.message : 'Unknown error'}`,
        500
      );
    }
  }

  async restartInstance(tenantId: string, instanceId: string): Promise<void> {
    const instance = await this.getInstanceById(tenantId, instanceId);
    if (!instance) {
      throw new ZapinError(ErrorCodes.INSTANCE_NOT_FOUND, 'Instance not found', 404);
    }

    try {
      await evolutionService.restartInstance(instance.evolutionInstanceId);

      // Update status to connecting
      await prisma.instance.update({
        where: { id: instanceId },
        data: {
          status: InstanceStatus.CONNECTING,
          updatedAt: new Date(),
        },
      });

      // Log audit event
      await this.logAuditEvent(tenantId, 'instance.restarted', instanceId, {
        instanceName: instance.name,
      });
    } catch (error) {
      if (error instanceof ZapinError) {
        throw error;
      }

      throw new ZapinError(
        ErrorCodes.EVOLUTION_API_ERROR,
        `Failed to restart instance: ${error instanceof Error ? error.message : 'Unknown error'}`,
        500
      );
    }
  }

  async logoutInstance(tenantId: string, instanceId: string): Promise<void> {
    const instance = await this.getInstanceById(tenantId, instanceId);
    if (!instance) {
      throw new ZapinError(ErrorCodes.INSTANCE_NOT_FOUND, 'Instance not found', 404);
    }

    try {
      await evolutionService.logoutInstance(instance.evolutionInstanceId);

      // Update status to disconnected
      await prisma.instance.update({
        where: { id: instanceId },
        data: {
          status: InstanceStatus.DISCONNECTED,
          phoneNumber: null,
          qrCode: null,
          lastConnectedAt: null,
          updatedAt: new Date(),
        },
      });

      // Remove cached data
      await this.removeCachedQRCode(instance.evolutionInstanceId);

      // Log audit event
      await this.logAuditEvent(tenantId, 'instance.logout', instanceId, {
        instanceName: instance.name,
      });
    } catch (error) {
      if (error instanceof ZapinError) {
        throw error;
      }

      throw new ZapinError(
        ErrorCodes.EVOLUTION_API_ERROR,
        `Failed to logout instance: ${error instanceof Error ? error.message : 'Unknown error'}`,
        500
      );
    }
  }

  async getConnectionState(tenantId: string, instanceId: string): Promise<InstanceConnectionInfo> {
    const instance = await this.getInstanceById(tenantId, instanceId);
    if (!instance) {
      throw new ZapinError(ErrorCodes.INSTANCE_NOT_FOUND, 'Instance not found', 404);
    }

    try {
      const connectionState = await evolutionService.getConnectionState(instance.evolutionInstanceId);
      const status = this.mapEvolutionStatusToInstanceStatus(connectionState.instance.status);

      // Get cached QR code if available
      const cachedQRCode = await this.getCachedQRCode(instance.evolutionInstanceId);

      return {
        status,
        phoneNumber: instance.phoneNumber || undefined,
        lastConnectedAt: instance.lastConnectedAt || undefined,
        qrCode: cachedQRCode || (connectionState.qrcode ? {
          base64: connectionState.qrcode.base64,
          code: connectionState.qrcode.code,
          expiresAt: new Date(Date.now() + this.QR_CODE_TTL * 1000),
        } : undefined),
      };
    } catch (error) {
      if (error instanceof ZapinError) {
        throw error;
      }

      throw new ZapinError(
        ErrorCodes.EVOLUTION_API_ERROR,
        `Failed to get connection state: ${error instanceof Error ? error.message : 'Unknown error'}`,
        500
      );
    }
  }

  async refreshQRCode(tenantId: string, instanceId: string): Promise<QRCodeData | null> {
    const instance = await this.getInstanceById(tenantId, instanceId);
    if (!instance) {
      throw new ZapinError(ErrorCodes.INSTANCE_NOT_FOUND, 'Instance not found', 404);
    }

    if (instance.status === InstanceStatus.CONNECTED) {
      throw new ZapinError(ErrorCodes.VALIDATION_ERROR, 'Instance is already connected', 400);
    }

    try {
      const connectionState = await evolutionService.connectInstance(instance.evolutionInstanceId);

      if (connectionState.qrcode) {
        const qrCodeData: QRCodeData = {
          base64: connectionState.qrcode.base64,
          code: connectionState.qrcode.code,
          expiresAt: new Date(Date.now() + this.QR_CODE_TTL * 1000),
        };

        // Cache the new QR code
        await this.cacheQRCode(instance.evolutionInstanceId, qrCodeData);

        // Update instance with new QR code
        await prisma.instance.update({
          where: { id: instanceId },
          data: {
            qrCode: qrCodeData.base64,
            status: InstanceStatus.CONNECTING,
            updatedAt: new Date(),
          },
        });

        return qrCodeData;
      }

      return null;
    } catch (error) {
      if (error instanceof ZapinError) {
        throw error;
      }

      throw new ZapinError(
        ErrorCodes.EVOLUTION_API_ERROR,
        `Failed to refresh QR code: ${error instanceof Error ? error.message : 'Unknown error'}`,
        500
      );
    }
  }

  // Webhook handling
  async handleWebhookEvent(instanceId: string, event: string, data: any): Promise<void> {
    const instance = await prisma.instance.findUnique({
      where: { evolutionInstanceId: instanceId },
    });

    if (!instance) {
      console.warn(`Webhook received for unknown instance: ${instanceId}`);
      return;
    }

    try {
      switch (event) {
        case 'QRCODE_UPDATED':
          await this.handleQRCodeUpdate(instance, data);
          break;
        case 'CONNECTION_UPDATE':
          await this.handleConnectionUpdate(instance, data);
          break;
        case 'MESSAGES_UPSERT':
          await this.handleMessageUpsert(instance, data);
          break;
        default:
          console.log(`Unhandled webhook event: ${event} for instance: ${instanceId}`);
      }
    } catch (error) {
      console.error(`Error handling webhook event ${event} for instance ${instanceId}:`, error);
    }
  }

  // Private helper methods
  private generateEvolutionKey(): string {
    return randomBytes(32).toString('hex');
  }

  private mapEvolutionStatusToInstanceStatus(evolutionStatus: string): InstanceStatus {
    switch (evolutionStatus) {
      case 'open':
        return InstanceStatus.CONNECTED;
      case 'connecting':
        return InstanceStatus.CONNECTING;
      case 'close':
        return InstanceStatus.DISCONNECTED;
      default:
        return InstanceStatus.ERROR;
    }
  }

  private async cacheInstanceData(instance: Instance): Promise<void> {
    const key = `${this.REDIS_PREFIX}${instance.evolutionInstanceId}`;
    await redis.setex(key, 3600, JSON.stringify(instance)); // Cache for 1 hour
  }

  private async removeCachedInstanceData(evolutionInstanceId: string): Promise<void> {
    const key = `${this.REDIS_PREFIX}${evolutionInstanceId}`;
    await redis.del(key);
  }

  private async cacheQRCode(evolutionInstanceId: string, qrCodeData: QRCodeData): Promise<void> {
    const key = `${this.REDIS_PREFIX}qr:${evolutionInstanceId}`;
    await redis.setex(key, this.QR_CODE_TTL, JSON.stringify(qrCodeData));
  }

  private async getCachedQRCode(evolutionInstanceId: string): Promise<QRCodeData | null> {
    const key = `${this.REDIS_PREFIX}qr:${evolutionInstanceId}`;
    const cached = await redis.get(key);
    
    if (cached) {
      const qrCodeData = JSON.parse(cached) as QRCodeData;
      // Check if expired
      if (new Date(qrCodeData.expiresAt) > new Date()) {
        return qrCodeData;
      } else {
        await redis.del(key);
      }
    }
    
    return null;
  }

  private async removeCachedQRCode(evolutionInstanceId: string): Promise<void> {
    const key = `${this.REDIS_PREFIX}qr:${evolutionInstanceId}`;
    await redis.del(key);
  }

  private async handleQRCodeUpdate(instance: Instance, data: any): Promise<void> {
    if (data.qrcode) {
      const qrCodeData: QRCodeData = {
        base64: data.qrcode.base64,
        code: data.qrcode.code,
        expiresAt: new Date(Date.now() + this.QR_CODE_TTL * 1000),
      };

      await this.cacheQRCode(instance.evolutionInstanceId, qrCodeData);

      await prisma.instance.update({
        where: { id: instance.id },
        data: {
          qrCode: qrCodeData.base64,
          status: InstanceStatus.CONNECTING,
          updatedAt: new Date(),
        },
      });
    }
  }

  private async handleConnectionUpdate(instance: Instance, data: any): Promise<void> {
    const status = this.mapEvolutionStatusToInstanceStatus(data.state);
    
    const updateData: any = {
      status,
      updatedAt: new Date(),
    };

    if (status === InstanceStatus.CONNECTED) {
      updateData.lastConnectedAt = new Date();
      updateData.qrCode = null; // Clear QR code when connected
      await this.removeCachedQRCode(instance.evolutionInstanceId);
    }

    await prisma.instance.update({
      where: { id: instance.id },
      data: updateData,
    });
  }

  private async handleMessageUpsert(instance: Instance, data: any): Promise<void> {
    // This would handle incoming messages for logging/analytics
    // Implementation depends on specific requirements
    console.log(`Message received for instance ${instance.name}:`, data);
  }

  private async logAuditEvent(tenantId: string, action: string, resourceId: string, metadata: any): Promise<void> {
    // This would log audit events - implementation depends on audit requirements
    console.log(`Audit: ${action} on ${resourceId} for tenant ${tenantId}`, metadata);
  }

  private async startConnectionMonitoring(): Promise<void> {
    setInterval(async () => {
      try {
        // Get all active instances
        const instances = await prisma.instance.findMany({
          where: {
            isActive: true,
            status: { in: [InstanceStatus.CONNECTED, InstanceStatus.CONNECTING] },
          },
        });

        // Check connection status for each instance
        for (const instance of instances) {
          try {
            const connectionState = await evolutionService.getConnectionState(instance.evolutionInstanceId);
            const newStatus = this.mapEvolutionStatusToInstanceStatus(connectionState.instance.status);

            if (newStatus !== instance.status) {
              await prisma.instance.update({
                where: { id: instance.id },
                data: {
                  status: newStatus,
                  updatedAt: new Date(),
                },
              });
            }
          } catch (error) {
            console.error(`Failed to check connection for instance ${instance.name}:`, error);
          }
        }
      } catch (error) {
        console.error('Connection monitoring error:', error);
      }
    }, this.CONNECTION_CHECK_INTERVAL);
  }
}

// Singleton instance
export const instanceService = new InstanceService();