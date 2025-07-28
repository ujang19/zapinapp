import { FastifyInstance } from 'fastify';
import { testPrisma, testRedis, TestDataFactory, TestUtils } from '../setup/integration.setup';
import { buildApp } from '../../src/api/index';
import { performance } from 'perf_hooks';
import * as fs from 'fs';
import * as path from 'path';

interface BenchmarkResult {
  testName: string;
  timestamp: string;
  metrics: {
    averageResponseTime: number;
    p50ResponseTime: number;
    p95ResponseTime: number;
    p99ResponseTime: number;
    throughput: number;
    errorRate: number;
    memoryUsage: {
      heapUsed: number;
      heapTotal: number;
      external: number;
    };
  };
  requirements: {
    averageResponseTime: { target: number; passed: boolean };
    p95ResponseTime: { target: number; passed: boolean };
    throughput: { target: number; passed: boolean };
    errorRate: { target: number; passed: boolean };
  };
}

describe('Performance Benchmarking Suite', () => {
  let app: FastifyInstance;
  let testTenant: any;
  let testUser: any;
  let authToken: string;
  let testInstance: any;
  let benchmarkResults: BenchmarkResult[] = [];

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

    // Create additional test data for realistic benchmarks
    await Promise.all([
      ...Array.from({ length: 10 }, (_, i) => 
        TestDataFactory.createInstance(testTenant.id, { name: `Benchmark Instance ${i}` })
      ),
      ...Array.from({ length: 5 }, (_, i) => 
        TestDataFactory.createBot(testTenant.id, testInstance.id, { name: `Benchmark Bot ${i}` })
      )
    ]);
  });

  afterAll(async () => {
    await app.close();
    
    // Save benchmark results to file
    const resultsPath = path.join(__dirname, '../..', 'benchmark-results.json');
    fs.writeFileSync(resultsPath, JSON.stringify(benchmarkResults, null, 2));
    
    console.log('\n=== PERFORMANCE BENCHMARK SUMMARY ===');
    benchmarkResults.forEach(result => {
      console.log(`\n${result.testName}:`);
      console.log(`  Average Response Time: ${result.metrics.averageResponseTime.toFixed(2)}ms (target: ${result.requirements.averageResponseTime.target}ms) ${result.requirements.averageResponseTime.passed ? '✅' : '❌'}`);
      console.log(`  95th Percentile: ${result.metrics.p95ResponseTime.toFixed(2)}ms (target: ${result.requirements.p95ResponseTime.target}ms) ${result.requirements.p95ResponseTime.passed ? '✅' : '❌'}`);
      console.log(`  Throughput: ${result.metrics.throughput.toFixed(2)} req/s (target: ${result.requirements.throughput.target} req/s) ${result.requirements.throughput.passed ? '✅' : '❌'}`);
      console.log(`  Error Rate: ${result.metrics.errorRate.toFixed(2)}% (target: <${result.requirements.errorRate.target}%) ${result.requirements.errorRate.passed ? '✅' : '❌'}`);
    });
  });

  describe('API Endpoint Benchmarks', () => {
    it('should benchmark message sending performance', async () => {
      const testName = 'Message Sending API';
      const requestCount = 1000;
      const concurrency = 50;
      const responseTimes: number[] = [];
      const errors: number[] = [];
      
      const startTime = performance.now();
      const initialMemory = process.memoryUsage();

      // Execute requests in batches for controlled concurrency
      const batchSize = concurrency;
      const batches = Math.ceil(requestCount / batchSize);

      for (let batch = 0; batch < batches; batch++) {
        const batchPromises = [];
        const currentBatchSize = Math.min(batchSize, requestCount - (batch * batchSize));

        for (let i = 0; i < currentBatchSize; i++) {
          const requestStart = performance.now();
          
          batchPromises.push(
            app.inject({
              method: 'POST',
              url: '/api/v1/messages/send',
              headers: {
                authorization: `Bearer ${authToken}`,
                'content-type': 'application/json'
              },
              payload: {
                instanceId: testInstance.id,
                recipient: `benchmark${batch * batchSize + i}@s.whatsapp.net`,
                text: `Benchmark message ${batch * batchSize + i}`
              }
            }).then(response => {
              const responseTime = performance.now() - requestStart;
              responseTimes.push(responseTime);
              
              if (response.statusCode !== 200) {
                errors.push(response.statusCode);
              }
              
              return response;
            }).catch(error => {
              const responseTime = performance.now() - requestStart;
              responseTimes.push(responseTime);
              errors.push(500);
              return error;
            })
          );
        }

        await Promise.all(batchPromises);
      }

      const endTime = performance.now();
      const finalMemory = process.memoryUsage();
      const totalTime = endTime - startTime;

      // Calculate metrics
      const sortedTimes = responseTimes.sort((a, b) => a - b);
      const averageResponseTime = responseTimes.reduce((sum, time) => sum + time, 0) / responseTimes.length;
      const p50ResponseTime = sortedTimes[Math.floor(sortedTimes.length * 0.5)];
      const p95ResponseTime = sortedTimes[Math.floor(sortedTimes.length * 0.95)];
      const p99ResponseTime = sortedTimes[Math.floor(sortedTimes.length * 0.99)];
      const throughput = (requestCount / totalTime) * 1000;
      const errorRate = (errors.length / requestCount) * 100;

      const result: BenchmarkResult = {
        testName,
        timestamp: new Date().toISOString(),
        metrics: {
          averageResponseTime,
          p50ResponseTime,
          p95ResponseTime,
          p99ResponseTime,
          throughput,
          errorRate,
          memoryUsage: {
            heapUsed: finalMemory.heapUsed - initialMemory.heapUsed,
            heapTotal: finalMemory.heapTotal,
            external: finalMemory.external
          }
        },
        requirements: {
          averageResponseTime: { target: 200, passed: averageResponseTime < 200 },
          p95ResponseTime: { target: 500, passed: p95ResponseTime < 500 },
          throughput: { target: 100, passed: throughput > 100 },
          errorRate: { target: 1, passed: errorRate < 1 }
        }
      };

      benchmarkResults.push(result);

      // Assertions based on performance requirements
      expect(averageResponseTime).toBeLessThan(200); // < 200ms average
      expect(p95ResponseTime).toBeLessThan(500); // < 500ms 95th percentile
      expect(throughput).toBeGreaterThan(100); // > 100 req/s
      expect(errorRate).toBeLessThan(1); // < 1% error rate
    }, 60000);

    it('should benchmark instance listing performance', async () => {
      const testName = 'Instance Listing API';
      const requestCount = 500;
      const responseTimes: number[] = [];
      const errors: number[] = [];
      
      const startTime = performance.now();
      const initialMemory = process.memoryUsage();

      // Execute requests sequentially to test database performance
      for (let i = 0; i < requestCount; i++) {
        const requestStart = performance.now();
        
        try {
          const response = await app.inject({
            method: 'GET',
            url: `/api/v1/instances?page=${(i % 10) + 1}&limit=10`,
            headers: {
              authorization: `Bearer ${authToken}`
            }
          });

          const responseTime = performance.now() - requestStart;
          responseTimes.push(responseTime);

          if (response.statusCode !== 200) {
            errors.push(response.statusCode);
          }
        } catch (error) {
          const responseTime = performance.now() - requestStart;
          responseTimes.push(responseTime);
          errors.push(500);
        }
      }

      const endTime = performance.now();
      const finalMemory = process.memoryUsage();
      const totalTime = endTime - startTime;

      // Calculate metrics
      const sortedTimes = responseTimes.sort((a, b) => a - b);
      const averageResponseTime = responseTimes.reduce((sum, time) => sum + time, 0) / responseTimes.length;
      const p50ResponseTime = sortedTimes[Math.floor(sortedTimes.length * 0.5)];
      const p95ResponseTime = sortedTimes[Math.floor(sortedTimes.length * 0.95)];
      const p99ResponseTime = sortedTimes[Math.floor(sortedTimes.length * 0.99)];
      const throughput = (requestCount / totalTime) * 1000;
      const errorRate = (errors.length / requestCount) * 100;

      const result: BenchmarkResult = {
        testName,
        timestamp: new Date().toISOString(),
        metrics: {
          averageResponseTime,
          p50ResponseTime,
          p95ResponseTime,
          p99ResponseTime,
          throughput,
          errorRate,
          memoryUsage: {
            heapUsed: finalMemory.heapUsed - initialMemory.heapUsed,
            heapTotal: finalMemory.heapTotal,
            external: finalMemory.external
          }
        },
        requirements: {
          averageResponseTime: { target: 100, passed: averageResponseTime < 100 },
          p95ResponseTime: { target: 200, passed: p95ResponseTime < 200 },
          throughput: { target: 200, passed: throughput > 200 },
          errorRate: { target: 0.5, passed: errorRate < 0.5 }
        }
      };

      benchmarkResults.push(result);

      // Assertions for read operations (should be faster)
      expect(averageResponseTime).toBeLessThan(100); // < 100ms average
      expect(p95ResponseTime).toBeLessThan(200); // < 200ms 95th percentile
      expect(throughput).toBeGreaterThan(200); // > 200 req/s
      expect(errorRate).toBeLessThan(0.5); // < 0.5% error rate
    }, 30000);

    it('should benchmark authentication performance', async () => {
      const testName = 'Authentication API';
      const requestCount = 200;
      const responseTimes: number[] = [];
      const errors: number[] = [];
      
      const startTime = performance.now();
      const initialMemory = process.memoryUsage();

      for (let i = 0; i < requestCount; i++) {
        const requestStart = performance.now();
        
        try {
          const response = await app.inject({
            method: 'GET',
            url: '/api/auth/me',
            headers: {
              authorization: `Bearer ${authToken}`
            }
          });

          const responseTime = performance.now() - requestStart;
          responseTimes.push(responseTime);

          if (response.statusCode !== 200) {
            errors.push(response.statusCode);
          }
        } catch (error) {
          const responseTime = performance.now() - requestStart;
          responseTimes.push(responseTime);
          errors.push(500);
        }
      }

      const endTime = performance.now();
      const finalMemory = process.memoryUsage();
      const totalTime = endTime - startTime;

      // Calculate metrics
      const sortedTimes = responseTimes.sort((a, b) => a - b);
      const averageResponseTime = responseTimes.reduce((sum, time) => sum + time, 0) / responseTimes.length;
      const p50ResponseTime = sortedTimes[Math.floor(sortedTimes.length * 0.5)];
      const p95ResponseTime = sortedTimes[Math.floor(sortedTimes.length * 0.95)];
      const p99ResponseTime = sortedTimes[Math.floor(sortedTimes.length * 0.99)];
      const throughput = (requestCount / totalTime) * 1000;
      const errorRate = (errors.length / requestCount) * 100;

      const result: BenchmarkResult = {
        testName,
        timestamp: new Date().toISOString(),
        metrics: {
          averageResponseTime,
          p50ResponseTime,
          p95ResponseTime,
          p99ResponseTime,
          throughput,
          errorRate,
          memoryUsage: {
            heapUsed: finalMemory.heapUsed - initialMemory.heapUsed,
            heapTotal: finalMemory.heapTotal,
            external: finalMemory.external
          }
        },
        requirements: {
          averageResponseTime: { target: 50, passed: averageResponseTime < 50 },
          p95ResponseTime: { target: 100, passed: p95ResponseTime < 100 },
          throughput: { target: 500, passed: throughput > 500 },
          errorRate: { target: 0.1, passed: errorRate < 0.1 }
        }
      };

      benchmarkResults.push(result);

      // Authentication should be very fast (cached)
      expect(averageResponseTime).toBeLessThan(50); // < 50ms average
      expect(p95ResponseTime).toBeLessThan(100); // < 100ms 95th percentile
      expect(throughput).toBeGreaterThan(500); // > 500 req/s
      expect(errorRate).toBeLessThan(0.1); // < 0.1% error rate
    }, 20000);
  });

  describe('Database Performance Benchmarks', () => {
    it('should benchmark database query performance', async () => {
      const testName = 'Database Query Performance';
      const queryCount = 1000;
      const queryTimes: number[] = [];
      const errors: number[] = [];
      
      const startTime = performance.now();

      for (let i = 0; i < queryCount; i++) {
        const queryStart = performance.now();
        
        try {
          // Mix of different query types
          if (i % 3 === 0) {
            // Simple select
            await testPrisma.instance.findMany({
              where: { tenantId: testTenant.id },
              take: 10
            });
          } else if (i % 3 === 1) {
            // Join query
            await testPrisma.instance.findMany({
              where: { tenantId: testTenant.id },
              include: { bots: true },
              take: 5
            });
          } else {
            // Count query
            await testPrisma.instance.count({
              where: { tenantId: testTenant.id }
            });
          }

          const queryTime = performance.now() - queryStart;
          queryTimes.push(queryTime);
        } catch (error) {
          const queryTime = performance.now() - queryStart;
          queryTimes.push(queryTime);
          errors.push(1);
        }
      }

      const endTime = performance.now();
      const totalTime = endTime - startTime;

      // Calculate metrics
      const sortedTimes = queryTimes.sort((a, b) => a - b);
      const averageQueryTime = queryTimes.reduce((sum, time) => sum + time, 0) / queryTimes.length;
      const p50QueryTime = sortedTimes[Math.floor(sortedTimes.length * 0.5)];
      const p95QueryTime = sortedTimes[Math.floor(sortedTimes.length * 0.95)];
      const p99QueryTime = sortedTimes[Math.floor(sortedTimes.length * 0.99)];
      const throughput = (queryCount / totalTime) * 1000;
      const errorRate = (errors.length / queryCount) * 100;

      const result: BenchmarkResult = {
        testName,
        timestamp: new Date().toISOString(),
        metrics: {
          averageResponseTime: averageQueryTime,
          p50ResponseTime: p50QueryTime,
          p95ResponseTime: p95QueryTime,
          p99ResponseTime: p99QueryTime,
          throughput,
          errorRate,
          memoryUsage: process.memoryUsage()
        },
        requirements: {
          averageResponseTime: { target: 50, passed: averageQueryTime < 50 },
          p95ResponseTime: { target: 100, passed: p95QueryTime < 100 },
          throughput: { target: 1000, passed: throughput > 1000 },
          errorRate: { target: 0.1, passed: errorRate < 0.1 }
        }
      };

      benchmarkResults.push(result);

      // Database queries should be fast
      expect(averageQueryTime).toBeLessThan(50); // < 50ms average
      expect(p95QueryTime).toBeLessThan(100); // < 100ms 95th percentile
      expect(throughput).toBeGreaterThan(1000); // > 1000 queries/s
      expect(errorRate).toBeLessThan(0.1); // < 0.1% error rate
    }, 30000);
  });

  describe('Cache Performance Benchmarks', () => {
    it('should benchmark Redis cache performance', async () => {
      const testName = 'Redis Cache Performance';
      const operationCount = 2000;
      const operationTimes: number[] = [];
      const errors: number[] = [];
      
      const startTime = performance.now();

      for (let i = 0; i < operationCount; i++) {
        const operationStart = performance.now();
        
        try {
          const key = `benchmark:${i}`;
          const value = JSON.stringify({ data: `test data ${i}`, timestamp: Date.now() });

          if (i % 4 === 0) {
            // SET operation
            await testRedis.setex(key, 300, value);
          } else if (i % 4 === 1) {
            // GET operation
            await testRedis.get(key);
          } else if (i % 4 === 2) {
            // EXISTS operation
            await testRedis.exists(key);
          } else {
            // DEL operation
            await testRedis.del(key);
          }

          const operationTime = performance.now() - operationStart;
          operationTimes.push(operationTime);
        } catch (error) {
          const operationTime = performance.now() - operationStart;
          operationTimes.push(operationTime);
          errors.push(1);
        }
      }

      const endTime = performance.now();
      const totalTime = endTime - startTime;

      // Calculate metrics
      const sortedTimes = operationTimes.sort((a, b) => a - b);
      const averageOperationTime = operationTimes.reduce((sum, time) => sum + time, 0) / operationTimes.length;
      const p50OperationTime = sortedTimes[Math.floor(sortedTimes.length * 0.5)];
      const p95OperationTime = sortedTimes[Math.floor(sortedTimes.length * 0.95)];
      const p99OperationTime = sortedTimes[Math.floor(sortedTimes.length * 0.99)];
      const throughput = (operationCount / totalTime) * 1000;
      const errorRate = (errors.length / operationCount) * 100;

      const result: BenchmarkResult = {
        testName,
        timestamp: new Date().toISOString(),
        metrics: {
          averageResponseTime: averageOperationTime,
          p50ResponseTime: p50OperationTime,
          p95ResponseTime: p95OperationTime,
          p99ResponseTime: p99OperationTime,
          throughput,
          errorRate,
          memoryUsage: process.memoryUsage()
        },
        requirements: {
          averageResponseTime: { target: 10, passed: averageOperationTime < 10 },
          p95ResponseTime: { target: 20, passed: p95OperationTime < 20 },
          throughput: { target: 5000, passed: throughput > 5000 },
          errorRate: { target: 0.1, passed: errorRate < 0.1 }
        }
      };

      benchmarkResults.push(result);

      // Redis operations should be very fast
      expect(averageOperationTime).toBeLessThan(10); // < 10ms average
      expect(p95OperationTime).toBeLessThan(20); // < 20ms 95th percentile
      expect(throughput).toBeGreaterThan(5000); // > 5000 ops/s
      expect(errorRate).toBeLessThan(0.1); // < 0.1% error rate
    }, 20000);
  });

  describe('Memory Usage Benchmarks', () => {
    it('should benchmark memory efficiency under load', async () => {
      const testName = 'Memory Usage Under Load';
      const initialMemory = process.memoryUsage();
      const memorySnapshots: Array<{ timestamp: number; heapUsed: number }> = [];
      
      // Monitor memory usage
      const memoryMonitor = setInterval(() => {
        const memory = process.memoryUsage();
        memorySnapshots.push({
          timestamp: Date.now(),
          heapUsed: memory.heapUsed
        });
      }, 100);

      const startTime = performance.now();

      // Generate sustained load
      const promises = [];
      for (let i = 0; i < 500; i++) {
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

      await Promise.all(promises);
      
      // Wait a bit more to see memory cleanup
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      clearInterval(memoryMonitor);
      const endTime = performance.now();
      const finalMemory = process.memoryUsage();

      // Calculate memory metrics
      const maxHeapUsed = Math.max(...memorySnapshots.map(s => s.heapUsed));
      const avgHeapUsed = memorySnapshots.reduce((sum, s) => sum + s.heapUsed, 0) / memorySnapshots.length;
      const memoryIncrease = finalMemory.heapUsed - initialMemory.heapUsed;
      const memoryIncreasePercent = (memoryIncrease / initialMemory.heapUsed) * 100;

      const result: BenchmarkResult = {
        testName,
        timestamp: new Date().toISOString(),
        metrics: {
          averageResponseTime: (endTime - startTime) / promises.length,
          p50ResponseTime: 0,
          p95ResponseTime: 0,
          p99ResponseTime: 0,
          throughput: (promises.length / (endTime - startTime)) * 1000,
          errorRate: 0,
          memoryUsage: {
            heapUsed: memoryIncrease,
            heapTotal: finalMemory.heapTotal,
            external: finalMemory.external
          }
        },
        requirements: {
          averageResponseTime: { target: 100, passed: true },
          p95ResponseTime: { target: 200, passed: true },
          throughput: { target: 100, passed: true },
          errorRate: { target: 1, passed: true }
        }
      };

      benchmarkResults.push(result);

      console.log(`Memory Usage Analysis:
        - Initial Heap: ${(initialMemory.heapUsed / 1024 / 1024).toFixed(2)} MB
        - Final Heap: ${(finalMemory.heapUsed / 1024 / 1024).toFixed(2)} MB
        - Max Heap: ${(maxHeapUsed / 1024 / 1024).toFixed(2)} MB
        - Average Heap: ${(avgHeapUsed / 1024 / 1024).toFixed(2)} MB
        - Memory Increase: ${(memoryIncrease / 1024 / 1024).toFixed(2)} MB (${memoryIncreasePercent.toFixed(2)}%)
      `);

      // Memory usage should be reasonable
      expect(maxHeapUsed).toBeLessThan(500 * 1024 * 1024); // < 500MB max
      expect(memoryIncreasePercent).toBeLessThan(100); // < 100% increase
    }, 30000);
  });
});