import { InstanceService } from '../../../src/services/instanceService';
import { TestDataFactory, TestUtils, MockImplementations } from '../../helpers/test-helpers';

// Mock dependencies
const mockPrisma = MockImplementations.createMockPrismaClient();
const mockRedis = MockImplementations.createMockRedisClient();
const mockEvolutionService = MockImplementations.createMockEvolutionService();
const mockLogger = MockImplementations.createMockLogger();

jest.mock('../../../src/lib/prisma', () => ({
  prisma: mockPrisma,
}));

jest.mock('../../../src/lib/redis', () => ({
  redis: mockRedis,
}));

jest.mock('../../../src/services/evolutionService', () => ({
  EvolutionService: mockEvolutionService,
}));

describe('InstanceService', () => {
  let instanceService: InstanceService;

  beforeEach(() => {
    instanceService = new InstanceService();
    jest.clearAllMocks();
  });

  describe('createInstance', () => {
    it('should successfully create a new instance', async () => {
      // Arrange
      const tenantId = 'tenant-id';
      const instanceData = {
        name: 'Test Instance',
        phoneNumber: '+6281234567890',
        webhookUrl: 'https://example.com/webhook',
      };

      const mockEvolutionResponse = {
        instanceName: 'test-instance',
        evolutionKey: 'evolution-key-123',
        evolutionInstanceId: 'evolution-instance-id',
        status: 'created',
      };

      const mockInstance = TestDataFactory.createInstanceData({
        name: instanceData.name,
        phoneNumber: instanceData.phoneNumber,
        tenantId,
        evolutionKey: mockEvolutionResponse.evolutionKey,
        evolutionInstanceId: mockEvolutionResponse.evolutionInstanceId,
      });

      mockEvolutionService.createInstance.mockResolvedValue(mockEvolutionResponse);
      mockPrisma.instance.create.mockResolvedValue(mockInstance);

      // Act
      const result = await instanceService.createInstance(tenantId, instanceData);

      // Assert
      expect(mockEvolutionService.createInstance).toHaveBeenCalledWith({
        instanceName: expect.any(String),
        phoneNumber: instanceData.phoneNumber,
        webhookUrl: instanceData.webhookUrl,
      });
      expect(mockPrisma.instance.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          name: instanceData.name,
          phoneNumber: instanceData.phoneNumber,
          tenantId,
          evolutionKey: mockEvolutionResponse.evolutionKey,
          evolutionInstanceId: mockEvolutionResponse.evolutionInstanceId,
          status: 'DISCONNECTED',
        }),
      });
      expect(result).toEqual(mockInstance);
    });

    it('should throw error if phone number already exists', async () => {
      // Arrange
      const tenantId = 'tenant-id';
      const instanceData = {
        name: 'Test Instance',
        phoneNumber: '+6281234567890',
        webhookUrl: 'https://example.com/webhook',
      };

      const prismaError = new Error('Unique constraint failed');
      (prismaError as any).code = 'P2002';
      mockPrisma.instance.create.mockRejectedValue(prismaError);

      // Act & Assert
      await expect(instanceService.createInstance(tenantId, instanceData))
        .rejects.toThrow('Phone number already exists');
    });

    it('should validate phone number format', async () => {
      // Arrange
      const tenantId = 'tenant-id';
      const instanceData = {
        name: 'Test Instance',
        phoneNumber: 'invalid-phone',
        webhookUrl: 'https://example.com/webhook',
      };

      // Act & Assert
      await expect(instanceService.createInstance(tenantId, instanceData))
        .rejects.toThrow('Invalid phone number format');
    });

    it('should validate webhook URL format', async () => {
      // Arrange
      const tenantId = 'tenant-id';
      const instanceData = {
        name: 'Test Instance',
        phoneNumber: '+6281234567890',
        webhookUrl: 'invalid-url',
      };

      // Act & Assert
      await expect(instanceService.createInstance(tenantId, instanceData))
        .rejects.toThrow('Invalid webhook URL format');
    });
  });

  describe('getInstances', () => {
    it('should return paginated instances for tenant', async () => {
      // Arrange
      const tenantId = 'tenant-id';
      const options = {
        page: 1,
        limit: 10,
        search: 'test',
        status: 'CONNECTED' as const,
      };

      const mockInstances = [
        TestDataFactory.createInstanceData({ tenantId }),
        TestDataFactory.createInstanceData({ tenantId }),
      ];

      const mockCount = 2;

      mockPrisma.instance.findMany.mockResolvedValue(mockInstances);
      mockPrisma.instance.count.mockResolvedValue(mockCount);

      // Act
      const result = await instanceService.getInstances(tenantId, options);

      // Assert
      expect(mockPrisma.instance.findMany).toHaveBeenCalledWith({
        where: {
          tenantId,
          AND: [
            {
              OR: [
                { name: { contains: options.search, mode: 'insensitive' } },
                { phoneNumber: { contains: options.search } },
              ],
            },
            { status: options.status },
          ],
        },
        skip: 0,
        take: options.limit,
        orderBy: { createdAt: 'desc' },
      });
      expect(result).toEqual({
        instances: mockInstances,
        pagination: {
          page: options.page,
          limit: options.limit,
          total: mockCount,
          totalPages: 1,
        },
      });
    });

    it('should return instances without filters', async () => {
      // Arrange
      const tenantId = 'tenant-id';
      const options = {};

      const mockInstances = [TestDataFactory.createInstanceData({ tenantId })];
      const mockCount = 1;

      mockPrisma.instance.findMany.mockResolvedValue(mockInstances);
      mockPrisma.instance.count.mockResolvedValue(mockCount);

      // Act
      const result = await instanceService.getInstances(tenantId, options);

      // Assert
      expect(mockPrisma.instance.findMany).toHaveBeenCalledWith({
        where: { tenantId },
        skip: 0,
        take: 20,
        orderBy: { createdAt: 'desc' },
      });
      expect(result.instances).toEqual(mockInstances);
    });
  });

  describe('getInstanceById', () => {
    it('should return instance by id for tenant', async () => {
      // Arrange
      const tenantId = 'tenant-id';
      const instanceId = 'instance-id';

      const mockInstance = TestDataFactory.createInstanceData({
        id: instanceId,
        tenantId,
      });

      mockPrisma.instance.findUnique.mockResolvedValue(mockInstance);

      // Act
      const result = await instanceService.getInstanceById(tenantId, instanceId);

      // Assert
      expect(mockPrisma.instance.findUnique).toHaveBeenCalledWith({
        where: {
          id: instanceId,
          tenantId,
        },
      });
      expect(result).toEqual(mockInstance);
    });

    it('should return null if instance not found', async () => {
      // Arrange
      const tenantId = 'tenant-id';
      const instanceId = 'non-existent-id';

      mockPrisma.instance.findUnique.mockResolvedValue(null);

      // Act
      const result = await instanceService.getInstanceById(tenantId, instanceId);

      // Assert
      expect(result).toBeNull();
    });
  });

  describe('updateInstance', () => {
    it('should successfully update instance', async () => {
      // Arrange
      const tenantId = 'tenant-id';
      const instanceId = 'instance-id';
      const updateData = {
        name: 'Updated Instance',
        webhookUrl: 'https://updated.com/webhook',
      };

      const mockUpdatedInstance = TestDataFactory.createInstanceData({
        id: instanceId,
        tenantId,
        name: updateData.name,
        webhookUrl: updateData.webhookUrl,
      });

      mockPrisma.instance.update.mockResolvedValue(mockUpdatedInstance);

      // Act
      const result = await instanceService.updateInstance(tenantId, instanceId, updateData);

      // Assert
      expect(mockPrisma.instance.update).toHaveBeenCalledWith({
        where: {
          id: instanceId,
          tenantId,
        },
        data: {
          name: updateData.name,
          webhookUrl: updateData.webhookUrl,
          updatedAt: expect.any(Date),
        },
      });
      expect(result).toEqual(mockUpdatedInstance);
    });

    it('should throw error if instance not found', async () => {
      // Arrange
      const tenantId = 'tenant-id';
      const instanceId = 'non-existent-id';
      const updateData = { name: 'Updated Instance' };

      const prismaError = new Error('Record not found');
      (prismaError as any).code = 'P2025';
      mockPrisma.instance.update.mockRejectedValue(prismaError);

      // Act & Assert
      await expect(instanceService.updateInstance(tenantId, instanceId, updateData))
        .rejects.toThrow('Instance not found');
    });
  });

  describe('deleteInstance', () => {
    it('should successfully delete instance', async () => {
      // Arrange
      const tenantId = 'tenant-id';
      const instanceId = 'instance-id';

      const mockInstance = TestDataFactory.createInstanceData({
        id: instanceId,
        tenantId,
        evolutionInstanceId: 'evolution-instance-id',
      });

      mockPrisma.instance.findUnique.mockResolvedValue(mockInstance);
      mockEvolutionService.deleteInstance.mockResolvedValue({ success: true });
      mockPrisma.instance.delete.mockResolvedValue(mockInstance);

      // Act
      await instanceService.deleteInstance(tenantId, instanceId);

      // Assert
      expect(mockPrisma.instance.findUnique).toHaveBeenCalledWith({
        where: { id: instanceId, tenantId },
      });
      expect(mockEvolutionService.deleteInstance).toHaveBeenCalledWith(
        mockInstance.evolutionInstanceId
      );
      expect(mockPrisma.instance.delete).toHaveBeenCalledWith({
        where: { id: instanceId, tenantId },
      });
    });

    it('should throw error if instance not found', async () => {
      // Arrange
      const tenantId = 'tenant-id';
      const instanceId = 'non-existent-id';

      mockPrisma.instance.findUnique.mockResolvedValue(null);

      // Act & Assert
      await expect(instanceService.deleteInstance(tenantId, instanceId))
        .rejects.toThrow('Instance not found');
    });
  });

  describe('connectInstance', () => {
    it('should successfully connect instance', async () => {
      // Arrange
      const tenantId = 'tenant-id';
      const instanceId = 'instance-id';

      const mockInstance = TestDataFactory.createInstanceData({
        id: instanceId,
        tenantId,
        evolutionInstanceId: 'evolution-instance-id',
        status: 'DISCONNECTED',
      });

      const mockQRCode = 'data:image/png;base64,qr-code-data';

      mockPrisma.instance.findUnique.mockResolvedValue(mockInstance);
      mockEvolutionService.connectInstance.mockResolvedValue({ success: true });
      mockEvolutionService.getQRCode.mockResolvedValue({ qrCode: mockQRCode });
      mockPrisma.instance.update.mockResolvedValue({
        ...mockInstance,
        status: 'CONNECTING',
        qrCode: mockQRCode,
      });

      // Act
      const result = await instanceService.connectInstance(tenantId, instanceId);

      // Assert
      expect(mockEvolutionService.connectInstance).toHaveBeenCalledWith(
        mockInstance.evolutionInstanceId
      );
      expect(mockPrisma.instance.update).toHaveBeenCalledWith({
        where: { id: instanceId, tenantId },
        data: {
          status: 'CONNECTING',
          qrCode: mockQRCode,
          updatedAt: expect.any(Date),
        },
      });
      expect(result).toEqual(expect.objectContaining({
        status: 'CONNECTING',
        qrCode: mockQRCode,
      }));
    });

    it('should throw error if instance not found', async () => {
      // Arrange
      const tenantId = 'tenant-id';
      const instanceId = 'non-existent-id';

      mockPrisma.instance.findUnique.mockResolvedValue(null);

      // Act & Assert
      await expect(instanceService.connectInstance(tenantId, instanceId))
        .rejects.toThrow('Instance not found');
    });

    it('should throw error if instance already connected', async () => {
      // Arrange
      const tenantId = 'tenant-id';
      const instanceId = 'instance-id';

      const mockInstance = TestDataFactory.createInstanceData({
        id: instanceId,
        tenantId,
        status: 'CONNECTED',
      });

      mockPrisma.instance.findUnique.mockResolvedValue(mockInstance);

      // Act & Assert
      await expect(instanceService.connectInstance(tenantId, instanceId))
        .rejects.toThrow('Instance is already connected');
    });
  });

  describe('disconnectInstance', () => {
    it('should successfully disconnect instance', async () => {
      // Arrange
      const tenantId = 'tenant-id';
      const instanceId = 'instance-id';

      const mockInstance = TestDataFactory.createInstanceData({
        id: instanceId,
        tenantId,
        evolutionInstanceId: 'evolution-instance-id',
        status: 'CONNECTED',
      });

      mockPrisma.instance.findUnique.mockResolvedValue(mockInstance);
      mockEvolutionService.disconnectInstance.mockResolvedValue({ success: true });
      mockPrisma.instance.update.mockResolvedValue({
        ...mockInstance,
        status: 'DISCONNECTED',
        qrCode: null,
      });

      // Act
      const result = await instanceService.disconnectInstance(tenantId, instanceId);

      // Assert
      expect(mockEvolutionService.disconnectInstance).toHaveBeenCalledWith(
        mockInstance.evolutionInstanceId
      );
      expect(mockPrisma.instance.update).toHaveBeenCalledWith({
        where: { id: instanceId, tenantId },
        data: {
          status: 'DISCONNECTED',
          qrCode: null,
          updatedAt: expect.any(Date),
        },
      });
      expect(result).toEqual(expect.objectContaining({
        status: 'DISCONNECTED',
        qrCode: null,
      }));
    });

    it('should throw error if instance not found', async () => {
      // Arrange
      const tenantId = 'tenant-id';
      const instanceId = 'non-existent-id';

      mockPrisma.instance.findUnique.mockResolvedValue(null);

      // Act & Assert
      await expect(instanceService.disconnectInstance(tenantId, instanceId))
        .rejects.toThrow('Instance not found');
    });
  });

  describe('getInstanceStatus', () => {
    it('should return instance status from Evolution API', async () => {
      // Arrange
      const tenantId = 'tenant-id';
      const instanceId = 'instance-id';

      const mockInstance = TestDataFactory.createInstanceData({
        id: instanceId,
        tenantId,
        evolutionInstanceId: 'evolution-instance-id',
      });

      const mockStatus = {
        instanceName: 'test-instance',
        status: 'connected',
        phoneNumber: '+6281234567890',
      };

      mockPrisma.instance.findUnique.mockResolvedValue(mockInstance);
      mockEvolutionService.getInstanceStatus.mockResolvedValue(mockStatus);

      // Act
      const result = await instanceService.getInstanceStatus(tenantId, instanceId);

      // Assert
      expect(mockEvolutionService.getInstanceStatus).toHaveBeenCalledWith(
        mockInstance.evolutionInstanceId
      );
      expect(result).toEqual(mockStatus);
    });

    it('should throw error if instance not found', async () => {
      // Arrange
      const tenantId = 'tenant-id';
      const instanceId = 'non-existent-id';

      mockPrisma.instance.findUnique.mockResolvedValue(null);

      // Act & Assert
      await expect(instanceService.getInstanceStatus(tenantId, instanceId))
        .rejects.toThrow('Instance not found');
    });
  });

  describe('validatePhoneNumber', () => {
    it('should validate correct phone number formats', () => {
      // Arrange
      const validPhoneNumbers = [
        '+6281234567890',
        '+1234567890123',
        '+447123456789',
      ];

      // Act & Assert
      validPhoneNumbers.forEach(phoneNumber => {
        expect(() => (instanceService as any).validatePhoneNumber(phoneNumber))
          .not.toThrow();
      });
    });

    it('should reject invalid phone number formats', () => {
      // Arrange
      const invalidPhoneNumbers = [
        '081234567890',
        '+62812345',
        'invalid-phone',
        '+62-812-345-678',
      ];

      // Act & Assert
      invalidPhoneNumbers.forEach(phoneNumber => {
        expect(() => (instanceService as any).validatePhoneNumber(phoneNumber))
          .toThrow('Invalid phone number format');
      });
    });
  });

  describe('validateWebhookUrl', () => {
    it('should validate correct webhook URL formats', () => {
      // Arrange
      const validUrls = [
        'https://example.com/webhook',
        'http://localhost:3000/webhook',
        'https://api.example.com/v1/webhooks/whatsapp',
      ];

      // Act & Assert
      validUrls.forEach(url => {
        expect(() => (instanceService as any).validateWebhookUrl(url))
          .not.toThrow();
      });
    });

    it('should reject invalid webhook URL formats', () => {
      // Arrange
      const invalidUrls = [
        'invalid-url',
        'ftp://example.com/webhook',
        'https://',
        'http://example',
      ];

      // Act & Assert
      invalidUrls.forEach(url => {
        expect(() => (instanceService as any).validateWebhookUrl(url))
          .toThrow('Invalid webhook URL format');
      });
    });
  });
});