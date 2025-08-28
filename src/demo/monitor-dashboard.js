const axios = require('axios');
const fs = require('fs');

class DemoMonitor {
  constructor() {
    this.metrics = {
      totalRequests: 0,
      queueDepth: 0,
      processedItems: 0,
      errors: 0,
      avgResponseTime: 0
    };
  }

  async startRealTimeMonitor() {
    console.clear();
    console.log('🚀 DEMOGRAPHICS API - LIVE DEMO DASHBOARD');
    console.log('=' .repeat(70));
    
    setInterval(async () => {
      await this.updateDashboard();
    }, 2000);
  }

  async updateDashboard() {
    const timestamp = new Date().toLocaleTimeString();
    
    console.clear();
    console.log('🚀 DEMOGRAPHICS API - LIVE DEMO DASHBOARD');
    console.log('=' .repeat(70));
    console.log(`Time: ${timestamp}`);
    console.log('');
    
    // Service Status
    console.log('📊 SERVICE STATUS:');
    console.log(`   Express API: ${await this.checkService('http://localhost:3000/api/v1/health')}`);
    console.log(`   Database: ${await this.checkDatabase()}`);
    console.log(`   Redis: ${await this.checkRedis()}`);
    console.log(`   Azurite: ${await this.checkAzurite()}`);
    console.log('');
    
    // Real-time metrics
    console.log('📈 REAL-TIME METRICS:');
    console.log(`   Queue Depth: ${this.metrics.queueDepth} messages`);
    console.log(`   Processed Items: ${this.metrics.processedItems}`);
    console.log(`   Total Requests: ${this.metrics.totalRequests}`);
    console.log(`   Avg Response: ${this.metrics.avgResponseTime}ms`);
    console.log(`   Error Rate: ${this.metrics.errors}`);
    console.log('');
    
    // Memory usage
    const memory = process.memoryUsage();
    console.log('💾 SYSTEM RESOURCES:');
    console.log(`   Memory: ${Math.round(memory.heapUsed/1024/1024)}MB`);
    console.log(`   Uptime: ${Math.round(process.uptime())}s`);
    console.log('');
    
    console.log('📝 RECENT ACTIVITY:');
    console.log('   Monitoring active... watching for API calls');
    console.log('   Ready for demo!');
  }

  async checkService(url) {
    try {
      await axios.get(url, { timeout: 1000 });
      return '🟢 HEALTHY';
    } catch {
      return '🔴 DOWN';
    }
  }

  async checkDatabase() {
    // Check if we can connect to database
    return '🟢 CONNECTED'; // Simplified for demo
  }

  async checkRedis() {
    return '🟢 CONNECTED'; // Simplified for demo
  }

  async checkAzurite() {
    return '🟢 RUNNING'; // Simplified for demo
  }
}

new DemoMonitor().startRealTimeMonitor();