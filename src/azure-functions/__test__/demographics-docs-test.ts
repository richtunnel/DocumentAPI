import { ServiceBusClient } from "@azure/service-bus";
import crypto from "crypto";

// Configuration
const connectionString = process.env.SERVICE_BUS_CONNECTION_STRING || 'your-connection-string-here';
const queueName = 'demographics-processing';
const batchQueueName = 'demographics-batch-processing';
const webhookQueueName = 'webhook-notifications';

// Test data generators
const generateDemographicsData = (index: number) => ({
  id: `demo-${index}-${crypto.randomUUID()}`,
  userId: `user-${1000 + index}`,
  age: Math.floor(Math.random() * 80) + 18,
  gender: ['male', 'female', 'other'][Math.floor(Math.random() * 3)],
  location: ['New York', 'Los Angeles', 'Chicago', 'Houston', 'Phoenix'][Math.floor(Math.random() * 5)],
  income: Math.floor(Math.random() * 150000) + 30000,
  timestamp: new Date().toISOString()
});

const generateTestMessage = (index: number, type = 'webhook') => {
  const baseMessage = {
    id: `msg-${index}-${Date.now()}`,
    type: type,
    retry_count: 0,
    created_at: new Date().toISOString()
  };

  switch (type) {
    case 'webhook':
      return {
        ...baseMessage,
        payload: {
          webhook_url: process.env.TEST_WEBHOOK_URL || 'https://webhook.site/unique-id',
          event: 'demographics_processed',
          data: generateDemographicsData(index)
        }
      };
    
    case 'email':
      return {
        ...baseMessage,
        payload: {
          to: `test-user-${index}@example.com`,
          subject: `Demographics Report #${index}`,
          template: 'demographics_summary',
          data: generateDemographicsData(index)
        }
      };
    
    case 'sms':
      return {
        ...baseMessage,
        payload: {
          phone: `+1555000${String(index).padStart(4, '0')}`,
          text: `Demographics update ${index} processed successfully`,
          data: generateDemographicsData(index)
        }
      };
      
    default:
      return baseMessage;
  }
};

