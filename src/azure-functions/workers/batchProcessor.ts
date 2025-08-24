import { app, InvocationContext } from '@azure/functions';
import { logger } from '../monitor/winstonLogger';

async function processBatchMessages(message: unknown, context: InvocationContext): Promise<void> {
  const startTime = Date.now();
  
  // Cast message to array since we know it's an array when cardinality is 'many'
  const messages = message as unknown[];
  
  logger.info('Processing message batch', { 
    batchSize: messages.length,
    executionId: context.invocationId 
  });

  // Process messages in parallel with concurrency control
  const concurrencyLimit = 8;
  const batches = [];
  
  for (let i = 0; i < messages.length; i += concurrencyLimit) {
    const batch = messages.slice(i, i + concurrencyLimit);
    batches.push(batch);
  }

  for (const batch of batches) {
    const promises = batch.map(async (message, index) => {
      try {
        const messageBody = typeof message === 'string' ? JSON.parse(message as string) : message;
        await processBatchMessage(messageBody, context);
        return { success: true, index };
      } catch (error) {
        logger.error('Batch message failed', { batchIndex: index, error });
        return { success: false, index, error };
      }
    });

    const results = await Promise.allSettled(promises);
    const successful = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.length - successful;
    
    logger.info('Batch completed', { successful, failed });
  }

  const totalTime = Date.now() - startTime;
  logger.info('Batch processing completed', { 
    totalMessages: messages.length,
    processingTime: totalTime,
    messagesPerSecond: messages.length / (totalTime / 1000)
  });
}

// Unique function name for batch processor
async function processBatchMessage(messageBody: any, context: InvocationContext): Promise<void> {
  const { type, payload, id, retry_count } = messageBody;
  const messageId = String(context.triggerMetadata?.messageId || id || context.invocationId);
  const deliveryCount = Number(context.triggerMetadata?.deliveryCount || 1);
  
  logger.info('Processing batch message', { 
    messageId: messageId, 
    type,
    retryCount: retry_count,
    deliveryCount: deliveryCount
  });

  switch (type) {
    case 'webhook':
      await processBatchWebhookMessage(payload, messageId);
      break;
    case 'email':
      await processBatchEmailMessage(payload, messageId);
      break;
    case 'sms':
      await processBatchSmsMessage(payload, messageId);
      break;
    default:
      logger.warn('Unknown message type', { messageId: messageId, type });
  }
}

async function processBatchWebhookMessage(payload: any, messageId: string): Promise<void> {
  const webhookUrl = payload.webhook_url || process.env.DEFAULT_WEBHOOK_URL;
  
  if (!webhookUrl) {
    throw new Error('Webhook URL not provided');
  }

  logger.info('Delivering batch webhook', { 
    messageId, 
    webhookUrl,
    eventType: payload.event 
  });

  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Webhook-Signature': await generateBatchWebhookSignature(payload)
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(10000)
  });

  if (!response.ok) {
    throw new Error(`Webhook delivery failed: ${response.status} ${response.statusText}`);
  }

  logger.info('Batch webhook delivered successfully', { messageId, status: response.status });
}

async function processBatchEmailMessage(payload: any, messageId: string): Promise<void> {
  logger.info('Sending batch email', { 
    messageId, 
    to: payload.to,
    subject: payload.subject 
  });

  // Implement email sending
}

async function processBatchSmsMessage(payload: any, messageId: string): Promise<void> {
  logger.info('Sending batch SMS', { 
    messageId, 
    to: payload.phone,
    message: payload.text 
  });

  // Implement SMS sending
}

async function generateBatchWebhookSignature(payload: any): Promise<string> {
  const crypto = require('crypto');
  const secret = process.env.WEBHOOK_SECRET || 'default-secret';
  
  const payloadString = JSON.stringify(payload || {});
  return crypto
    .createHmac('sha256', secret)
    .update(payloadString)
    .digest('hex');
}

// Fixed: Proper batch trigger with cardinality
app.serviceBusQueue('processBatchMessages', {
  connection: 'SERVICE_BUS_CONNECTION_STRING',
  queueName: 'demographics-batch-processing',
  cardinality: 'many',
  handler: processBatchMessages
});