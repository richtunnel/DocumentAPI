import { ServiceBusClient } from '@azure/service-bus';
import * as https from 'https';
import * as http from 'http';

interface MonitorConfig {
  serviceBusConnectionString: string | undefined;
  functionAppName: string;
  webhookTestUrl: string | undefined;
}

interface MonitorStats {
  totalMessages: number;
  successfulMessages: number;
  failedMessages: number;
  webhookDeliveries: number;
  emailsSent: number;
  smsSent: number;
  avgProcessingTime: number;
  errors: LogError[];
  startTime: Date;
  lastUpdate: Date;
}

interface LogError {
  timestamp: Date;
  message: string;
}

interface QueueStats {
  hasMessages: boolean;
  messageCount: number;
  status: string;
  error?: string;
}

interface WebhookTestResult {
  status: number;
  success: boolean;
  error?: string;
  response?: string;
}

class LogMonitor {
  private config: MonitorConfig;
  private stats: MonitorStats;
  private logBuffer: Array<{ timestamp: Date; message: string; level: string }>;
  private isRunning: boolean;

  constructor() {
    this.config = {
      serviceBusConnectionString: process.env.SERVICE_BUS_CONNECTION_STRING,
      functionAppName: process.env.AZURE_FUNCTION_APP_NAME || 'demographics-api',
      webhookTestUrl: process.env.TEST_WEBHOOK_URL,
    };

    this.stats = {
      totalMessages: 0,
      successfulMessages: 0,
      failedMessages: 0,
      webhookDeliveries: 0,
      emailsSent: 0,
      smsSent: 0,
      avgProcessingTime: 0,
      errors: [],
      startTime: new Date(),
      lastUpdate: new Date()
    };

    this.logBuffer = [];
    this.isRunning = false;
  }

  async monitorServiceBusQueues(): Promise<Record<string, QueueStats> | { error: string }> {
    if (!this.config.serviceBusConnectionString) {
      return { error: 'Service Bus connection not configured' };
    }

    try {
      const client = new ServiceBusClient(this.config.serviceBusConnectionString);
      const queues = [
        'demographics-processing',
        'demographics-batch-processing', 
        'webhook-notifications'
      ];

      const queueStats: Record<string, QueueStats> = {};
      
      for (const queueName of queues) {
        try {
          const receiver = client.createReceiver(queueName, { receiveMode: 'peekLock' });
          const peekedMessages = await receiver.peekMessages(5);
          
          queueStats[queueName] = {
            hasMessages: peekedMessages.length > 0,
            messageCount: peekedMessages.length,
            status: 'connected'
          };
          
          await receiver.close();
        } catch (queueError: any) {
          queueStats[queueName] = {
            hasMessages: false,
            messageCount: 0,
            status: 'error',
            error: queueError.message
          };
        }
      }

      await client.close();
      return queueStats;
      
    } catch (error: any) {
      return { error: `Service Bus error: ${error.message}` };
    }
  }

