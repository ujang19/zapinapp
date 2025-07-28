#!/usr/bin/env ts-node

import { TestReportGenerator } from '../tests/reports/test-report-generator';
import { execSync } from 'child_process';
import * as path from 'path';

/**
 * Comprehensive test runner and report generator
 * This script runs all tests, collects metrics, and generates detailed reports
 */
async function runComprehensiveTests() {
  console.log('🚀 Starting Zapin WhatsApp SaaS Comprehensive Testing Suite');
  console.log('=' .repeat(60));

  const reportGenerator = new TestReportGenerator();
  const startTime = Date.now();

  try {
    // Step 1: Environment Setup
    console.log('\n📋 Step 1: Environment Setup');
    console.log('Checking environment configuration...');
    
    // Verify required environment variables
    const requiredEnvVars = [
      'DATABASE_URL',
      'REDIS_URL',
      'JWT_SECRET',
      'EVOLUTION_API_URL',
      'EVOLUTION_API_KEY'
    ];

    const missingEnvVars = requiredEnvVars.filter(envVar => !process.env[envVar]);
    if (missingEnvVars.length > 0) {
      console.log(`❌ Missing environment variables: ${missingEnvVars.join(', ')}`);
      console.log('Please ensure all required environment variables are set.');
      process.exit(1);
    }

    console.log('✅ Environment configuration verified');

    // Step 2: Database Setup
    console.log('\n🗄️  Step 2: Database Setup');
    console.log('Setting up test database...');
    
    try {
      execSync('npx prisma generate', { stdio: 'inherit' });
      execSync('npx prisma db push --force-reset', { stdio: 'inherit' });
      execSync('npx prisma db seed', { stdio: 'inherit' });
      console.log('✅ Database setup completed');
    } catch (error) {
      console.log('❌ Database setup failed:', error);
      console.log('Continuing with existing database state...');
    }

    // Step 3: Unit Tests
    console.log('\n🧪 Step 3: Running Unit Tests');
    await runTestSuite('Unit Tests', 'npm run test:unit', reportGenerator);

    // Step 4: Integration Tests
    console.log('\n🔗 Step 4: Running Integration Tests');
    await runTestSuite('Integration Tests', 'npm run test:integration', reportGenerator);

    // Step 5: API Tests
    console.log('\n🌐 Step 5: Running API Tests');
    await runTestSuite('API Tests', 'npm run test:integration -- --testPathPattern=api', reportGenerator);

    // Step 6: Security Tests
    console.log('\n🔒 Step 6: Running Security Tests');
    await runTestSuite('Security Tests', 'npm run test:security', reportGenerator);

    // Step 7: Performance Tests
    console.log('\n⚡ Step 7: Running Performance Tests');
    await runTestSuite('Performance Tests', 'npm run test:performance', reportGenerator);

    // Step 8: Load Tests
    console.log('\n📈 Step 8: Running Load Tests');
    await runTestSuite('Load Tests', 'npm run test -- --testPathPattern=load', reportGenerator);

    // Step 9: System Metrics Collection
    console.log('\n📊 Step 9: Collecting System Metrics');
    await reportGenerator.collectSystemMetrics();

    // Step 10: Generate Reports
    console.log('\n📄 Step 10: Generating Comprehensive Reports');
    const { htmlPath, jsonPath } = await reportGenerator.generateComprehensiveReport();

    // Step 11: Summary
    const totalTime = Date.now() - startTime;
    console.log('\n' + '='.repeat(60));
    console.log('🎉 COMPREHENSIVE TESTING COMPLETED');
    console.log('='.repeat(60));
    console.log(`⏱️  Total execution time: ${(totalTime / 1000 / 60).toFixed(2)} minutes`);
    console.log(`📄 HTML Report: ${htmlPath}`);
    console.log(`📄 JSON Report: ${jsonPath}`);
    console.log('\n📋 Next Steps:');
    console.log('1. Review the generated reports for test results and performance metrics');
    console.log('2. Address any failing tests or performance issues');
    console.log('3. Implement recommended optimizations');
    console.log('4. Schedule regular testing runs for continuous monitoring');
    
    // Open HTML report if possible
    try {
      const openCommand = process.platform === 'darwin' ? 'open' : 
                         process.platform === 'win32' ? 'start' : 'xdg-open';
      execSync(`${openCommand} "${htmlPath}"`, { stdio: 'ignore' });
      console.log('🌐 HTML report opened in your default browser');
    } catch (error) {
      console.log('💡 Tip: Open the HTML report in your browser to view detailed results');
    }

  } catch (error) {
    console.error('\n❌ Comprehensive testing failed:', error);
    process.exit(1);
  }
}

/**
 * Run a specific test suite and collect results
 */
