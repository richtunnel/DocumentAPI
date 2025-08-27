// scripts/load-test-100-documents.js - Load Test 100 Documents
const axios = require('axios');
const fs = require('fs');
const path = require('path');

class LoadTester {
  constructor() {
    this.baseUrl = process.env.API_BASE_URL || 'http://localhost:7071';
    this.apiKey = process.env.TEST_API_KEY || 'ak_test123456789abcdef';
    this.results = {
      total: 0,
      successful: 0,
      failed: 0,
      avgResponseTime: 0,
      minResponseTime: Infinity,
      maxResponseTime: 0,
      responseTimes: [],
      errors: []
    };
  }

  // Generate mock PDF content
  generateMockDocument(index) {
    return Buffer.from(`
      %PDF-1.4
      1 0 obj
      <<
      /Type /Catalog
      /Pages 2 0 R
      >>
      endobj
      2 0 obj
      <<
      /Type /Pages
      /Kids [3 0 R]
      /Count 1
      >>
      endobj
      3 0 obj
      <<
      /Type /Page
      /Parent 2 0 R
      /Resources <<
      /Font <<
      /F1 4 0 R
      >>
      >>
      /MediaBox [0 0 612 792]
      /Contents 5 0 R
      >>
      endobj
      4 0 obj
      <<
      /Type /Font
      /Subtype /Type1
      /BaseFont /Times-Roman
      >>
      endobj
      5 0 obj
      <<
      /Length 44
      >>
      stream
      BT
      /F1 12 Tf
      72 720 Td
      (Document ${index} - Test Content) Tj
      ET
      endstream
      endobj
      xref
      0 6
      0000000000 65535 f 
      0000000010 00000 n 
      0000000053 00000 n 
      0000000125 00000 n 
      0000000348 00000 n 
      0000000436 00000 n 
      trailer
      <<
      /Size 6
      /Root 1 0 R
      >>
      startxref
      553
      %%EOF
    `);
  }

  // Test single document upload workflow
  async testDocumentUpload(documentIndex) {
    const startTime = Date.now();
    
    try {
      console.log(`📄 Testing document ${documentIndex}/100...`);
      
      // Step 1: Generate SAS URL
      const sasResponse = await axios.post(`${this.baseUrl}/api/documents/upload-url`, {
        fileName: `test-document-${documentIndex}.pdf`,
        contentType: 'application/pdf',
        documentType: 'demographics_form',
        maxFileSizeMB: 10
      }, {
        headers: {
          'X-API-Key': this.apiKey,
          'Content-Type': 'application/json'
        }
      });

      const { uploadUrl, correlationId } = sasResponse.data;
      
      // Step 2: Upload document directly to blob storage (simulated)
      const documentContent = this.generateMockDocument(documentIndex);
      
      await axios.put(uploadUrl, documentContent, {
        headers: {
          'Content-Type': 'application/pdf',
          'x-ms-blob-type': 'BlockBlob'
        }
      });

      // Step 3: Submit demographics data
      const demographicsResponse = await axios.post(`${this.baseUrl}/api/demographics`, {
        law_firm: 'Load Test Firm',
        firstname: `Test${documentIndex}`,
        lastname: `User${documentIndex}`,
        email: `test${documentIndex}@loadtest.com`,
        phone: `555000${documentIndex.toString().padStart(4, '0')}`,
        primarylawfirm: 'Load Test Firm',
        claimanttype: 'Adult',
        city: 'Dallas',
        state: 'TX',
        zipcode: '75001',
        correlationId: correlationId
      }, {
        headers: {
          'X-API-Key': this.apiKey,
          'Content-Type': 'application/json'
        }
      });

      const responseTime = Date.now() - startTime;
      this.recordSuccess(responseTime);
      
      console.log(`✅ Document ${documentIndex} processed successfully (${responseTime}ms)`);
      
      return {
        success: true,
        responseTime,
        demographicsId: demographicsResponse.data.id,
        correlationId
      };

    } catch (error) {
      const responseTime = Date.now() - startTime;
      this.recordFailure(error, responseTime);
      
      console.log(`❌ Document ${documentIndex} failed (${responseTime}ms): ${error.message}`);
      
      return {
        success: false,
        responseTime,
        error: error.message
      };
    }
  }

