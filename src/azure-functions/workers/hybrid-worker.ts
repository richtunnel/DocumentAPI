import { app, Timer, InvocationContext } from '@azure/functions';
import { queueService } from '../../shared/services/queue.service';
import { QueueMessage } from '../../shared/types/demographics';
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

async function efficientWorker(myTimer: Timer, context: InvocationContext): Promise<void> {
  const startTime = Date.now();
  const executionId = context.invocationId;
  
  try {
    logger.info('Efficient worker started', { executionId });

    // Get current queue depth to determine batch size
    const queueDepth = await queueService.getQueueLength('process');
    
    if (queueDepth === 0) {
      logger.info('No messages in queue, worker completed', { executionId, processingTime: Date.now() - startTime });
      return;
    }

    // Adaptive batch sizing based on queue depth
    let batchSize: number;
    if (queueDepth < 10) {
      batchSize = Math.min(queueDepth, 5);
    } else if (queueDepth < 50) {
      batchSize = 15;
    } else if (queueDepth < 200) {
      batchSize = 32;
    } else {
      batchSize = 50; // Maximum batch size
    }

    const maxExecutionTime = 8 * 60 * 1000; // 8 minutes max execution
    let totalProcessed = 0;
    let batchCount = 0;
    let consecutiveEmptyBatches = 0;

    // Process batches until queue is empty or timeout
    while (Date.now() - startTime < maxExecutionTime) {
      const batchStartTime = Date.now();
      batchCount++;

      // Get messages from queue
      const messages = await queueService.getMessagesFromQueue('process', batchSize);
      
      if (messages.length === 0) {
        consecutiveEmptyBatches++;
        if (consecutiveEmptyBatches >= 3) {
          logger.info('Queue appears empty, stopping worker', { 
            executionId, 
            batchCount, 
            totalProcessed 
          });
          break;
        }
        await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second
        continue;
      }

      consecutiveEmptyBatches = 0;
      logger.info('Processing batch', { 
        executionId, 
        batchCount, 
        batchSize: messages.length,
        queueDepth 
      });

      // Process messages in parallel with timeout per message
      const processPromises = messages.map(message => 
        processMessageWithTimeout(message, 30000) // 30 second timeout per message
      );

      const results = await Promise.allSettled(processPromises);
      
      // Count successful processing
      const successful = results.filter(result => result.status === 'fulfilled').length;
      totalProcessed += successful;

      const batchTime = Date.now() - batchStartTime;
      logger.info('Batch completed', {
        executionId,
        batchCount,
        processed: successful,
        failed: messages.length - successful,
        batchTime,
        totalProcessed
      });

      // Adaptive delay between batches based on processing time
      if (batchTime < 1000) {
        await new Promise(resolve => setTimeout(resolve, 100)); // Fast processing, short delay
      } else if (batchTime < 5000) {
        await new Promise(resolve => setTimeout(resolve, 500)); // Moderate delay
      } else {
        await new Promise(resolve => setTimeout(resolve, 1000)); // Longer delay
      }
    }

    const totalTime = Date.now() - startTime;
    logger.info('Efficient worker completed', {
      executionId,
      totalProcessed,
      batchCount,
      totalTime,
      averagePerBatch: totalProcessed / batchCount,
      messagesPerSecond: totalProcessed / (totalTime / 1000)
    });

  } catch (error) {
    const totalTime = Date.now() - startTime;
    logger.error('Efficient worker error', { executionId, error, totalTime });
  }
}

async function processMessageWithTimeout(message: QueueMessage, timeoutMs: number): Promise<void> {
  return new Promise(async (resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`Message processing timeout: ${message.id}`));
    }, timeoutMs);

    try {
      await processMessage(message);
      clearTimeout(timeout);
      resolve();
    } catch (error) {
      clearTimeout(timeout);
      reject(error);
    }
  });
}

async function processMessage(message: QueueMessage): Promise<void> {
  try {
    logger.info('Processing message', { 
      messageId: message.id, 
      type: message.type,
      retryCount: message.retry_count 
    });

    switch (message.type) {
      case 'webhook':
        await processWebhookMessage(message);
        break;
      case 'email':
        await processEmailMessage(message);
        break;
      case 'sms':
        await processSmsMessage(message);
        break;
      default:
        logger.warn('Unknown message type', { messageId: message.id, type: message.type });
    }

    logger.info('Message processed successfully', { messageId: message.id });
  } catch (error) {
    logger.error('Error processing message', { 
      messageId: message.id, 
      error,
      retryCount: message.retry_count 
    });

    // Handle retry logic
    if (message.retry_count < message.max_retries) {
      message.retry_count++;
      await queueService.addToProcessQueue(message);
      logger.info('Message requeued for retry', { 
        messageId: message.id, 
        retryCount: message.retry_count 
      });
    } else {
      logger.error('Message exceeded max retries, sending to dead letter', { 
        messageId: message.id, 
        maxRetries: message.max_retries 
      });
      // In production, send to dead letter queue or error handling service
    }
  }
}

async function processWebhookMessage(message: QueueMessage): Promise<void> {
  // Implement webhook delivery logic
  const webhookUrl = message.payload.webhook_url;
  const payload = message.payload.data;

  if (!webhookUrl) {
    throw new Error('Webhook URL not provided');
  }

  // Simulate webhook delivery (replace with actual HTTP request)
  logger.info('Delivering webhook', { 
    messageId: message.id, 
    webhookUrl,
    eventType: payload.event 
  });

  // Add actual webhook delivery implementation here
  await new Promise(resolve => setTimeout(resolve, 100)); // Simulate processing time
}

async function processEmailMessage(message: QueueMessage): Promise<void> {
  // Implement email sending logic
  logger.info('Sending email', { 
    messageId: message.id, 
    to: message.payload.to,
    subject: message.payload.subject 
  });

  // Add actual email sending implementation here
  await new Promise(resolve => setTimeout(resolve, 200)); // Simulate processing time
}

async function processSmsMessage(message: QueueMessage): Promise<void> {
  // Implement SMS sending logic
  logger.info('Sending SMS', { 
    messageId: message.id, 
    to: message.payload.phone,
    message: message.payload.text 
  });

  // Add actual SMS sending implementation here
  await new Promise(resolve => setTimeout(resolve, 150)); // Simulate processing time
}

app.timer('efficientWorker', {
  schedule: '0 */30 * * * *', // Every 30 seconds
  handler: efficientWorker
});
