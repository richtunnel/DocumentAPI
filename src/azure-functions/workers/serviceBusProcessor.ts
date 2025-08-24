import { app, InvocationContext } from '@azure/functions';
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

// Event-driven Service Bus trigger - fires ONLY when messages arrive
async function processDemographicsMessage(message: unknown, context: InvocationContext): Promise<void> {
  const startTime = Date.now();
  const executionId = context.invocationId;
  
  try {
    // Get message metadata from triggerMetadata instead of bindingData
    const messageId = context.triggerMetadata?.messageId || executionId;
    const deliveryCount = context.triggerMetadata?.deliveryCount || 1;
    
    logger.info('Processing message triggered by Service Bus', { 
      executionId,
      messageId: messageId,
      deliveryCount: deliveryCount 
    });

    const messageBody = typeof message === 'string' ? JSON.parse(message) : message;
    
    // Process the message based on type
    await processMessage(messageBody, context);
    
    const processingTime = Date.now() - startTime;
    logger.info('Message processed successfully', { 
      executionId,
      messageId: messageId,
      processingTime 
    });

  } catch (error) {
    const processingTime = Date.now() - startTime;
    const messageId = context.triggerMetadata?.messageId || executionId;
    
    logger.error('Error processing message', { 
      executionId,
      messageId: messageId,
      error: error instanceof Error ? error.message : String(error),
      processingTime 
    });
    
    // Don't throw - let Service Bus handle retries
    // The message will go to dead letter after max delivery count
  }
}

async function processMessage(messageBody: any, context: InvocationContext): Promise<void> {
  const { type, payload, id, retry_count } = messageBody;
  const messageId = context.triggerMetadata?.messageId || id || context.invocationId;
  const deliveryCount = context.triggerMetadata?.deliveryCount || 1;
  
  logger.info('Processing message', { 
    messageId: messageId, 
    type,
    retryCount: retry_count,
    deliveryCount: deliveryCount
  });

  switch (type) {
    case 'webhook':
      await processWebhookMessage(payload, messageId);
      break;
    case 'email':
      await processEmailMessage(payload, messageId);
      break;
    case 'sms':
      await processSmsMessage(payload, messageId);
      break;
    default:
      logger.warn('Unknown message type', { messageId: messageId, type });
  }
}

async function processWebhookMessage(payload: any, messageId: string): Promise<void> {
  const webhookUrl = payload.webhook_url || process.env.DEFAULT_WEBHOOK_URL;
  
  if (!webhookUrl) {
    throw new Error('Webhook URL not provided');
  }

  logger.info('Delivering webhook', { 
    messageId, 
    webhookUrl,
    eventType: payload.event 
  });

  // Implement actual webhook delivery
  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Webhook-Signature': await generateWebhookSignature(payload)
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(10000) // 10 second timeout
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'Unable to read response');
    throw new Error(`Webhook delivery failed: ${response.status} - ${errorText}`);
  }

  logger.info('Webhook delivered successfully', { messageId, status: response.status });
}

async function processEmailMessage(payload: any, messageId: string): Promise<void> {
  logger.info('Sending email', { 
    messageId, 
    to: payload.to,
    subject: payload.subject 
  });

  // Implement email sending (SendGrid, Azure Communication Services, etc.)
  // throw new Error('Email delivery failed') to trigger retry
}

async function processSmsMessage(payload: any, messageId: string): Promise<void> {
  logger.info('Sending SMS', { 
    messageId, 
    to: payload.phone,
    message: payload.text 
  });

  // Implement SMS sending (Twilio, Azure Communication Services, etc.)
  // throw new Error('SMS delivery failed') to trigger retry
}

async function generateWebhookSignature(payload: any): Promise<string> {
  const crypto = require('crypto');
  const secret = process.env.WEBHOOK_SECRET || 'default-secret';
  
  const payloadString = JSON.stringify(payload);
  return crypto
    .createHmac('sha256', secret)
    .update(payloadString)
    .digest('hex');
}

// Service Bus trigger - only runs when messages arrive!
app.serviceBusQueue('processDemographicsMessage', {
  connection: 'SERVICE_BUS_CONNECTION_STRING',
  queueName: 'demographics-processing',
  handler: processDemographicsMessage
});