// Test scenarios
const testScenarios = {
  singleMessages: async (client: any, count = 100) => {
    console.log(`Testing ${count} single messages...`);
    const sender = client.createSender(queueName);
    
    const messages = [];
    for (let i = 1; i <= count; i++) {
      const messageType = ['webhook', 'email', 'sms'][Math.floor(Math.random() * 3)];
      const message = generateTestMessage(i, messageType);
      messages.push({
        body: JSON.stringify(message),
        messageId: message.id,
        label: messageType,
        timeToLive: 300000 // 5 minutes
      });
    }

    // Send in batches of 10 to avoid overwhelming
    const batchSize = 10;
    for (let i = 0; i < messages.length; i += batchSize) {
      const batch = messages.slice(i, i + batchSize);
      await sender.sendMessages(batch);
      console.log(`Sent batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(messages.length/batchSize)} (${batch.length} messages)`);
      
      // Small delay between batches
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    await sender.close();
    console.log(`Sent ${messages.length} single messages to ${queueName}`);
  },

  batchMessages: async (client: any, count = 100) => {
    console.log(`Testing ${count} batch messages...`);
    const sender = client.createSender(batchQueueName);
    
    const messages = [];
    for (let i = 1; i <= count; i++) {
      const messageType = ['webhook', 'email', 'sms'][Math.floor(Math.random() * 3)];
      const message = generateTestMessage(i, messageType);
      messages.push({
        body: JSON.stringify(message),
        messageId: message.id,
        label: `batch-${messageType}`,
        timeToLive: 300000
      });
    }

    // Send all at once for batch processing
    await sender.sendMessages(messages);
    await sender.close();
    console.log(`Sent ${messages.length} batch messages to ${batchQueueName}`);
  },

  webhookOnly: async (client: any, count = 50) => {
    console.log(`Testing ${count} webhook-only messages...`);
    const sender = client.createSender(webhookQueueName);
    
    const messages = [];
    for (let i = 1; i <= count; i++) {
      const message = generateTestMessage(i, 'webhook');
      messages.push({
        body: JSON.stringify(message),
        messageId: message.id,
        label: 'webhook-dedicated',
        timeToLive: 300000
      });
    }

    const batchSize = 5;
    for (let i = 0; i < messages.length; i += batchSize) {
      const batch = messages.slice(i, i + batchSize);
      await sender.sendMessages(batch);
      console.log(`Sent webhook batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(messages.length/batchSize)}`);
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    
    await sender.close();
    console.log(`✅ Sent ${messages.length} webhook messages to ${webhookQueueName}`);
  },

  errorMessages: async (client: any, count = 10) => {
    console.log(`Testing ${count} error-inducing messages...`);
    const sender = client.createSender(queueName);
    
    const errorMessages = [
      // Invalid webhook URL
      {
        id: `error-1-${Date.now()}`,
        type: 'webhook',
        payload: {
          webhook_url: 'invalid-url-should-fail',
          event: 'test_error',
          data: { test: true }
        }
      },
      // Missing required fields
      {
        id: `error-2-${Date.now()}`,
        type: 'webhook',
        payload: {
          event: 'missing_webhook_url',
          data: { test: true }
        }
      },
      // Unknown message type
      {
        id: `error-3-${Date.now()}`,
        type: 'unknown_type',
        payload: { test: true }
      }
    ];

    const messages = errorMessages.map(msg => ({
      body: JSON.stringify(msg),
      messageId: msg.id,
      label: 'error-test'
    }));

    await sender.sendMessages(messages);
    await sender.close();
    console.log(`Sent ${messages.length} error-inducing messages`);
  }
};

// Monitor queue metrics
const monitorQueues = async (client: any) => {
  console.log('\nQueue Monitoring:');
  
  const queues = [queueName, batchQueueName, webhookQueueName];
  
  for (const queue of queues) {
    try {
      const receiver = client.createReceiver(queue, { receiveMode: 'peekLock' });
      const peekedMessages = await receiver.peekMessages(1);
      await receiver.close();
      
      console.log(`${queue}:`);
      console.log(`   - Active messages: ${peekedMessages.length > 0 ? 'Yes' : 'No'}`);
      console.log(`   - Connection: Connected`);
    } catch (error: any) {
      console.log(`${queue}: Error - ${error.message}`);
    }
  }
};

// Main test runner
async function runTests() {
  console.log('🔧 Demographics API Load Test Starting...\n');
  
  if (!connectionString || connectionString === 'your-connection-string-here') {
    console.error('Please set SERVICE_BUS_CONNECTION_STRING environment variable');
    process.exit(1);
  }

  const client = new ServiceBusClient(connectionString);

  try {
    // Monitor initial state
    await monitorQueues(client);

    // Run different test scenarios
    const testType = process.argv[2] || 'single';
    const testCount = parseInt(process.argv[3]) || 100;

    console.log(`\n Running test: ${testType} with ${testCount} messages\n`);

    switch (testType) {
      case 'single':
        await testScenarios.singleMessages(client, testCount);
        break;
      case 'batch':
        await testScenarios.batchMessages(client, testCount);
        break;
      case 'webhook':
        await testScenarios.webhookOnly(client, testCount);
        break;
      case 'error':
        await testScenarios.errorMessages(client, 10);
        break;
      case 'all':
        await testScenarios.singleMessages(client, Math.floor(testCount / 3));
        await testScenarios.batchMessages(client, Math.floor(testCount / 3));
        await testScenarios.webhookOnly(client, Math.floor(testCount / 3));
        await testScenarios.errorMessages(client, 5);
        break;
      default:
        console.error('Unknown test type. Use: single, batch, webhook, error, or all');
        process.exit(1);
    }

    console.log('\n⏱ Waiting 5 seconds for processing to start...');
    await new Promise(resolve => setTimeout(resolve, 5000));

    // Monitor final state
    console.log('\nFinal Queue State:');
    await monitorQueues(client);

    console.log('\nTest completed! Check your monitoring dashboard for results.');
    console.log('\nMonitor your functions at:');
    console.log('   - Azure Portal > Function App > Monitor');
    console.log('   - Application Insights > Live Metrics');
    console.log('   - Log Analytics > Custom Logs');

  } catch (error: any) {
    console.error('Test failed:', error.message);
    console.error(error.stack);
  } finally {
    await client.close();
  }
}

// Usage examples
console.log(`
Usage Examples:
  node demographics-test.js single 100    # 100 single messages
  node demographics-test.js batch 50      # 50 batch messages  
  node demographics-test.js webhook 25    # 25 webhook messages
  node demographics-test.js error         # Error test messages
  node demographics-test.js all 150       # Mixed test (150 total)

Environment Variables:
  SERVICE_BUS_CONNECTION_STRING=your-connection-string
  TEST_WEBHOOK_URL=https://webhook.site/your-unique-id (optional)
`);

if (require.main === module) {
  runTests();
}

module.exports = { testScenarios, generateTestMessage, generateDemographicsData };