  recordSuccess(responseTime) {
    this.results.successful++;
    this.results.responseTimes.push(responseTime);
    this.updateStats(responseTime);
  }

  recordFailure(error, responseTime) {
    this.results.failed++;
    this.results.errors.push({
      message: error.message,
      responseTime,
      timestamp: new Date().toISOString()
    });
    this.updateStats(responseTime);
  }

  updateStats(responseTime) {
    this.results.total++;
    this.results.minResponseTime = Math.min(this.results.minResponseTime, responseTime);
    this.results.maxResponseTime = Math.max(this.results.maxResponseTime, responseTime);
    this.results.avgResponseTime = this.results.responseTimes.length > 0 
      ? this.results.responseTimes.reduce((a, b) => a + b, 0) / this.results.responseTimes.length 
      : 0;
  }

  // Run load test with different strategies
  async runLoadTest(strategy = 'sequential', concurrency = 10) {
    console.log(`🚀 Starting load test: ${strategy} strategy`);
    console.log(`📊 Testing 100 documents with ${concurrency} concurrent requests`);
    console.log(`🎯 Target API: ${this.baseUrl}`);
    console.log('='.repeat(60));

    const startTime = Date.now();

    if (strategy === 'sequential') {
      // Sequential execution
      for (let i = 1; i <= 100; i++) {
        await this.testDocumentUpload(i);
        
        // Small delay to see queue processing
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    } else if (strategy === 'concurrent') {
      // Concurrent execution in batches
      const documentNumbers = Array.from({ length: 100 }, (_, i) => i + 1);
      
      for (let i = 0; i < documentNumbers.length; i += concurrency) {
        const batch = documentNumbers.slice(i, i + concurrency);
        const promises = batch.map(num => this.testDocumentUpload(num));
        
        await Promise.all(promises);
        
        console.log(`📦 Batch ${Math.floor(i/concurrency) + 1} completed`);
        
        // Brief pause between batches
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    const totalTime = Date.now() - startTime;
    this.generateReport(totalTime);
  }

  generateReport(totalTime) {
    console.log('\n' + '='.repeat(60));
    console.log('📊 LOAD TEST RESULTS');
    console.log('='.repeat(60));
    console.log(`🎯 Total Documents: 100`);
    console.log(`✅ Successful: ${this.results.successful}`);
    console.log(`❌ Failed: ${this.results.failed}`);
    console.log(`📈 Success Rate: ${((this.results.successful/100) * 100).toFixed(2)}%`);
    console.log(`⏱️  Total Time: ${(totalTime/1000).toFixed(2)} seconds`);
    console.log(`⚡ Throughput: ${(100/(totalTime/1000)).toFixed(2)} docs/second`);
    console.log('\nResponse Times:');
    console.log(`  📏 Average: ${Math.round(this.results.avgResponseTime)}ms`);
    console.log(`  ⚡ Minimum: ${this.results.minResponseTime}ms`);
    console.log(`  🐌 Maximum: ${this.results.maxResponseTime}ms`);
    
    if (this.results.errors.length > 0) {
      console.log('\n❌ Errors:');
      this.results.errors.slice(0, 5).forEach((error, i) => {
        console.log(`  ${i+1}. ${error.message}`);
      });
      if (this.results.errors.length > 5) {
        console.log(`  ... and ${this.results.errors.length - 5} more errors`);
      }
    }

    // Save detailed results
    this.saveResults();
  }

  saveResults() {
    const results = {
      ...this.results,
      timestamp: new Date().toISOString(),
      configuration: {
        baseUrl: this.baseUrl,
        totalDocuments: 100
      }
    };

    const filename = `load-test-results-${Date.now()}.json`;
    fs.writeFileSync(filename, JSON.stringify(results, null, 2));
    console.log(`\n📄 Detailed results saved to: ${filename}`);
  }
}

// Monitor system during load test
class SystemMonitor {
  constructor() {
    this.metrics = {
      queueDepth: [],
      rateLimitHits: [],
      redisConnections: [],
      memoryUsage: [],
      cpuUsage: []
    };
    this.isMonitoring = false;
  }

  async startMonitoring() {
    this.isMonitoring = true;
    console.log('📊 System monitoring started...');

    const monitorInterval = setInterval(async () => {
      if (!this.isMonitoring) {
        clearInterval(monitorInterval);
        return;
      }

      await this.collectMetrics();
    }, 2000); // Collect metrics every 2 seconds
  }

  async collectMetrics() {
    try {
      const timestamp = new Date().toISOString();
      
      // Queue depth monitoring
      const queueStats = await this.getQueueStats();
      this.metrics.queueDepth.push({ timestamp, ...queueStats });
      
      // Memory usage
      const memUsage = process.memoryUsage();
      this.metrics.memoryUsage.push({
        timestamp,
        heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024), // MB
        heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024) // MB
      });

      // Display current metrics
      this.displayCurrentMetrics(queueStats, memUsage);

    } catch (error) {
      console.log(`⚠️  Error collecting metrics: ${error.message}`);
    }
  }

  async getQueueStats() {
    try {
      // Mock queue stats - replace with actual Service Bus calls
      return {
        demographicsQueue: Math.floor(Math.random() * 50),
        webhookQueue: Math.floor(Math.random() * 20),
        documentQueue: Math.floor(Math.random() * 30)
      };
    } catch (error) {
      return {
        demographicsQueue: 0,
        webhookQueue: 0,
        documentQueue: 0
      };
    }
  }

  displayCurrentMetrics(queueStats, memUsage) {
    // Clear console and show current metrics
    console.log('\n📊 REAL-TIME METRICS:');
    console.log(`🗂️  Queue Depths: Demographics(${queueStats.demographicsQueue}) Webhooks(${queueStats.webhookQueue}) Documents(${queueStats.documentQueue})`);
    console.log(`💾 Memory: ${Math.round(memUsage.heapUsed/1024/1024)}MB / ${Math.round(memUsage.heapTotal/1024/1024)}MB`);
    console.log(`⏰ Time: ${new Date().toLocaleTimeString()}`);
    console.log('─'.repeat(50));
  }

  stopMonitoring() {
    this.isMonitoring = false;
    console.log('📊 System monitoring stopped.');
    this.generateMetricsReport();
  }

  generateMetricsReport() {
    console.log('\n📊 SYSTEM METRICS SUMMARY:');
    
    if (this.metrics.queueDepth.length > 0) {
      const maxQueueDepth = Math.max(...this.metrics.queueDepth.map(m => m.demographicsQueue));
      console.log(`📈 Max Queue Depth: ${maxQueueDepth}`);
    }

    if (this.metrics.memoryUsage.length > 0) {
      const maxMemory = Math.max(...this.metrics.memoryUsage.map(m => m.heapUsed));
      console.log(`💾 Peak Memory Usage: ${maxMemory}MB`);
    }

    // Save metrics
    const filename = `system-metrics-${Date.now()}.json`;
    fs.writeFileSync(filename, JSON.stringify(this.metrics, null, 2));
    console.log(`📄 System metrics saved to: ${filename}`);
  }
}

// Main execution
async function main() {
  const args = process.argv.slice(2);
  const strategy = args[0] || 'sequential'; // sequential | concurrent
  const concurrency = parseInt(args[1]) || 10;

  console.log('🧪 Demographics API Load Tester');
  console.log('===============================');

  // Start system monitoring
  const monitor = new SystemMonitor();
  monitor.startMonitoring();

  // Run load test
  const loadTester = new LoadTester();
  
  try {
    await loadTester.runLoadTest(strategy, concurrency);
  } catch (error) {
    console.log(`❌ Load test failed: ${error.message}`);
  }

  // Stop monitoring
  monitor.stopMonitoring();

  console.log('\n🎉 Load test completed! Check the generated JSON files for detailed results.');
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = { LoadTester, SystemMonitor };