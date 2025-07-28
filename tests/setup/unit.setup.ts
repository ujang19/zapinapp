// Unit test specific setup
import '../helpers/test-helpers';

// Mock external dependencies for unit tests
jest.mock('../../src/lib/redis', () => ({
  redis: {
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
    exists: jest.fn(),
    expire: jest.fn(),
    ttl: jest.fn(),
    keys: jest.fn(),
    flushall: jest.fn(),
    quit: jest.fn(),
    disconnect: jest.fn(),
  },
}));

// Mock Evolution API service
jest.mock('../../src/services/evolutionService', () => ({
  EvolutionService: {
    createInstance: jest.fn(),
    deleteInstance: jest.fn(),
    getInstanceStatus: jest.fn(),
    sendMessage: jest.fn(),
    getQRCode: jest.fn(),
    connectInstance: jest.fn(),
    disconnectInstance: jest.fn(),
  },
}));

// Mock WebSocket service
jest.mock('../../src/services/websocketService', () => ({
  WebSocketService: {
    emit: jest.fn(),
    broadcast: jest.fn(),
    join: jest.fn(),
    leave: jest.fn(),
  },
}));

// Mock file system operations
jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  writeFileSync: jest.fn(),
  readFileSync: jest.fn(),
  existsSync: jest.fn(),
  mkdirSync: jest.fn(),
  unlinkSync: jest.fn(),
}));

// Mock crypto for consistent test results
jest.mock('crypto', () => ({
  ...jest.requireActual('crypto'),
  randomUUID: jest.fn(() => '12345678-1234-1234-1234-123456789012'),
  randomBytes: jest.fn(() => Buffer.from('test-random-bytes')),
}));

// Mock date for consistent test results
const mockDate = new Date('2024-01-01T00:00:00.000Z');
jest.spyOn(global, 'Date').mockImplementation(() => mockDate as any);
Date.now = jest.fn(() => mockDate.getTime());

// Setup test environment
beforeAll(() => {
  // Set consistent timezone for tests
  process.env.TZ = 'UTC';
});

afterAll(() => {
  // Restore original implementations
  jest.restoreAllMocks();
});