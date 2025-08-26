import { app, InvocationContext } from '@azure/functions';
import { logger } from '../monitor/winstonLogger';
import { promisify } from 'util';
import * as zlib from 'zlib';
import * as os from 'os';

interface MessagePayload {
    type: 'webhook' | 'email' | 'sms';
    id: string;
    retry_count: number;
    payload: {
        documentUrl?: string;
        webhook_url?: string;
        event: string;
        to?: string;
        subject?: string;
        phone?: string;
        text?: string;
    }
}

const gzip = promisify(zlib.gzip);
const gunzip = promisify(zlib.gunzip);
const availableMemory = os.freemem() / 1024 / 1024; // MB
const estimatedDocumentSize = 10;

async function processBatchMessages(message: unknown, context: InvocationContext): Promise<void> {
  const startTime = Date.now();

  
  // Cast message to array since we know it's an array when cardinality is 'many'
  const messages = message as MessagePayload[];
  
  logger.info('Processing message batch', { 
    batchSize: messages.length,
    executionId: context.invocationId 
  });


// Process messages in parallel with concurrency control

 /* Add a dynamic concurrencyLimit here */
 const concurrencyLimit = Math.min(8, Math.floor(availableMemory / estimatedDocumentSize));
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
async function processBatchMessage(messageBody: MessagePayload, context: InvocationContext): Promise<void> {
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

 // #edit, add later to fetch and compress docs

//   let documentContent: Buffer | null = null;
//   if (payload.documentUrl) {
//     try {
//       // Fetch document from Azure Blob Storage
//       const blobServiceClient = BlobServiceClient.fromConnectionString(
//         process.env.AZURE_STORAGE_CONNECTION_STRING || ''
//       );
//       const containerClient = blobServiceClient.getContainerClient('documents');
//       const blobName = payload.documentUrl.split('/').pop();
//       if (!blobName) {
//         throw new Error('Invalid document URL');
//       }
//       const blobClient = containerClient.getBlobClient(blobName);
//       const download = await blobClient.download();
//       documentContent = await streamToBuffer(download.readableStreamBody!);

//       // Decompress document
//       documentContent = await gunzip(documentContent);
//       logger.info('Document decompressed', { messageId, size: documentContent.length });
//     } catch (error) {
//       logger.error('Failed to fetch or decompress document', { messageId, error });
//       throw error;
//     }
//   }

  logger.info('Delivering batch webhook', {
    messageId,
    webhookUrl,
    eventType: payload.event,
  });

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

// Helper to convert stream to buffer #edit, add later
async function streamToBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

// Compress document for sending to Service Bus, #edit, add later
async function compressDocument(content: Buffer): Promise<Buffer> {
  return await gzip(content) || content ;
}

// Proper batch trigger with cardinality
app.serviceBusQueue('processBatchMessages', {
  connection: 'SERVICE_BUS_CONNECTION_STRING',
  queueName: 'demographics-batch-processing',
  cardinality: 'many',
  handler: processBatchMessages
});