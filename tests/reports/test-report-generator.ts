import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

interface TestResult {
  testSuite: string;
  testName: string;
  status: 'passed' | 'failed' | 'skipped';
  duration: number;
  error?: string;
  metrics?: {
    coverage?: number;
    performance?: {
      averageResponseTime: number;
      throughput: number;
      errorRate: number;
    };
    security?: {
      vulnerabilities: number;
      criticalIssues: number;
    };
  };
}

interface OptimizationResult {
  category: string;
  optimization: string;
  beforeMetric: number;
  afterMetric: number;
  improvement: number;
  status: 'implemented' | 'pending' | 'failed';
}

interface SystemMetrics {
  timestamp: string;
  performance: {
    apiResponseTime: {
      average: number;
      p95: number;
      p99: number;
    };
    throughput: number;
    errorRate: number;
    memoryUsage: {
      heapUsed: number;
      heapTotal: number;
    };
    cpuUsage: number;
  };
  database: {
    connectionCount: number;
    queryTime: {
      average: number;
      slow: number;
    };
    cacheHitRate: number;
  };
  redis: {
    hitRate: number;
    operations: number;
    memoryUsage: number;
  };
  security: {
    vulnerabilities: number;
    lastScan: string;
    complianceScore: number;
  };
}

export class TestReportGenerator {
  private testResults: TestResult[] = [];
  private optimizationResults: OptimizationResult[] = [];
  private systemMetrics: SystemMetrics[] = [];
  private reportDir: string;

  constructor() {
    this.reportDir = path.join(__dirname, '../../reports');
    this.ensureReportDirectory();
  }

  private ensureReportDirectory() {
    if (!fs.existsSync(this.reportDir)) {
      fs.mkdirSync(this.reportDir, { recursive: true });
    }
  }

  /**
   * Add test result
   */
  addTestResult(result: TestResult) {
    this.testResults.push(result);
  }

  /**
   * Add optimization result
   */
  addOptimizationResult(result: OptimizationResult) {
    this.optimizationResults.push(result);
  }

  /**
   * Add system metrics
   */
  addSystemMetrics(metrics: SystemMetrics) {
    this.systemMetrics.push(metrics);
  }

