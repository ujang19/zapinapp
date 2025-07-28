import { test, expect } from '@playwright/test';
import { performance } from 'perf_hooks';

// Performance test configuration
const PERFORMANCE_CONFIG = {
  // Response time thresholds (in milliseconds)
  API_RESPONSE_THRESHOLD: 500,
  PAGE_LOAD_THRESHOLD: 3000,
  DATABASE_QUERY_THRESHOLD: 100,
  
  // Load test parameters
  CONCURRENT_USERS: 50,
  TEST_DURATION: 60000, // 1 minute
  RAMP_UP_TIME: 10000, // 10 seconds
  
  // Endpoints to test
  ENDPOINTS: [
    { path: '/api/auth/login', method: 'POST' },
    { path: '/api/v1/instances', method: 'GET' },
    { path: '/api/v1/instances', method: 'POST' },
    { path: '/api/v1/messages/send', method: 'POST' },
    { path: '/api/v1/bots', method: 'GET' },
  ],
};

// Performance metrics collector
class PerformanceMetrics {
  private metrics: Array<{
    endpoint: string;
    method: string;
    responseTime: number;
    statusCode: number;
    timestamp: number;
  }> = [];

  addMetric(endpoint: string, method: string, responseTime: number, statusCode: number) {
    this.metrics.push({
      endpoint,
      method,
      responseTime,
      statusCode,
      timestamp: Date.now(),
    });
  }

  getAverageResponseTime(endpoint?: string): number {
    const filteredMetrics = endpoint 
      ? this.metrics.filter(m => m.endpoint === endpoint)
      : this.metrics;
    
    if (filteredMetrics.length === 0) return 0;
    
    const totalTime = filteredMetrics.reduce((sum, m) => sum + m.responseTime, 0);
    return totalTime / filteredMetrics.length;
  }

  getPercentile(percentile: number, endpoint?: string): number {
    const filteredMetrics = endpoint 
      ? this.metrics.filter(m => m.endpoint === endpoint)
      : this.metrics;
    
    if (filteredMetrics.length === 0) return 0;
    
    const sorted = filteredMetrics
      .map(m => m.responseTime)
      .sort((a, b) => a - b);
    
    const index = Math.ceil((percentile / 100) * sorted.length) - 1;
    return sorted[index];
  }

  getErrorRate(endpoint?: string): number {
    const filteredMetrics = endpoint 
      ? this.metrics.filter(m => m.endpoint === endpoint)
      : this.metrics;
    
    if (filteredMetrics.length === 0) return 0;
    
    const errorCount = filteredMetrics.filter(m => m.statusCode >= 400).length;
    return (errorCount / filteredMetrics.length) * 100;
  }

  getThroughput(): number {
    if (this.metrics.length === 0) return 0;
    
    const startTime = Math.min(...this.metrics.map(m => m.timestamp));
    const endTime = Math.max(...this.metrics.map(m => m.timestamp));
    const durationSeconds = (endTime - startTime) / 1000;
    
    return this.metrics.length / durationSeconds;
  }

  generateReport(): string {
    const report = [
      '=== Performance Test Report ===',
      `Total Requests: ${this.metrics.length}`,
      `Average Response Time: ${this.getAverageResponseTime().toFixed(2)}ms`,
      `95th Percentile: ${this.getPercentile(95).toFixed(2)}ms`,
      `99th Percentile: ${this.getPercentile(99).toFixed(2)}ms`,
      `Error Rate: ${this.getErrorRate().toFixed(2)}%`,
      `Throughput: ${this.getThroughput().toFixed(2)} req/s`,
      '',
      '=== Endpoint Breakdown ===',
    ];

    const endpoints = [...new Set(this.metrics.map(m => m.endpoint))];
    endpoints.forEach(endpoint => {
      report.push(`${endpoint}:`);
      report.push(`  Average: ${this.getAverageResponseTime(endpoint).toFixed(2)}ms`);
      report.push(`  95th Percentile: ${this.getPercentile(95, endpoint).toFixed(2)}ms`);
      report.push(`  Error Rate: ${this.getErrorRate(endpoint).toFixed(2)}%`);
      report.push('');
    });

    return report.join('\n');
  }
}

