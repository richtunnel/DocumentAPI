import { app, Timer, InvocationContext } from '@azure/functions';
import { queueService } from '../services/queue.service';
import winston from 'winston';

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console()
  ]
});

async function webhookWorker(myTimer: Timer, context: InvocationContext): Promise<void> {
  const startTime = Date.now();
  const executionId = context.invocationId;
  
  try {
    logger.info('Webhook worker started', { executionId });

    // Get webhook-specific messages
    const messages = await queueService.getMessagesFromQueue('webhook', 10);
    
    if (messages.length === 0) {
      logger.info('No webhook messages to process', { executionId });
      return;
    }

    logger.info('Processing webhook messages', { 
      executionId, 
      messageCount: messages.length 
    });

    // Process webhook messages
    for (const message of messages) {
      try {
        await processWebhookDelivery(message.payload);
        logger.info('Webhook delivered successfully', { 
          messageId: message.id,
          event: message.payload.event 
        });
      } catch (error) {
        logger.error('Webhook delivery failed', { 
          messageId: message.id,
          error,
          retryCount: message.retry_count 
        });
        
        // Requeue for retry if under max retries
        if (message.retry_count < message.max_retries) {
          message.retry_count++;
          await queueService.addToProcessQueue(message);
        }
      }
    }

    const processingTime = Date.now() - startTime;
    logger.info('Webhook worker completed', { 
      executionId, 
      processed: messages.length,
      processingTime 
    });

  } catch (error) {
    const processingTime = Date.now() - startTime;
    logger.error('Webhook worker error', { executionId, error, processingTime });
  }
}

async function processWebhookDelivery(payload: any): Promise<void> {
  // Implement actual webhook delivery logic
  const webhookUrl = payload.webhook_url || process.env.DEFAULT_WEBHOOK_URL;
  
  if (!webhookUrl) {
    throw new Error('No webhook URL configured');
  }

  // Create webhook payload
  const webhookPayload = {
    event: payload.event,
    data: payload.data,
    timestamp: new Date().toISOString(),
    signature: await generateWebhookSignature(payload),
  };

  // Send webhook (implement actual HTTP request)
  logger.info('Sending webhook', { 
    url: webhookUrl, 
    event: payload.event,
    dataKeys: Object.keys(payload.data || {})
  });

  // Simulate webhook delivery - replace with actual fetch/axios call
  await new Promise(resolve => setTimeout(resolve, 500));
}

async function generateWebhookSignature(payload: any): Promise<string> {
  // Implement HMAC signature generation for webhook security
  const crypto = require('crypto');
  const secret = process.env.WEBHOOK_SECRET || 'default-secret';
  
  const payloadString = JSON.stringify(payload);
  return crypto
    .createHmac('sha256', secret)
    .update(payloadString)
    .digest('hex');
}

app.timer('webhookWorker', {
  schedule: '0 */1 * * * *', // Every minute
  handler: webhookWorker
});

