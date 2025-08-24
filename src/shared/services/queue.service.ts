import { QueueServiceClient, QueueClient } from '@azure/storage-queue';
import { QueueMessage } from '../types/demographics';
import { v4 as uuidv4 } from 'uuid';
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

class QueueService {
  private queueServiceClient: QueueServiceClient;
  private processQueue: QueueClient;
  private webhookQueue: QueueClient;

  constructor() {
    const connectionString = process.env.QUEUE_CONNECTION_STRING!;
    this.queueServiceClient = new QueueServiceClient(connectionString);
    this.processQueue = this.queueServiceClient.getQueueClient('demographics-process');
    this.webhookQueue = this.queueServiceClient.getQueueClient('demographics-webhooks');
  }

  async ensureQueuesExist(): Promise<void> {
    try {
      await this.processQueue.createIfNotExists();
      await this.webhookQueue.createIfNotExists();
    } catch (error) {
      logger.error('Error creating queues', { error });
    }
  }

  async addToProcessQueue(message: Omit<QueueMessage, 'id' | 'created_at'>): Promise<void> {
    await this.ensureQueuesExist();
    
    const queueMessage: QueueMessage = {
      id: uuidv4(),
      created_at: new Date().toISOString(),
      ...message,
    };

    const messageText = Buffer.from(JSON.stringify(queueMessage)).toString('base64');
    await this.processQueue.sendMessage(messageText);
    
    logger.info('Message added to process queue', { messageId: queueMessage.id, type: queueMessage.type });
  }

  async addWebhookMessage(payload: any, priority: number = 5): Promise<void> {
    await this.addToProcessQueue({
      type: 'webhook',
      payload,
      priority,
      retry_count: 0,
      max_retries: 3,
    });
  }

  async getMessagesFromQueue(queueName: 'process' | 'webhook', maxMessages: number = 32): Promise<QueueMessage[]> {
    const queue = queueName === 'process' ? this.processQueue : this.webhookQueue;
    
    try {
      const response = await queue.receiveMessages({ numberOfMessages: maxMessages });
      
      return response.receivedMessageItems.map(item => {
        const messageText = Buffer.from(item.messageText, 'base64').toString('utf-8');
        return JSON.parse(messageText) as QueueMessage;
      });
    } catch (error) {
      logger.error('Error receiving messages from queue', { queueName, error });
      return [];
    }
  }

  async deleteMessage(queueName: 'process' | 'webhook', messageId: string, popReceipt: string): Promise<void> {
    const queue = queueName === 'process' ? this.processQueue : this.webhookQueue;
    
    try {
      await queue.deleteMessage(messageId, popReceipt);
    } catch (error) {
      logger.error('Error deleting message from queue', { queueName, messageId, error });
    }
  }

  async getQueueLength(queueName: 'process' | 'webhook'): Promise<number> {
    const queue = queueName === 'process' ? this.processQueue : this.webhookQueue;
    
    try {
      const properties = await queue.getProperties();
      return properties.approximateMessagesCount || 0;
    } catch (error) {
      logger.error('Error getting queue length', { queueName, error });
      return 0;
    }
  }
}

export const queueService = new QueueService();