// Load test utilities
class LoadTestUtils {
  static async makeRequest(
    baseURL: string,
    endpoint: string,
    method: string,
    headers: Record<string, string> = {},
    body?: any
  ): Promise<{ responseTime: number; statusCode: number }> {
    const startTime = performance.now();
    
    try {
      const response = await fetch(`${baseURL}${endpoint}`, {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...headers,
        },
        body: body ? JSON.stringify(body) : undefined,
      });
      
      const endTime = performance.now();
      const responseTime = endTime - startTime;
      
      return {
        responseTime,
        statusCode: response.status,
      };
    } catch (error) {
      const endTime = performance.now();
      const responseTime = endTime - startTime;
      
      return {
        responseTime,
        statusCode: 500,
      };
    }
  }

  static async runConcurrentRequests(
    baseURL: string,
    endpoint: string,
    method: string,
    concurrency: number,
    duration: number,
    headers: Record<string, string> = {},
    body?: any
  ): Promise<PerformanceMetrics> {
    const metrics = new PerformanceMetrics();
    const startTime = Date.now();
    const promises: Promise<void>[] = [];

    for (let i = 0; i < concurrency; i++) {
      const promise = (async () => {
        while (Date.now() - startTime < duration) {
          const result = await this.makeRequest(baseURL, endpoint, method, headers, body);
          metrics.addMetric(endpoint, method, result.responseTime, result.statusCode);
          
          // Small delay to prevent overwhelming the server
          await new Promise(resolve => setTimeout(resolve, 10));
        }
      })();
      
      promises.push(promise);
    }

    await Promise.all(promises);
    return metrics;
  }

  static generateTestData() {
    return {
      user: {
        email: `test${Math.random().toString(36).substr(2, 9)}@example.com`,
        password: 'Test123!@#',
        name: 'Load Test User',
        tenantName: 'Load Test Company',
      },
      instance: {
        name: `Load Test Instance ${Math.random().toString(36).substr(2, 5)}`,
        phoneNumber: `+628${Math.floor(Math.random() * 1000000000).toString().padStart(9, '0')}`,
        webhookUrl: 'https://example.com/webhook',
      },
      message: {
        to: `+628${Math.floor(Math.random() * 1000000000).toString().padStart(9, '0')}`,
        message: 'Load test message',
        type: 'text',
      },
      bot: {
        name: `Load Test Bot ${Math.random().toString(36).substr(2, 5)}`,
        prompt: 'You are a helpful assistant for load testing.',
      },
    };
  }
}

