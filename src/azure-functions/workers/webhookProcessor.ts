import { app, InvocationContext } from '@azure/functions';
import { logger } from '../monitor/winstonLogger';

// Dedicated webhook processor handler
async function processWebhookQueueMessage(message: unknown, context: InvocationContext): Promise<void> {
  const startTime = Date.now();
  
  try {
    // Access metadata from context.triggerMetadata instead of bindingData
    const messageId = String(context.triggerMetadata?.messageId || context.invocationId);
    const deliveryCount = Number(context.triggerMetadata?.deliveryCount || 1);
    
    logger.info('Webhook message triggered', { 
      messageId: messageId,
      deliveryCount: deliveryCount,
      executionId: context.invocationId
    });

    const messageBody = typeof message === 'string' ? JSON.parse(message) : message;
    
    await processWebhookDelivery(messageBody, messageId);
    
    const processingTime = Date.now() - startTime;
    logger.info('Webhook processed successfully', { 
      messageId: messageId,
      processingTime 
    });

  } catch (error) {
    const messageId = String(context.triggerMetadata?.messageId || context.invocationId);
    const deliveryCount = Number(context.triggerMetadata?.deliveryCount || 1);
    
    logger.error('Webhook processing failed', { 
      messageId: messageId,
      error: error instanceof Error ? error.message : String(error),
      deliveryCount: deliveryCount
    });
    
    // Let Service Bus handle retries automatically
    throw error;
  }
}

async function processWebhookDelivery(payload: any, messageId: string = 'unknown'): Promise<void> {
  const webhookUrl = payload.webhook_url || process.env.DEFAULT_WEBHOOK_URL;
  
  if (!webhookUrl) {
    throw new Error('No webhook URL configured');
  }

  const webhookPayload = {
    event: payload.event,
    data: payload.data,
    timestamp: new Date().toISOString(),
    signature: await generateDedicatedWebhookSignature(payload),
  };

  logger.info('Delivering webhook', { 
    messageId,
    url: webhookUrl, 
    event: payload.event
  });

  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Webhook-Signature': webhookPayload.signature,
      'User-Agent': 'Demographics-API/1.0'
    },
    body: JSON.stringify(webhookPayload),
    signal: AbortSignal.timeout(15000) // 15 second timeout
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'Unable to read response');
    throw new Error(`Webhook failed: ${response.status} - ${errorText}`);
  }
}

async function generateDedicatedWebhookSignature(payload: any): Promise<string> {
  const crypto = require('crypto');
  const secret = process.env.WEBHOOK_SECRET || 'default-secret';
  
  const payloadString = JSON.stringify(payload || {});
  return crypto
    .createHmac('sha256', secret)
    .update(payloadString)
    .digest('hex');
}

// Webhook-specific Service Bus trigger
app.serviceBusQueue('processWebhookQueueMessage', {
  connection: 'SERVICE_BUS_CONNECTION_STRING',
  queueName: 'webhook-notifications',
  handler: processWebhookQueueMessage
});