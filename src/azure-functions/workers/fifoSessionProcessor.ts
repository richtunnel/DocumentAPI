import { app, InvocationContext } from '@azure/functions';
import { logger } from '../../shared/services/logger.service';
import { databaseService } from '../../shared/database/database.service';
import { fifoQueueService } from '../../shared/services/fifoQueue.service';

/**
 * FIFO Demographics Processor - Processes messages in order per law firm
 * Uses Service Bus sessions for FIFO guarantees
 */
async function processDemographicsFifoMessage(message: unknown, context: InvocationContext): Promise<void> {
  const startTime = Date.now();
  const executionId = context.invocationId;

  try {
    // Extract session information for FIFO processing
    const sessionId = context.triggerMetadata?.sessionId as string;
    const messageId = context.triggerMetadata?.messageId as string;
    const deliveryCount = context.triggerMetadata?.deliveryCount as number;

    logger.info('Processing FIFO demographics message', {
      executionId,
      sessionId,
      messageId,
      deliveryCount
    });

    const messageBody = typeof message === 'string' ? JSON.parse(message) : message;
    const { id, type, payload, correlation_id, priority } = messageBody;

    // Extract law firm from session ID for processing context
    const lawFirm = sessionId.replace('demographics_', '').replace(/_/g, ' ');

    switch (type) {
      case 'demographics':
        await processDemographicsData(payload, lawFirm, correlation_id);
        break;
      
      default:
        logger.warn('Unknown FIFO message type', { type, messageId });
    }

    // Send success notification
    await fifoQueueService.addWebhookMessage(lawFirm, {
      event: 'demographics.processed',
      data: {
        id: payload.id,
        law_firm: lawFirm,
        correlation_id,
        processed_at: new Date().toISOString(),
        processing_time_ms: Date.now() - startTime
      },
      correlation_id
    });

    const processingTime = Date.now() - startTime;
    logger.info('FIFO demographics message processed successfully', {
      executionId,
      sessionId,
      messageId,
      lawFirm,
      processingTime
    });

  } catch (error) {
    const processingTime = Date.now() - startTime;
    const sessionId = context.triggerMetadata?.sessionId as string;
    const messageId = context.triggerMetadata?.messageId as string;
    
    logger.error('Error processing FIFO demographics message', {
      executionId,
      sessionId,
      messageId,
      error: error instanceof Error ? error.message : String(error),
      processingTime
    });

    // Let Service Bus handle retries via session dead lettering
    throw error;
  }
}

/**
 * FIFO Webhook Processor - Ensures webhooks are delivered in order per law firm
 */
async function processWebhookFifoMessage(message: unknown, context: InvocationContext): Promise<void> {
  const startTime = Date.now();
  const executionId = context.invocationId;

  try {
    const sessionId = context.triggerMetadata?.sessionId as string;
    const messageId = context.triggerMetadata?.messageId as string;
    const deliveryCount = context.triggerMetadata?.deliveryCount as number;

    logger.info('Processing FIFO webhook message', {
      executionId,
      sessionId,
      messageId,
      deliveryCount
    });

    const messageBody = typeof message === 'string' ? JSON.parse(message) : message;
    const { payload, correlation_id } = messageBody;

    // Extract law firm from session for webhook URL lookup
    const lawFirm = sessionId.replace('webhook_', '').replace(/_/g, ' ');

    await deliverWebhookInOrder(payload, lawFirm, correlation_id);

    const processingTime = Date.now() - startTime;
    logger.info('FIFO webhook delivered successfully', {
      executionId,
      sessionId,
      messageId,
      lawFirm,
      event: payload.event,
      processingTime
    });

  } catch (error) {
    const processingTime = Date.now() - startTime;
    const sessionId = context.triggerMetadata?.sessionId as string;
    const messageId = context.triggerMetadata?.messageId as string;
    
    logger.error('Error processing FIFO webhook message', {
      executionId,
      sessionId,
      messageId,
      error: error instanceof Error ? error.message : String(error),
      processingTime
    });

    throw error;
  }
}

/**
 * High-throughput document processor (non-FIFO, partitioned queue)
 */