  async testWebhookEndpoint(url?: string): Promise<WebhookTestResult> {
    const testUrl = url || this.config.webhookTestUrl;
    if (!testUrl) {
      return { status: 0, success: false, error: 'No webhook URL configured' };
    }

    return new Promise((resolve) => {
      const testPayload = JSON.stringify({
        event: 'monitoring_test',
        data: { timestamp: new Date().toISOString() },
        test: true
      });

      const urlObj = new URL(testUrl);
      const client = urlObj.protocol === 'https:' ? https : http;

      const options = {
        hostname: urlObj.hostname,
        port: urlObj.port,
        path: urlObj.pathname + urlObj.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': testPayload.length,
          'User-Agent': 'Demographics-Monitor/1.0'
        },
        timeout: 5000
      };

      const req = client.request(options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          resolve({
            status: res.statusCode || 0,
            success: (res.statusCode || 0) >= 200 && (res.statusCode || 0) < 300,
            response: data.substring(0, 200)
          });
        });
      });

      req.on('error', (error: any) => {
        resolve({
          status: 0,
          success: false,
          error: error.message
        });
      });

      req.on('timeout', () => {
        req.destroy();
        resolve({
          status: 0,
          success: false,
          error: 'Request timeout'
        });
      });

      req.write(testPayload);
      req.end();
    });
  }

  parseLogLine(line: string): void {
    if (!line || typeof line !== 'string') return;

    const timestamp = new Date();
    const logEntry = {
      timestamp,
      message: line,
      level: 'info'
    };

    if (line.toLowerCase().includes('error')) {
      logEntry.level = 'error';
      this.stats.errors.push({
        timestamp,
        message: line.substring(0, 200)
      });
    } else if (line.toLowerCase().includes('warn')) {
      logEntry.level = 'warning';
    }

    if (line.includes('Message processed successfully') || line.includes('processed successfully')) {
      this.stats.successfulMessages++;
      this.stats.totalMessages++;
      
      const timeMatch = line.match(/processingTime[":]\s*(\d+)/);
      if (timeMatch) {
        const time = parseInt(timeMatch[1]);
        this.stats.avgProcessingTime = Math.round((this.stats.avgProcessingTime + time) / 2);
      }
    } else if (line.includes('Error processing') || line.includes('failed')) {
      this.stats.failedMessages++;
      this.stats.totalMessages++;
    } else if (line.includes('Webhook delivered') || (line.includes('webhook') && line.includes('success'))) {
      this.stats.webhookDeliveries++;
    } else if (line.includes('email') && (line.includes('sent') || line.includes('delivered'))) {
      this.stats.emailsSent++;
    } else if (line.includes('SMS') && (line.includes('sent') || line.includes('delivered'))) {
      this.stats.smsSent++;
    }

    this.logBuffer.push(logEntry);
    if (this.logBuffer.length > 100) {
      this.logBuffer.shift();
    }

    this.stats.lastUpdate = timestamp;
  }

  async displayDashboard(): Promise<void> {
    console.clear();
    console.log('Demographics API - Live Monitoring Dashboard');
    console.log('='.repeat(60));
    
    const now = new Date();
    const uptime = Math.round((now.getTime() - this.stats.startTime.getTime()) / 1000);
    console.log(`Running for: ${uptime}s | Last update: ${now.toLocaleTimeString()}`);
    console.log('');

    console.log('Service Bus Queues:');
    try {
      const queueStats = await this.monitorServiceBusQueues();
      if ('error' in queueStats) {
        console.log(`   ERROR: ${queueStats.error}`);
      } else {
        Object.entries(queueStats).forEach(([queue, stats]) => {
          const status = stats.status === 'connected' ? 'CONNECTED' : 'ERROR';
          const messages = stats.hasMessages ? `(${stats.messageCount} pending)` : '(empty)';
          console.log(`   ${status} ${queue} ${messages}`);
        });
      }
    } catch (error: any) {
      console.log(`   ERROR: Queue monitoring failed: ${error.message}`);
    }
    console.log('');

    console.log('Processing Stats:');
    console.log(`   Total Messages: ${this.stats.totalMessages}`);
    console.log(`   Successful: ${this.stats.successfulMessages}`);
    console.log(`   Failed: ${this.stats.failedMessages}`);
    
    const successRate = this.stats.totalMessages > 0 ? 
      Math.round((this.stats.successfulMessages / this.stats.totalMessages) * 100) : 0;
    console.log(`   Success Rate: ${successRate}%`);
    console.log(`   Avg Processing: ${this.stats.avgProcessingTime}ms`);
    console.log('');

    console.log('Delivery Stats:');
    console.log(`   Webhooks: ${this.stats.webhookDeliveries}`);
    console.log(`   Emails: ${this.stats.emailsSent}`);
    console.log(`   SMS: ${this.stats.smsSent}`);
    console.log('');

    if (this.stats.errors.length > 0) {
      console.log('Recent Errors:');
      this.stats.errors.slice(-3).forEach((error, i) => {
        const time = error.timestamp.toLocaleTimeString();
        const msg = error.message.substring(0, 80);
        console.log(`   ${i + 1}. [${time}] ${msg}...`);
      });
      console.log('');
    }

    if (this.logBuffer.length > 0) {
      console.log('Recent Activity:');
      this.logBuffer.slice(-5).forEach(log => {
        const time = log.timestamp.toLocaleTimeString();
        const level = log.level === 'error' ? 'ERROR' : log.level === 'warning' ? 'WARN' : 'INFO';
        const msg = log.message.substring(0, 60);
        console.log(`   ${level} [${time}] ${msg}`);
      });
      console.log('');
    }

    if (this.config.webhookTestUrl) {
      console.log('Webhook Test:');
      try {
        const webhookResult = await this.testWebhookEndpoint();
        const status = webhookResult.success ? 'SUCCESS' : 'FAILED';
        console.log(`   ${status} ${this.config.webhookTestUrl}`);
        if (!webhookResult.success) {
          console.log(`   Error: ${webhookResult.error || `HTTP ${webhookResult.status}`}`);
        }
      } catch (error: any) {
        console.log(`   ERROR: Webhook test failed: ${error.message}`);
      }
      console.log('');
    }

    console.log('Commands:');
    console.log('   - Press Ctrl+C to stop');
    console.log('   - Check Azure Portal for detailed logs');
    console.log('   - View Function App > Monitor for execution details');
  }

  async startMonitoring(): Promise<void> {
    console.log('Starting Demographics API monitoring...');
    console.log('');
    
    this.isRunning = true;

    if (process.stdin.isTTY === false) {
      process.stdin.setEncoding('utf8');
      process.stdin.on('data', (data: Buffer | string) => {
        const text = data.toString();
        text.split('\n').forEach(line => this.parseLogLine(line.trim()));
      });
    }

    const interval = setInterval(async () => {
      if (this.isRunning) {
        await this.displayDashboard();
      }
    }, 3000);

    await this.displayDashboard();

    process.on('SIGINT', () => {
      this.isRunning = false;
      clearInterval(interval);
      console.log('\n\nFinal Statistics:');
      console.log(`   Total Messages: ${this.stats.totalMessages}`);
      console.log(`   Success Rate: ${this.stats.totalMessages > 0 ? Math.round((this.stats.successfulMessages / this.stats.totalMessages) * 100) : 0}%`);
      console.log(`   Uptime: ${Math.round((new Date().getTime() - this.stats.startTime.getTime()) / 1000)}s`);
      console.log('\nMonitoring stopped.');
      process.exit(0);
    });

    return new Promise<void>(() => {});
  }

  generateReport(): void {
    console.log('Demographics API Monitor Report');
    console.log('='.repeat(40));
    console.log(`Generated: ${new Date().toLocaleString()}`);
    console.log(`Monitoring period: ${Math.round((new Date().getTime() - this.stats.startTime.getTime()) / 1000)}s`);
    console.log('');
    console.log('Processing Summary:');
    console.log(`  Total messages: ${this.stats.totalMessages}`);
    console.log(`  Successful: ${this.stats.successfulMessages}`);
    console.log(`  Failed: ${this.stats.failedMessages}`);
    console.log(`  Success rate: ${this.stats.totalMessages > 0 ? Math.round((this.stats.successfulMessages / this.stats.totalMessages) * 100) : 0}%`);
    console.log('');
    console.log('Delivery Summary:');
    console.log(`  Webhooks delivered: ${this.stats.webhookDeliveries}`);
    console.log(`  Emails sent: ${this.stats.emailsSent}`);
    console.log(`  SMS sent: ${this.stats.smsSent}`);
    console.log('');
    if (this.stats.errors.length > 0) {
      console.log(`Errors (${this.stats.errors.length} total):`);
      this.stats.errors.slice(-10).forEach((error, i) => {
        console.log(`  ${i + 1}. ${error.message.substring(0, 100)}`);
      });
    }
  }
}

async function main(): Promise<void> {
  const command = process.argv[2];
  const monitor = new LogMonitor();

  switch (command) {
    case 'watch':
    case 'monitor':
      await monitor.startMonitoring();
      break;
      
    case 'report':
      monitor.generateReport();
      break;
      
    case 'test-webhook':
      const url = process.argv[3] || process.env.TEST_WEBHOOK_URL;
      if (!url) {
        console.log('ERROR: No webhook URL provided');
        console.log('Usage: node log-monitor.ts test-webhook <url>');
        process.exit(1);
      }
      console.log(`Testing webhook: ${url}`);
      const result = await monitor.testWebhookEndpoint(url);
      console.log(result.success ? 'Webhook test successful' : `Webhook test failed: ${result.error}`);
      break;
      
    case 'config':
      console.log('Current Configuration:');
      console.log(`   Service Bus: ${process.env.SERVICE_BUS_CONNECTION_STRING ? 'Configured' : 'Not set'}`);
      console.log(`   Function App: ${process.env.AZURE_FUNCTION_APP_NAME || 'Not set'}`);
      console.log(`   Webhook Test URL: ${process.env.TEST_WEBHOOK_URL || 'Not set'}`);
      break;
      
    default:
      console.log(`
Demographics API Monitor

Usage:
  node log-monitor.ts watch           # Real-time monitoring dashboard
  node log-monitor.ts test-webhook    # Test webhook endpoint
  node log-monitor.ts config          # Show configuration
  node log-monitor.ts report          # Generate summary report

Environment Variables:
  SERVICE_BUS_CONNECTION_STRING=your-service-bus-connection
  TEST_WEBHOOK_URL=https://webhook.site/your-unique-id

Examples:
  node log-monitor.ts watch
  node log-monitor.ts test-webhook https://webhook.site/abc123
      `);
      break;
  }
}

if (require.main === module) {
  main().catch(console.error);
}

export { LogMonitor };