test.describe('Performance and Load Tests', () => {
  const baseURL = 'http://localhost:3001';
  let authToken: string;

  test.beforeAll(async () => {
    // Create test user and get auth token
    const testData = LoadTestUtils.generateTestData();
    
    // Register user
    await LoadTestUtils.makeRequest(baseURL, '/api/auth/register', 'POST', {}, testData.user);
    
    // Login to get token
    const loginResult = await fetch(`${baseURL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: testData.user.email,
        password: testData.user.password,
      }),
    });
    
    const loginData = await loginResult.json();
    authToken = loginData.data.token;
  });

  test('API Response Time Performance', async () => {
    console.log('Testing API response times...');
    
    const results: Record<string, number> = {};
    
    for (const endpoint of PERFORMANCE_CONFIG.ENDPOINTS) {
      const testData = LoadTestUtils.generateTestData();
      let body: any;
      
      // Prepare request body based on endpoint
      switch (endpoint.path) {
        case '/api/auth/login':
          body = { email: 'test@example.com', password: 'Test123!@#' };
          break;
        case '/api/v1/instances':
          if (endpoint.method === 'POST') {
            body = testData.instance;
          }
          break;
        case '/api/v1/messages/send':
          body = testData.message;
          break;
        default:
          body = undefined;
      }
      
      const headers = endpoint.path.startsWith('/api/v1/') 
        ? { Authorization: `Bearer ${authToken}` }
        : {};
      
      // Test single request response time
      const result = await LoadTestUtils.makeRequest(
        baseURL,
        endpoint.path,
        endpoint.method,
        headers,
        body
      );
      
      results[`${endpoint.method} ${endpoint.path}`] = result.responseTime;
      
      // Assert response time is within threshold
      expect(result.responseTime).toBeLessThan(PERFORMANCE_CONFIG.API_RESPONSE_THRESHOLD);
      
      console.log(`${endpoint.method} ${endpoint.path}: ${result.responseTime.toFixed(2)}ms`);
    }
    
    // Log overall results
    const avgResponseTime = Object.values(results).reduce((a, b) => a + b, 0) / Object.values(results).length;
    console.log(`Average API response time: ${avgResponseTime.toFixed(2)}ms`);
  });

  test('Concurrent User Load Test', async () => {
    console.log(`Testing with ${PERFORMANCE_CONFIG.CONCURRENT_USERS} concurrent users...`);
    
    const metrics = await LoadTestUtils.runConcurrentRequests(
      baseURL,
      '/api/v1/instances',
      'GET',
      PERFORMANCE_CONFIG.CONCURRENT_USERS,
      PERFORMANCE_CONFIG.TEST_DURATION,
      { Authorization: `Bearer ${authToken}` }
    );
    
    // Generate and log performance report
    const report = metrics.generateReport();
    console.log(report);
    
    // Assert performance criteria
    expect(metrics.getAverageResponseTime()).toBeLessThan(PERFORMANCE_CONFIG.API_RESPONSE_THRESHOLD);
    expect(metrics.getPercentile(95)).toBeLessThan(PERFORMANCE_CONFIG.API_RESPONSE_THRESHOLD * 2);
    expect(metrics.getErrorRate()).toBeLessThan(5); // Less than 5% error rate
    expect(metrics.getThroughput()).toBeGreaterThan(10); // At least 10 req/s
  });

  test('Database Query Performance', async () => {
    console.log('Testing database query performance...');
    
    // Test various database operations
    const operations = [
      { name: 'User Lookup', endpoint: '/api/auth/me', method: 'GET' },
      { name: 'Instance List', endpoint: '/api/v1/instances', method: 'GET' },
      { name: 'Bot List', endpoint: '/api/v1/bots', method: 'GET' },
    ];
    
    for (const operation of operations) {
      const metrics = await LoadTestUtils.runConcurrentRequests(
        baseURL,
        operation.endpoint,
        operation.method,
        10, // 10 concurrent requests
        5000, // 5 seconds
        { Authorization: `Bearer ${authToken}` }
      );
      
      const avgResponseTime = metrics.getAverageResponseTime();
      console.log(`${operation.name}: ${avgResponseTime.toFixed(2)}ms average`);
      
      // Database queries should be fast
      expect(avgResponseTime).toBeLessThan(PERFORMANCE_CONFIG.DATABASE_QUERY_THRESHOLD);
    }
  });

  test('Memory Usage Under Load', async () => {
    console.log('Testing memory usage under load...');
    
    const initialMemory = process.memoryUsage();
    
    // Run intensive load test
    const metrics = await LoadTestUtils.runConcurrentRequests(
      baseURL,
      '/api/v1/instances',
      'GET',
      100, // High concurrency
      30000, // 30 seconds
      { Authorization: `Bearer ${authToken}` }
    );
    
    const finalMemory = process.memoryUsage();
    
    // Calculate memory increase
    const memoryIncrease = {
      rss: finalMemory.rss - initialMemory.rss,
      heapUsed: finalMemory.heapUsed - initialMemory.heapUsed,
      heapTotal: finalMemory.heapTotal - initialMemory.heapTotal,
    };
    
    console.log('Memory usage increase:');
    console.log(`RSS: ${(memoryIncrease.rss / 1024 / 1024).toFixed(2)} MB`);
    console.log(`Heap Used: ${(memoryIncrease.heapUsed / 1024 / 1024).toFixed(2)} MB`);
    console.log(`Heap Total: ${(memoryIncrease.heapTotal / 1024 / 1024).toFixed(2)} MB`);
    
    // Memory increase should be reasonable (less than 100MB)
    expect(memoryIncrease.rss).toBeLessThan(100 * 1024 * 1024);
    
    // Performance should still be good
    expect(metrics.getAverageResponseTime()).toBeLessThan(PERFORMANCE_CONFIG.API_RESPONSE_THRESHOLD);
    expect(metrics.getErrorRate()).toBeLessThan(5);
  });

  test('Rate Limiting Performance', async () => {
    console.log('Testing rate limiting behavior...');
    
    // Test rate limiting by making many requests quickly
    const metrics = new PerformanceMetrics();
    const promises: Promise<void>[] = [];
    
    // Make 200 requests as fast as possible
    for (let i = 0; i < 200; i++) {
      const promise = (async () => {
        const result = await LoadTestUtils.makeRequest(
          baseURL,
          '/api/v1/instances',
          'GET',
          { Authorization: `Bearer ${authToken}` }
        );
        metrics.addMetric('/api/v1/instances', 'GET', result.responseTime, result.statusCode);
      })();
      
      promises.push(promise);
    }
    
    await Promise.all(promises);
    
    // Check that rate limiting is working
    const errorRate = metrics.getErrorRate();
    console.log(`Rate limiting error rate: ${errorRate.toFixed(2)}%`);
    
    // Should have some rate limiting (429 errors)
    const rateLimitedRequests = metrics['metrics'].filter(m => m.statusCode === 429).length;
    console.log(`Rate limited requests: ${rateLimitedRequests}`);
    
    // Rate limiting should kick in for excessive requests
    expect(rateLimitedRequests).toBeGreaterThan(0);
  });

  test('WebSocket Connection Performance', async () => {
    console.log('Testing WebSocket connection performance...');
    
    const WebSocket = require('ws');
    const connections: any[] = [];
    const connectionTimes: number[] = [];
    
    // Test multiple WebSocket connections
    for (let i = 0; i < 50; i++) {
      const startTime = performance.now();
      
      const ws = new WebSocket(`ws://localhost:3001/socket.io/?EIO=4&transport=websocket`, {
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      });
      
      await new Promise((resolve, reject) => {
        ws.on('open', () => {
          const endTime = performance.now();
          connectionTimes.push(endTime - startTime);
          connections.push(ws);
          resolve(undefined);
        });
        
        ws.on('error', reject);
        
        setTimeout(() => reject(new Error('Connection timeout')), 5000);
      });
    }
    
    // Calculate connection performance
    const avgConnectionTime = connectionTimes.reduce((a, b) => a + b, 0) / connectionTimes.length;
    console.log(`Average WebSocket connection time: ${avgConnectionTime.toFixed(2)}ms`);
    
    // Clean up connections
    connections.forEach(ws => ws.close());
    
    // WebSocket connections should be fast
    expect(avgConnectionTime).toBeLessThan(1000); // Less than 1 second
    expect(connections.length).toBe(50); // All connections should succeed
  });

  test('File Upload Performance', async () => {
    console.log('Testing file upload performance...');
    
    // Create test file data
    const fileData = Buffer.alloc(1024 * 1024, 'test'); // 1MB test file
    const formData = new FormData();
    formData.append('file', new Blob([fileData]), 'test.txt');
    
    const uploadTimes: number[] = [];
    
    // Test multiple file uploads
    for (let i = 0; i < 10; i++) {
      const startTime = performance.now();
      
      try {
        const response = await fetch(`${baseURL}/api/v1/upload`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${authToken}`,
          },
          body: formData,
        });
        
        const endTime = performance.now();
        uploadTimes.push(endTime - startTime);
        
        expect(response.status).toBeLessThan(400);
      } catch (error) {
        console.warn(`Upload ${i + 1} failed:`, error);
      }
    }
    
    if (uploadTimes.length > 0) {
      const avgUploadTime = uploadTimes.reduce((a, b) => a + b, 0) / uploadTimes.length;
      console.log(`Average file upload time: ${avgUploadTime.toFixed(2)}ms`);
      
      // File uploads should complete within reasonable time
      expect(avgUploadTime).toBeLessThan(5000); // Less than 5 seconds for 1MB
    }
  });

  test('Stress Test - System Breaking Point', async () => {
    console.log('Running stress test to find system limits...');
    
    const stressLevels = [10, 25, 50, 100, 200];
    const results: Array<{ concurrency: number; avgResponseTime: number; errorRate: number; throughput: number }> = [];
    
    for (const concurrency of stressLevels) {
      console.log(`Testing with ${concurrency} concurrent users...`);
      
      const metrics = await LoadTestUtils.runConcurrentRequests(
        baseURL,
        '/api/v1/instances',
        'GET',
        concurrency,
        15000, // 15 seconds
        { Authorization: `Bearer ${authToken}` }
      );
      
      const result = {
        concurrency,
        avgResponseTime: metrics.getAverageResponseTime(),
        errorRate: metrics.getErrorRate(),
        throughput: metrics.getThroughput(),
      };
      
      results.push(result);
      
      console.log(`Concurrency: ${concurrency}, Avg Response: ${result.avgResponseTime.toFixed(2)}ms, Error Rate: ${result.errorRate.toFixed(2)}%, Throughput: ${result.throughput.toFixed(2)} req/s`);
      
      // If error rate is too high, we've found the breaking point
      if (result.errorRate > 10) {
        console.log(`System breaking point reached at ${concurrency} concurrent users`);
        break;
      }
    }
    
    // Log stress test summary
    console.log('\nStress Test Summary:');
    results.forEach(result => {
      console.log(`${result.concurrency} users: ${result.avgResponseTime.toFixed(2)}ms avg, ${result.errorRate.toFixed(2)}% errors, ${result.throughput.toFixed(2)} req/s`);
    });
    
    // System should handle at least 50 concurrent users with low error rate
    const fiftyUserResult = results.find(r => r.concurrency === 50);
    if (fiftyUserResult) {
      expect(fiftyUserResult.errorRate).toBeLessThan(5);
      expect(fiftyUserResult.avgResponseTime).toBeLessThan(1000);
    }
  });
});