async function processDocumentMessage(message: unknown, context: InvocationContext): Promise<void> {
  const startTime = Date.now();
  const executionId = context.invocationId;
   const messageId = context.triggerMetadata?.messageId as string;
  const deliveryCount = context.triggerMetadata?.deliveryCount as number;

  try {
    logger.info('Processing document message', {
      executionId,
      messageId,
      deliveryCount
    });

    const messageBody = typeof message === 'string' ? JSON.parse(message) : message;
    const { payload, correlation_id } = messageBody;

    await processDocumentUpload(payload, correlation_id);

    const processingTime = Date.now() - startTime;
    logger.info('Document processed successfully', {
      executionId,
      messageId,
      blobName: payload.blobName,
      processingTime
    });

  } catch (error) {
    const processingTime = Date.now() - startTime;
    const messageId = context.triggerMetadata?.messageId as string;
    
    logger.error('Error processing document message', {
      executionId,
      messageId,
      error: error instanceof Error ? error.message : String(error),
      processingTime
    });

    throw error;
  }
}

// Helper functions
async function processDemographicsData(payload: any, lawFirm: string, correlationId: string): Promise<void> {
  // Create demographics record
  const now = new Date().toISOString();
  const demographicsRecord = {
    id: payload.id || require('uuid').v4(),
    partitionKey: lawFirm,
    ...payload,
    created_at: now,
    updated_at: now,
    created_by: payload.created_by || require('uuid').v4()
  };

  await databaseService.createDemographic(demographicsRecord);
  
  logger.info('Demographics record created', {
    id: demographicsRecord.id,
    lawFirm,
    correlationId
  });
}

async function deliverWebhookInOrder(payload: any, lawFirm: string, correlationId: string): Promise<void> {
  // Look up webhook URL for law firm (implement this based on your configuration)
  const webhookUrl = await getWebhookUrlForLawFirm(lawFirm);
  
  if (!webhookUrl) {
    logger.warn('No webhook URL configured for law firm', { lawFirm, correlationId });
    return;
  }

  const webhookPayload = {
    event: payload.event,
    data: payload.data,
    timestamp: new Date().toISOString(),
    correlation_id: correlationId,
    law_firm: lawFirm,
    signature: await generateWebhookSignature(payload)
  };

  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Webhook-Signature': webhookPayload.signature,
      'X-Correlation-ID': correlationId,
      'User-Agent': 'Demographics-API/1.0'
    },
    body: JSON.stringify(webhookPayload),
    signal: AbortSignal.timeout(30000) // 30 second timeout
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'Unable to read response');
    throw new Error(`Webhook delivery failed: ${response.status} - ${errorText}`);
  }

  logger.info('Webhook delivered successfully', {
    lawFirm,
    event: payload.event,
    webhookUrl,
    status: response.status,
    correlationId
  });
}

async function processDocumentUpload(payload: any, correlationId: string): Promise<void> {
  const { blobName, lawFirm, fileSize, contentType } = payload;

  // Process document - extract text, validate, store metadata
  logger.info('Processing uploaded document', {
    blobName,
    lawFirm,
    fileSize,
    contentType,
    correlationId
  });

  // Add document processing logic here:
  // - OCR for scanned documents
  // - Text extraction
  // - Document classification
  // - Virus scanning
  // - Metadata extraction

  // For now, just log completion
  logger.info('Document processing completed', {
    blobName,
    correlationId
  });
}

async function getWebhookUrlForLawFirm(lawFirm: string): Promise<string | null> {
  // Implement webhook URL lookup based on law firm
  // This could be from database, configuration, or environment variables
  return process.env[`WEBHOOK_URL_${lawFirm.toUpperCase().replace(/\s+/g, '_')}`] || 
         process.env.DEFAULT_WEBHOOK_URL || 
         null;
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

// Register FIFO Service Bus triggers with session support
app.serviceBusQueue('processDemographicsFifoMessage', {
  connection: 'SERVICE_BUS_CONNECTION_STRING',
  queueName: 'demographics-processing-fifo',
  isSessionsEnabled: true, // Critical for FIFO
  handler: processDemographicsFifoMessage
});

app.serviceBusQueue('processWebhookFifoMessage', {
  connection: 'SERVICE_BUS_CONNECTION_STRING', 
  queueName: 'webhook-notifications-fifo',
  isSessionsEnabled: true, // Critical for FIFO
  handler: processWebhookFifoMessage
});

app.serviceBusQueue('processDocumentMessage', {
  connection: 'SERVICE_BUS_CONNECTION_STRING',
  queueName: 'document-processing',
  handler: processDocumentMessage
});

export { 
  processDemographicsFifoMessage, 
  processWebhookFifoMessage, 
  processDocumentMessage 
};