async function runTestSuite(
  suiteName: string, 
  command: string, 
  reportGenerator: TestReportGenerator
): Promise<void> {
  console.log(`Running ${suiteName}...`);
  const startTime = Date.now();
  
  try {
    // Run the test command
    const output = execSync(command, { 
      encoding: 'utf8',
      timeout: 600000, // 10 minutes timeout
      maxBuffer: 1024 * 1024 * 10 // 10MB buffer
    });
    
    const duration = Date.now() - startTime;
    
    // Parse Jest output to extract test results
    const testResults = parseJestOutput(output);
    
    // Add results to report generator
    testResults.forEach(result => {
      reportGenerator.addTestResult({
        testSuite: suiteName,
        testName: result.testName,
        status: result.status,
        duration: result.duration || duration / testResults.length,
        error: result.error
      });
    });

    console.log(`✅ ${suiteName} completed successfully in ${(duration / 1000).toFixed(2)}s`);
    
    // Log summary
    const passed = testResults.filter(r => r.status === 'passed').length;
    const failed = testResults.filter(r => r.status === 'failed').length;
    const skipped = testResults.filter(r => r.status === 'skipped').length;
    
    console.log(`   📊 Results: ${passed} passed, ${failed} failed, ${skipped} skipped`);
    
  } catch (error) {
    const duration = Date.now() - startTime;
    console.log(`❌ ${suiteName} failed after ${(duration / 1000).toFixed(2)}s`);
    
    // Add failed test result
    reportGenerator.addTestResult({
      testSuite: suiteName,
      testName: 'Test Suite Execution',
      status: 'failed',
      duration,
      error: error instanceof Error ? error.message : String(error)
    });
    
    // Continue with other tests instead of failing completely
    console.log('   ⚠️  Continuing with remaining test suites...');
  }
}

/**
 * Parse Jest output to extract individual test results
 */
function parseJestOutput(output: string): Array<{
  testName: string;
  status: 'passed' | 'failed' | 'skipped';
  duration?: number;
  error?: string;
}> {
  const results = [];
  
  // This is a simplified parser - in a real implementation, you'd want more robust parsing
  const lines = output.split('\n');
  
  let currentSuite = '';
  let testCount = 0;
  
  for (const line of lines) {
    // Extract test suite names
    if (line.includes('PASS') || line.includes('FAIL')) {
      const match = line.match(/(PASS|FAIL)\s+(.+\.test\.(ts|js))/);
      if (match) {
        currentSuite = match[2];
      }
    }
    
    // Extract individual test results
    if (line.includes('✓') || line.includes('✗') || line.includes('○')) {
      testCount++;
      const testName = line.replace(/^\s*[✓✗○]\s*/, '').replace(/\s*\(\d+ms\)$/, '');
      
      let status: 'passed' | 'failed' | 'skipped' = 'passed';
      if (line.includes('✗')) status = 'failed';
      if (line.includes('○')) status = 'skipped';
      
      // Extract duration if present
      const durationMatch = line.match(/\((\d+)ms\)/);
      const duration = durationMatch ? parseInt(durationMatch[1]) : undefined;
      
      results.push({
        testName: testName || `Test ${testCount}`,
        status,
        duration
      });
    }
  }
  
  // If no individual tests found, create a summary result
  if (results.length === 0) {
    const passed = output.includes('PASS') && !output.includes('FAIL');
    results.push({
      testName: 'Test Suite',
      status: passed ? 'passed' as const : 'failed' as const,
      error: passed ? undefined : 'Test suite execution failed'
    });
  }
  
  return results;
}

/**
 * Validate system requirements
 */
function validateSystemRequirements(): boolean {
  console.log('Validating system requirements...');
  
  try {
    // Check Node.js version
    const nodeVersion = process.version;
    const majorVersion = parseInt(nodeVersion.slice(1).split('.')[0]);
    
    if (majorVersion < 18) {
      console.log(`❌ Node.js version ${nodeVersion} is not supported. Please use Node.js 18 or higher.`);
      return false;
    }
    
    // Check if required commands are available
    const requiredCommands = ['npm', 'npx'];
    
    for (const cmd of requiredCommands) {
      try {
        execSync(`which ${cmd}`, { stdio: 'ignore' });
      } catch (error) {
        console.log(`❌ Required command '${cmd}' not found in PATH`);
        return false;
      }
    }
    
    console.log('✅ System requirements validated');
    return true;
    
  } catch (error) {
    console.log('❌ System validation failed:', error);
    return false;
  }
}

// Main execution
if (require.main === module) {
  // Validate system requirements first
  if (!validateSystemRequirements()) {
    process.exit(1);
  }
  
  // Run comprehensive tests
  runComprehensiveTests().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

export { runComprehensiveTests, runTestSuite, parseJestOutput };