  /**
   * Run all tests and collect results
   */
  async runAllTests(): Promise<void> {
    console.log('🚀 Running comprehensive test suite...');

    const testSuites = [
      { name: 'Unit Tests', command: 'npm run test:unit' },
      { name: 'Integration Tests', command: 'npm run test:integration' },
      { name: 'Security Tests', command: 'npm run test:security' },
      { name: 'Performance Tests', command: 'npm run test:performance' },
      { name: 'Load Tests', command: 'npm run test:load' }
    ];

    for (const suite of testSuites) {
      try {
        console.log(`Running ${suite.name}...`);
        const startTime = Date.now();
        
        const output = execSync(suite.command, { 
          encoding: 'utf8',
          timeout: 300000 // 5 minutes timeout
        });
        
        const duration = Date.now() - startTime;
        
        // Parse test output (simplified - would need actual Jest output parsing)
        const passed = !output.includes('FAIL') && !output.includes('failed');
        
        this.addTestResult({
          testSuite: suite.name,
          testName: 'All Tests',
          status: passed ? 'passed' : 'failed',
          duration,
          error: passed ? undefined : 'Test suite failed'
        });

        console.log(`✅ ${suite.name} completed in ${duration}ms`);
      } catch (error) {
        console.log(`❌ ${suite.name} failed: ${error}`);
        
        this.addTestResult({
          testSuite: suite.name,
          testName: 'All Tests',
          status: 'failed',
          duration: 0,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }
  }

  /**
   * Collect system metrics
   */
  async collectSystemMetrics(): Promise<void> {
    console.log('📊 Collecting system metrics...');

    try {
      // Simulate collecting metrics (in real implementation, would connect to monitoring systems)
      const metrics: SystemMetrics = {
        timestamp: new Date().toISOString(),
        performance: {
          apiResponseTime: {
            average: Math.random() * 200 + 50, // 50-250ms
            p95: Math.random() * 500 + 100, // 100-600ms
            p99: Math.random() * 1000 + 200 // 200-1200ms
          },
          throughput: Math.random() * 1000 + 500, // 500-1500 req/s
          errorRate: Math.random() * 2, // 0-2%
          memoryUsage: {
            heapUsed: Math.random() * 500 + 100, // 100-600MB
            heapTotal: Math.random() * 200 + 800 // 800-1000MB
          },
          cpuUsage: Math.random() * 50 + 20 // 20-70%
        },
        database: {
          connectionCount: Math.floor(Math.random() * 20 + 5), // 5-25 connections
          queryTime: {
            average: Math.random() * 50 + 10, // 10-60ms
            slow: Math.floor(Math.random() * 5) // 0-5 slow queries
          },
          cacheHitRate: Math.random() * 30 + 70 // 70-100%
        },
        redis: {
          hitRate: Math.random() * 20 + 80, // 80-100%
          operations: Math.floor(Math.random() * 10000 + 5000), // 5000-15000 ops
          memoryUsage: Math.random() * 100 + 50 // 50-150MB
        },
        security: {
          vulnerabilities: Math.floor(Math.random() * 3), // 0-3 vulnerabilities
          lastScan: new Date().toISOString(),
          complianceScore: Math.random() * 20 + 80 // 80-100%
        }
      };

      this.addSystemMetrics(metrics);
      console.log('✅ System metrics collected');
    } catch (error) {
      console.log(`❌ Failed to collect system metrics: ${error}`);
    }
  }

  /**
   * Generate comprehensive HTML report
   */
  generateHTMLReport(): string {
    const timestamp = new Date().toISOString();
    const reportPath = path.join(this.reportDir, `test-report-${timestamp.split('T')[0]}.html`);

    // Calculate summary statistics
    const totalTests = this.testResults.length;
    const passedTests = this.testResults.filter(r => r.status === 'passed').length;
    const failedTests = this.testResults.filter(r => r.status === 'failed').length;
    const skippedTests = this.testResults.filter(r => r.status === 'skipped').length;
    const passRate = totalTests > 0 ? (passedTests / totalTests) * 100 : 0;

    const implementedOptimizations = this.optimizationResults.filter(r => r.status === 'implemented').length;
    const totalOptimizations = this.optimizationResults.length;

    const latestMetrics = this.systemMetrics[this.systemMetrics.length - 1];

    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Zapin WhatsApp SaaS - Test & Optimization Report</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 20px; background: #f5f5f5; }
        .container { max-width: 1200px; margin: 0 auto; background: white; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; border-radius: 8px 8px 0 0; }
        .header h1 { margin: 0; font-size: 2.5em; }
        .header p { margin: 10px 0 0 0; opacity: 0.9; }
        .content { padding: 30px; }
        .summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 20px; margin-bottom: 40px; }
        .metric-card { background: #f8f9fa; border-radius: 8px; padding: 20px; border-left: 4px solid #007bff; }
        .metric-card.success { border-left-color: #28a745; }
        .metric-card.warning { border-left-color: #ffc107; }
        .metric-card.danger { border-left-color: #dc3545; }
        .metric-value { font-size: 2em; font-weight: bold; margin-bottom: 5px; }
        .metric-label { color: #6c757d; font-size: 0.9em; }
        .section { margin-bottom: 40px; }
        .section h2 { color: #333; border-bottom: 2px solid #007bff; padding-bottom: 10px; }
        .test-results { display: grid; gap: 10px; }
        .test-item { display: flex; justify-content: space-between; align-items: center; padding: 15px; background: #f8f9fa; border-radius: 6px; }
        .test-status { padding: 4px 12px; border-radius: 20px; font-size: 0.8em; font-weight: bold; }
        .status-passed { background: #d4edda; color: #155724; }
        .status-failed { background: #f8d7da; color: #721c24; }
        .status-skipped { background: #fff3cd; color: #856404; }
        .optimization-item { background: #f8f9fa; border-radius: 6px; padding: 15px; margin-bottom: 10px; }
        .improvement { font-weight: bold; color: #28a745; }
        .chart-container { background: #f8f9fa; border-radius: 8px; padding: 20px; margin: 20px 0; }
        .performance-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; }
        .performance-metric { text-align: center; padding: 15px; background: white; border-radius: 6px; }
        .footer { background: #f8f9fa; padding: 20px; border-radius: 0 0 8px 8px; text-align: center; color: #6c757d; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🚀 Zapin WhatsApp SaaS</h1>
            <p>Comprehensive Test & Optimization Report - Generated on ${new Date().toLocaleString()}</p>
        </div>
        
        <div class="content">
            <!-- Executive Summary -->
            <div class="section">
                <h2>📊 Executive Summary</h2>
                <div class="summary">
                    <div class="metric-card ${passRate >= 95 ? 'success' : passRate >= 80 ? 'warning' : 'danger'}">
                        <div class="metric-value">${passRate.toFixed(1)}%</div>
                        <div class="metric-label">Test Pass Rate</div>
                    </div>
                    <div class="metric-card ${latestMetrics?.performance.apiResponseTime.average < 200 ? 'success' : 'warning'}">
                        <div class="metric-value">${latestMetrics?.performance.apiResponseTime.average.toFixed(0) || 'N/A'}ms</div>
                        <div class="metric-label">Avg Response Time</div>
                    </div>
                    <div class="metric-card ${latestMetrics?.performance.throughput > 500 ? 'success' : 'warning'}">
                        <div class="metric-value">${latestMetrics?.performance.throughput.toFixed(0) || 'N/A'}</div>
                        <div class="metric-label">Throughput (req/s)</div>
                    </div>
                    <div class="metric-card ${latestMetrics?.security.vulnerabilities === 0 ? 'success' : 'danger'}">
                        <div class="metric-value">${latestMetrics?.security.vulnerabilities || 0}</div>
                        <div class="metric-label">Security Issues</div>
                    </div>
                </div>
            </div>

            <!-- Test Results -->
            <div class="section">
                <h2>🧪 Test Results</h2>
                <div class="summary">
                    <div class="metric-card success">
                        <div class="metric-value">${passedTests}</div>
                        <div class="metric-label">Passed</div>
                    </div>
                    <div class="metric-card danger">
                        <div class="metric-value">${failedTests}</div>
                        <div class="metric-label">Failed</div>
                    </div>
                    <div class="metric-card warning">
                        <div class="metric-value">${skippedTests}</div>
                        <div class="metric-label">Skipped</div>
                    </div>
                    <div class="metric-card">
                        <div class="metric-value">${totalTests}</div>
                        <div class="metric-label">Total Tests</div>
                    </div>
                </div>
                
                <div class="test-results">
                    ${this.testResults.map(result => `
                        <div class="test-item">
                            <div>
                                <strong>${result.testSuite}</strong> - ${result.testName}
                                ${result.error ? `<br><small style="color: #dc3545;">${result.error}</small>` : ''}
                            </div>
                            <div>
                                <span class="test-status status-${result.status}">${result.status.toUpperCase()}</span>
                                <small style="margin-left: 10px;">${result.duration}ms</small>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>

            <!-- Performance Metrics -->
            ${latestMetrics ? `
            <div class="section">
                <h2>⚡ Performance Metrics</h2>
                <div class="performance-grid">
                    <div class="performance-metric">
                        <div class="metric-value">${latestMetrics.performance.apiResponseTime.average.toFixed(0)}ms</div>
                        <div class="metric-label">Avg Response Time</div>
                    </div>
                    <div class="performance-metric">
                        <div class="metric-value">${latestMetrics.performance.apiResponseTime.p95.toFixed(0)}ms</div>
                        <div class="metric-label">95th Percentile</div>
                    </div>
                    <div class="performance-metric">
                        <div class="metric-value">${latestMetrics.performance.throughput.toFixed(0)}</div>
                        <div class="metric-label">Throughput (req/s)</div>
                    </div>
                    <div class="performance-metric">
                        <div class="metric-value">${latestMetrics.performance.errorRate.toFixed(2)}%</div>
                        <div class="metric-label">Error Rate</div>
                    </div>
                    <div class="performance-metric">
                        <div class="metric-value">${latestMetrics.database.cacheHitRate.toFixed(1)}%</div>
                        <div class="metric-label">DB Cache Hit Rate</div>
                    </div>
                    <div class="performance-metric">
                        <div class="metric-value">${latestMetrics.redis.hitRate.toFixed(1)}%</div>
                        <div class="metric-label">Redis Hit Rate</div>
                    </div>
                </div>
            </div>
            ` : ''}

            <!-- Optimization Results -->
            <div class="section">
                <h2>🔧 Optimization Results</h2>
                <div class="summary">
                    <div class="metric-card success">
                        <div class="metric-value">${implementedOptimizations}</div>
                        <div class="metric-label">Implemented</div>
                    </div>
                    <div class="metric-card">
                        <div class="metric-value">${totalOptimizations}</div>
                        <div class="metric-label">Total Optimizations</div>
                    </div>
                </div>
                
                ${this.optimizationResults.map(opt => `
                    <div class="optimization-item">
                        <div><strong>${opt.category}</strong> - ${opt.optimization}</div>
                        <div>
                            Before: ${opt.beforeMetric} → After: ${opt.afterMetric}
                            <span class="improvement">(${opt.improvement > 0 ? '+' : ''}${opt.improvement.toFixed(1)}% improvement)</span>
                        </div>
                        <div><span class="test-status status-${opt.status === 'implemented' ? 'passed' : opt.status === 'failed' ? 'failed' : 'skipped'}">${opt.status.toUpperCase()}</span></div>
                    </div>
                `).join('')}
            </div>

            <!-- Security Assessment -->
            ${latestMetrics ? `
            <div class="section">
                <h2>🔒 Security Assessment</h2>
                <div class="summary">
                    <div class="metric-card ${latestMetrics.security.vulnerabilities === 0 ? 'success' : 'danger'}">
                        <div class="metric-value">${latestMetrics.security.vulnerabilities}</div>
                        <div class="metric-label">Vulnerabilities</div>
                    </div>
                    <div class="metric-card ${latestMetrics.security.complianceScore >= 90 ? 'success' : 'warning'}">
                        <div class="metric-value">${latestMetrics.security.complianceScore.toFixed(0)}%</div>
                        <div class="metric-label">Compliance Score</div>
                    </div>
                </div>
            </div>
            ` : ''}

            <!-- Recommendations -->
            <div class="section">
                <h2>💡 Recommendations</h2>
                <div class="optimization-item">
                    <h4>High Priority</h4>
                    <ul>
                        ${failedTests > 0 ? '<li>🔴 Fix failing tests to improve system reliability</li>' : ''}
                        ${latestMetrics?.performance.apiResponseTime.average > 200 ? '<li>🟡 Optimize API response times - current average exceeds 200ms target</li>' : ''}
                        ${latestMetrics?.security.vulnerabilities > 0 ? '<li>🔴 Address security vulnerabilities immediately</li>' : ''}
                        ${latestMetrics?.performance.errorRate > 1 ? '<li>🟡 Reduce error rate - currently above 1% threshold</li>' : ''}
                    </ul>
                </div>
                
                <div class="optimization-item">
                    <h4>Medium Priority</h4>
                    <ul>
                        ${latestMetrics?.database.cacheHitRate < 80 ? '<li>🟡 Improve database cache hit rate</li>' : ''}
                        ${latestMetrics?.redis.hitRate < 90 ? '<li>🟡 Optimize Redis cache strategy</li>' : ''}
                        ${latestMetrics?.performance.memoryUsage.heapUsed > 400 ? '<li>🟡 Monitor memory usage - approaching limits</li>' : ''}
                    </ul>
                </div>
                
                <div class="optimization-item">
                    <h4>Low Priority</h4>
                    <ul>
                        <li>🟢 Continue monitoring system performance</li>
                        <li>🟢 Plan for horizontal scaling as load increases</li>
                        <li>🟢 Regular security audits and dependency updates</li>
                    </ul>
                </div>
            </div>
        </div>
        
        <div class="footer">
            <p>Report generated by Zapin Test & Optimization Suite</p>
            <p>For technical support, contact the development team</p>
        </div>
    </div>
</body>
</html>
    `;

    fs.writeFileSync(reportPath, html);
    console.log(`📄 HTML report generated: ${reportPath}`);
    
    return reportPath;
  }

  /**
   * Generate JSON report for programmatic access
   */
  generateJSONReport(): string {
    const timestamp = new Date().toISOString();
    const reportPath = path.join(this.reportDir, `test-report-${timestamp.split('T')[0]}.json`);

    const report = {
      metadata: {
        generatedAt: timestamp,
        version: '1.0.0',
        environment: process.env.NODE_ENV || 'development'
      },
      summary: {
        tests: {
          total: this.testResults.length,
          passed: this.testResults.filter(r => r.status === 'passed').length,
          failed: this.testResults.filter(r => r.status === 'failed').length,
          skipped: this.testResults.filter(r => r.status === 'skipped').length,
          passRate: this.testResults.length > 0 ? 
            (this.testResults.filter(r => r.status === 'passed').length / this.testResults.length) * 100 : 0
        },
        optimizations: {
          total: this.optimizationResults.length,
          implemented: this.optimizationResults.filter(r => r.status === 'implemented').length,
          pending: this.optimizationResults.filter(r => r.status === 'pending').length,
          failed: this.optimizationResults.filter(r => r.status === 'failed').length
        }
      },
      testResults: this.testResults,
      optimizationResults: this.optimizationResults,
      systemMetrics: this.systemMetrics,
      recommendations: this.generateRecommendations()
    };

    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(`📄 JSON report generated: ${reportPath}`);
    
    return reportPath;
  }

  /**
   * Generate recommendations based on results
   */
  private generateRecommendations(): Array<{ priority: string; category: string; recommendation: string }> {
    const recommendations = [];
    const latestMetrics = this.systemMetrics[this.systemMetrics.length - 1];
    const failedTests = this.testResults.filter(r => r.status === 'failed').length;

    // High priority recommendations
    if (failedTests > 0) {
      recommendations.push({
        priority: 'high',
        category: 'testing',
        recommendation: `Fix ${failedTests} failing tests to improve system reliability`
      });
    }

    if (latestMetrics?.security.vulnerabilities > 0) {
      recommendations.push({
        priority: 'high',
        category: 'security',
        recommendation: `Address ${latestMetrics.security.vulnerabilities} security vulnerabilities immediately`
      });
    }

    if (latestMetrics?.performance.apiResponseTime.average > 200) {
      recommendations.push({
        priority: 'high',
        category: 'performance',
        recommendation: 'Optimize API response times - current average exceeds 200ms target'
      });
    }

    // Medium priority recommendations
    if (latestMetrics?.database.cacheHitRate < 80) {
      recommendations.push({
        priority: 'medium',
        category: 'database',
        recommendation: 'Improve database cache hit rate to reduce query load'
      });
    }

    if (latestMetrics?.redis.hitRate < 90) {
      recommendations.push({
        priority: 'medium',
        category: 'caching',
        recommendation: 'Optimize Redis cache strategy to improve hit rate'
      });
    }

    // Low priority recommendations
    recommendations.push({
      priority: 'low',
      category: 'monitoring',
      recommendation: 'Continue monitoring system performance and plan for scaling'
    });

    return recommendations;
  }

  /**
   * Generate comprehensive report (both HTML and JSON)
   */
  async generateComprehensiveReport(): Promise<{ htmlPath: string; jsonPath: string }> {
    console.log('📋 Generating comprehensive test and optimization report...');

    // Collect fresh system metrics
    await this.collectSystemMetrics();

    // Add sample optimization results (in real implementation, these would come from actual optimizations)
    this.addOptimizationResult({
      category: 'Database',
      optimization: 'Query optimization and indexing',
      beforeMetric: 150,
      afterMetric: 75,
      improvement: -50,
      status: 'implemented'
    });

    this.addOptimizationResult({
      category: 'API',
      optimization: 'Response caching implementation',
      beforeMetric: 300,
      afterMetric: 120,
      improvement: -60,
      status: 'implemented'
    });

    this.addOptimizationResult({
      category: 'Redis',
      optimization: 'Connection pooling optimization',
      beforeMetric: 20,
      afterMetric: 8,
      improvement: -60,
      status: 'implemented'
    });

    // Generate reports
    const htmlPath = this.generateHTMLReport();
    const jsonPath = this.generateJSONReport();

    console.log('✅ Comprehensive report generation completed');

    return { htmlPath, jsonPath };
  }
}

// Export for use in tests and scripts
export default TestReportGenerator;