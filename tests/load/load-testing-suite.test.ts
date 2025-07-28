import { FastifyInstance } from 'fastify';
import { testPrisma, testRedis, TestDataFactory, TestUtils } from '../setup/integration.setup';
import { buildApp } from '../../src/api/index';
import { performance } from 'perf_hooks';

describe('Load Testing Suite', () => {
  let app: FastifyInstance;
  let testTenant: any;
  let testUser: any;
  let authToken: string;
  let testInstance: any;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
    
    // Setup test data
    testTenant = await TestDataFactory.createTenant();
    testUser = await TestDataFactory.createUser(testTenant.id, { role: 'ADMIN' });
    authToken = TestUtils.generateJWT({
      userId: testUser.id,
      tenantId: testTenant.id,
      role: testUser.role
    });
    testInstance = await TestDataFactory.createInstance(testTenant.id, {
      status: 'CONNECTED'
    });
  });

  afterAll(async () => {
    await app.close();
  });

  describe('High-Volume Message Processing', () => {
    it('should handle 1000 concurrent message requests', async () => {
      const concurrentRequests = 1000;
      const startTime = performance.now();
      
      // Create array of message requests
      const requests = Array.from({ length: concurrentRequests }, (_, index) => ({
        method: 'POST' as const,
        url: '/api/v1/messages/send',
        headers: {
          authorization: `Bearer ${authToken}`,
          'content-type': 'application/json'
        },
        payload: {
          instanceId: testInstance.id,
          recipient: `123456789${index % 10}@s.whatsapp.net`,
          text: `Load test message ${index + 1}`
        }
      }));

      // Execute all requests concurrently
      const responses = await Promise.allSettled(
        requests.map(request => app.inject(request))
      );

      const endTime = performance.now();
      const totalTime = endTime - startTime;

      // Analyze results
      const successful = responses.filter(
        result => result.status === 'fulfilled' && result.value.statusCode === 200
      ).length;
      
      const failed = responses.length - successful;
      const averageResponseTime = totalTime / responses.length;
      const throughput = (successful / totalTime) * 1000; // requests per second

      console.log(`Load Test Results:
        - Total Requests: ${concurrentRequests}
        - Successful: ${successful}
        - Failed: ${failed}
        - Success Rate: ${(successful / concurrentRequests * 100).toFixed(2)}%
        - Total Time: ${totalTime.toFixed(2)}ms
        - Average Response Time: ${averageResponseTime.toFixed(2)}ms
        - Throughput: ${throughput.toFixed(2)} req/sec
      `);

      // Assertions
      expect(successful).toBeGreaterThan(concurrentRequests * 0.95); // 95% success rate
      expect(averageResponseTime).toBeLessThan(1000); // Average response time < 1s
      expect(throughput).toBeGreaterThan(100); // At least 100 req/sec
    }, 60000);

    it('should maintain performance under sustained load', async () => {
      const duration = 30000; // 30 seconds
      const requestsPerSecond = 50;
      const interval = 1000 / requestsPerSecond;
      
      const results: Array<{ timestamp: number; responseTime: number; success: boolean }> = [];
      const startTime = performance.now();
      
      const sendRequest = async (index: number) => {
        const requestStart = performance.now();
        
        try {
          const response = await app.inject({
            method: 'POST',
            url: '/api/v1/messages/send',
            headers: {
              authorization: `Bearer ${authToken}`,
              'content-type': 'application/json'
            },
            payload: {
              instanceId: testInstance.id,
              recipient: `sustained${index % 100}@s.whatsapp.net`,
              text: `Sustained load test message ${index}`
            }
          });
          
          const responseTime = performance.now() - requestStart;
          results.push({
            timestamp: requestStart - startTime,
            responseTime,
            success: response.statusCode === 200
          });
        } catch (error) {
          const responseTime = performance.now() - requestStart;
          results.push({
            timestamp: requestStart - startTime,
            responseTime,
            success: false
          });
        }
      };

      // Send requests at regular intervals
      const promises: Promise<void>[] = [];
      let requestIndex = 0;
      
      const intervalId = setInterval(() => {
        if (performance.now() - startTime >= duration) {
          clearInterval(intervalId);
          return;
        }
        
        promises.push(sendRequest(requestIndex++));
      }, interval);

      // Wait for test duration
      await new Promise(resolve => setTimeout(resolve, duration + 5000));
      
      // Wait for all requests to complete
      await Promise.allSettled(promises);

      // Analyze sustained load results
      const successfulRequests = results.filter(r => r.success);
      const averageResponseTime = successfulRequests.reduce((sum, r) => sum + r.responseTime, 0) / successfulRequests.length;
      const p95ResponseTime = successfulRequests
        .map(r => r.responseTime)
        .sort((a, b) => a - b)[Math.floor(successfulRequests.length * 0.95)];
      
      const successRate = (successfulRequests.length / results.length) * 100;

      console.log(`Sustained Load Test Results:
        - Duration: ${duration / 1000}s
        - Total Requests: ${results.length}
        - Successful: ${successfulRequests.length}
        - Success Rate: ${successRate.toFixed(2)}%
        - Average Response Time: ${averageResponseTime.toFixed(2)}ms
        - 95th Percentile Response Time: ${p95ResponseTime.toFixed(2)}ms
      `);

      // Assertions for sustained load
      expect(successRate).toBeGreaterThan(95); // 95% success rate
      expect(averageResponseTime).toBeLessThan(500); // Average < 500ms
      expect(p95ResponseTime).toBeLessThan(1000); // 95th percentile < 1s
    }, 45000);
  });

  describe('Database Performance Under Load', () => {
    it('should handle concurrent database operations', async () => {
      const concurrentOperations = 500;
      const startTime = performance.now();

      // Mix of read and write operations
      const operations = Array.from({ length: concurrentOperations }, (_, index) => {
        if (index % 3 === 0) {
          // Create operation (33%)
          return async () => {
            const instance = await TestDataFactory.createInstance(testTenant.id, {
              name: `Load Test Instance ${index}`,
              evolutionInstanceId: `load-test-${index}`
            });
            return { type: 'create', success: !!instance };
          };
        } else if (index % 3 === 1) {
          // Read operation (33%)
          return async () => {
            const instances = await testPrisma.instance.findMany({
              where: { tenantId: testTenant.id },
              take: 10
            });
            return { type: 'read', success: instances.length >= 0 };
          };
        } else {
          // Update operation (33%)
          return async () => {
            const updated = await testPrisma.instance.updateMany({
              where: { tenantId: testTenant.id },
              data: { updatedAt: new Date() }
            });
            return { type: 'update', success: updated.count >= 0 };
          };
        }
      });

      // Execute all operations concurrently
      const results = await Promise.allSettled(
        operations.map(op => op())
      );

      const endTime = performance.now();
      const totalTime = endTime - startTime;

      // Analyze database performance
      const successful = results.filter(
        result => result.status === 'fulfilled' && result.value.success
      ).length;

      const operationTypes = results
        .filter(result => result.status === 'fulfilled')
        .reduce((acc: any, result: any) => {
          const type = result.value.type;
          acc[type] = (acc[type] || 0) + 1;
          return acc;
        }, {});

      console.log(`Database Load Test Results:
        - Total Operations: ${concurrentOperations}
        - Successful: ${successful}
        - Success Rate: ${(successful / concurrentOperations * 100).toFixed(2)}%
        - Total Time: ${totalTime.toFixed(2)}ms
        - Average Operation Time: ${(totalTime / concurrentOperations).toFixed(2)}ms
        - Operations by Type: ${JSON.stringify(operationTypes)}
      `);

      // Assertions
      expect(successful).toBeGreaterThan(concurrentOperations * 0.95);
      expect(totalTime / concurrentOperations).toBeLessThan(100); // Average < 100ms per operation
    }, 30000);
  });

  describe('Redis Performance Under Load', () => {
    it('should handle high-volume cache operations', async () => {
      const cacheOperations = 1000;
      const startTime = performance.now();

      // Mix of cache operations
      const operations = Array.from({ length: cacheOperations }, (_, index) => {
        const key = `load-test:${index}`;
        const value = JSON.stringify({ data: `test data ${index}`, timestamp: Date.now() });

        if (index % 4 === 0) {
          // SET operation (25%)
          return async () => {
            await testRedis.setex(key, 300, value);
            return { type: 'set', success: true };
          };
        } else if (index % 4 === 1) {
          // GET operation (25%)
          return async () => {
            const result = await testRedis.get(key);
            return { type: 'get', success: true, hit: result !== null };
          };
        } else if (index % 4 === 2) {
          // EXISTS operation (25%)
          return async () => {
            const exists = await testRedis.exists(key);
            return { type: 'exists', success: true, exists };
          };
        } else {
          // DEL operation (25%)
          return async () => {
            await testRedis.del(key);
            return { type: 'del', success: true };
          };
        }
      });

      // Execute all cache operations concurrently
      const results = await Promise.allSettled(
        operations.map(op => op())
      );

      const endTime = performance.now();
      const totalTime = endTime - startTime;

      // Analyze Redis performance
      const successful = results.filter(
        result => result.status === 'fulfilled' && result.value.success
      ).length;

      const cacheHits = results
        .filter(result => result.status === 'fulfilled' && (result.value as any).hit)
        .length;

      const operationTypes = results
        .filter(result => result.status === 'fulfilled')
        .reduce((acc: any, result: any) => {
          const type = result.value.type;
          acc[type] = (acc[type] || 0) + 1;
          return acc;
        }, {});

      console.log(`Redis Load Test Results:
        - Total Operations: ${cacheOperations}
        - Successful: ${successful}
        - Success Rate: ${(successful / cacheOperations * 100).toFixed(2)}%
        - Total Time: ${totalTime.toFixed(2)}ms
        - Average Operation Time: ${(totalTime / cacheOperations).toFixed(2)}ms
        - Cache Hits: ${cacheHits}
        - Operations by Type: ${JSON.stringify(operationTypes)}
      `);

      // Assertions
      expect(successful).toBeGreaterThan(cacheOperations * 0.98);
      expect(totalTime / cacheOperations).toBeLessThan(10); // Average < 10ms per operation
    }, 20000);
  });

  describe('Memory and Resource Usage', () => {
    it('should maintain stable memory usage under load', async () => {
      const initialMemory = process.memoryUsage();
      const memorySnapshots: Array<{ timestamp: number; heapUsed: number; heapTotal: number }> = [];
      
      // Monitor memory usage
      const memoryMonitor = setInterval(() => {
        const memory = process.memoryUsage();
        memorySnapshots.push({
          timestamp: Date.now(),
          heapUsed: memory.heapUsed,
          heapTotal: memory.heapTotal
        });
      }, 1000);

      // Generate load for 20 seconds
      const loadDuration = 20000;
      const requestsPerSecond = 20;
      const promises: Promise<any>[] = [];

      const startTime = Date.now();
      const loadInterval = setInterval(() => {
        if (Date.now() - startTime >= loadDuration) {
          clearInterval(loadInterval);
          return;
        }

        // Send multiple concurrent requests
        for (let i = 0; i < requestsPerSecond; i++) {
          promises.push(
            app.inject({
              method: 'GET',
              url: '/api/v1/instances',
              headers: {
                authorization: `Bearer ${authToken}`
              }
            })
          );
        }
      }, 1000);

      // Wait for load test to complete
      await new Promise(resolve => setTimeout(resolve, loadDuration + 2000));
      clearInterval(memoryMonitor);

      // Wait for all requests to complete
      await Promise.allSettled(promises);

      // Analyze memory usage
      const finalMemory = process.memoryUsage();
      const maxHeapUsed = Math.max(...memorySnapshots.map(s => s.heapUsed));
      const avgHeapUsed = memorySnapshots.reduce((sum, s) => sum + s.heapUsed, 0) / memorySnapshots.length;
      
      const memoryIncrease = finalMemory.heapUsed - initialMemory.heapUsed;
      const memoryIncreasePercent = (memoryIncrease / initialMemory.heapUsed) * 100;

      console.log(`Memory Usage Analysis:
        - Initial Heap Used: ${(initialMemory.heapUsed / 1024 / 1024).toFixed(2)} MB
        - Final Heap Used: ${(finalMemory.heapUsed / 1024 / 1024).toFixed(2)} MB
        - Max Heap Used: ${(maxHeapUsed / 1024 / 1024).toFixed(2)} MB
        - Average Heap Used: ${(avgHeapUsed / 1024 / 1024).toFixed(2)} MB
        - Memory Increase: ${(memoryIncrease / 1024 / 1024).toFixed(2)} MB (${memoryIncreasePercent.toFixed(2)}%)
        - Total Requests: ${promises.length}
      `);

      // Assertions for memory stability
      expect(maxHeapUsed).toBeLessThan(500 * 1024 * 1024); // Max heap < 500MB
      expect(memoryIncreasePercent).toBeLessThan(50); // Memory increase < 50%
    }, 30000);
  });

  describe('Error Rate Under Load', () => {
    it('should maintain low error rate under stress', async () => {
      const stressRequests = 2000;
      const batchSize = 100;
      const results: Array<{ success: boolean; statusCode: number; responseTime: number }> = [];

      // Process requests in batches to avoid overwhelming the system
      for (let i = 0; i < stressRequests; i += batchSize) {
        const batch = Array.from({ length: Math.min(batchSize, stressRequests - i) }, (_, index) => {
          const requestStart = performance.now();
          
          return app.inject({
            method: 'GET',
            url: `/api/v1/instances?page=${Math.floor((i + index) / 10) + 1}&limit=10`,
            headers: {
              authorization: `Bearer ${authToken}`
            }
          }).then(response => {
            const responseTime = performance.now() - requestStart;
            return {
              success: response.statusCode === 200,
              statusCode: response.statusCode,
              responseTime
            };
          }).catch(error => {
            const responseTime = performance.now() - requestStart;
            return {
              success: false,
              statusCode: 500,
              responseTime
            };
          });
        });

        const batchResults = await Promise.all(batch);
        results.push(...batchResults);

        // Small delay between batches to prevent overwhelming
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      // Analyze error rates
      const successful = results.filter(r => r.success).length;
      const errorsByStatus = results
        .filter(r => !r.success)
        .reduce((acc: any, r) => {
          acc[r.statusCode] = (acc[r.statusCode] || 0) + 1;
          return acc;
        }, {});

      const averageResponseTime = results.reduce((sum, r) => sum + r.responseTime, 0) / results.length;
      const errorRate = ((results.length - successful) / results.length) * 100;

      console.log(`Stress Test Error Analysis:
        - Total Requests: ${stressRequests}
        - Successful: ${successful}
        - Error Rate: ${errorRate.toFixed(2)}%
        - Average Response Time: ${averageResponseTime.toFixed(2)}ms
        - Errors by Status Code: ${JSON.stringify(errorsByStatus)}
      `);

      // Assertions for error rate
      expect(errorRate).toBeLessThan(5); // Error rate < 5%
      expect(successful).toBeGreaterThan(stressRequests * 0.95);
      expect(averageResponseTime).toBeLessThan(2000); // Average response time < 2s
    }, 60000);
  });

  describe('Cleanup and Recovery', () => {
    afterEach(async () => {
      // Clean up test data to prevent memory leaks
      await testPrisma.messageLog.deleteMany({
        where: { tenantId: testTenant.id }
      });
      
      await testPrisma.instance.deleteMany({
        where: { 
          tenantId: testTenant.id,
          name: { contains: 'Load Test' }
        }
      });

      // Clear Redis cache
      const keys = await testRedis.keys('load-test:*');
      if (keys.length > 0) {
        await testRedis.del(...keys);
      }

      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }
    });
  });
});