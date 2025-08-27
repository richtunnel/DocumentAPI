//Queue processing
import { ServiceBusClient, ServiceBusMessage, ServiceBusSender, ServiceBusReceiver, ServiceBusAdministrationClient } from '@azure/service-bus';
import { v4 as uuidv4 } from 'uuid';
import { logger } from './logger.service';

interface FifoQueueMessage {
  id: string;
  type: 'demographics' | 'webhook' | 'document_processing';
  payload: any;
  sessionId: string; // Required for FIFO
  priority: number;
  retry_count: number;
  max_retries: number;
  created_at: string;
  scheduled_for?: string;
  correlation_id?: string;
}

class FifoQueueService {
  private serviceBusClient: ServiceBusClient;
  private adminClient: ServiceBusAdministrationClient;
  private senders: Map<string, ServiceBusSender> = new Map();
  private receivers: Map<string, ServiceBusReceiver> = new Map();

  private readonly queueNames = {
    demographics: 'demographics-processing-fifo',
    webhooks: 'webhook-notifications-fifo', 
    documents: 'document-processing',
    deadLetter: 'dead-letter-processing'
  };

  constructor() {
    const connectionString = process.env.SERVICE_BUS_CONNECTION_STRING!;
    this.serviceBusClient = new ServiceBusClient(connectionString);
    this.adminClient = new ServiceBusAdministrationClient(connectionString);
  }

  /**
   * Send single message to FIFO queue
   */
  async sendMessage(
    queueType: 'demographics' | 'webhooks' | 'documents',
    message: Omit<FifoQueueMessage, 'id' | 'created_at'>
  ): Promise<void> {
    try {
      const queueName = this.queueNames[queueType];
      const sender = await this.getSender(queueName);

      const fifoMessage: FifoQueueMessage = {
        id: uuidv4(),
        created_at: new Date().toISOString(),
        ...message
      };

      const serviceBusMessage: ServiceBusMessage = {
        messageId: fifoMessage.id,
        body: fifoMessage,
        sessionId: fifoMessage.sessionId, // critical for FIFO ordering
        correlationId: fifoMessage.correlation_id,
        contentType: 'application/json',
        subject: fifoMessage.type,
        timeToLive: 24 * 60 * 60 * 1000, // 24 hours
        scheduledEnqueueTimeUtc: fifoMessage.scheduled_for ? new Date(fifoMessage.scheduled_for) : undefined
      };

      await sender.sendMessages(serviceBusMessage);

      logger.info('Message sent to FIFO queue', {
        messageId: fifoMessage.id,
        queueName,
        sessionId: fifoMessage.sessionId,
        type: fifoMessage.type
      });

    } catch (error) {
      logger.error('Error sending message to FIFO queue', { error, queueType });
      throw error;
    }
  }

  /**
   * Send batch of messages for better throughput
   */
  async sendMessageBatch(
    queueType: 'demographics' | 'webhooks' | 'documents',
    messages: Omit<FifoQueueMessage, 'id' | 'created_at'>[],
    batchSize: number = 100
  ): Promise<void> {
    try {
      const queueName = this.queueNames[queueType];
      const sender = await this.getSender(queueName);

      // Process in batches to respect Service Bus limits
      for (let i = 0; i < messages.length; i += batchSize) {
        const batch = messages.slice(i, i + batchSize);
        
        const serviceBusMessages: ServiceBusMessage[] = batch.map(msg => {
          const fifoMessage: FifoQueueMessage = {
            id: uuidv4(),
            created_at: new Date().toISOString(),
            ...msg
          };

          return {
            messageId: fifoMessage.id,
            body: fifoMessage,
            sessionId: fifoMessage.sessionId,
            correlationId: fifoMessage.correlation_id,
            contentType: 'application/json',
            subject: fifoMessage.type,
            timeToLive: 24 * 60 * 60 * 1000
          };
        });

        // Use Service Bus native batching
        await sender.sendMessages(serviceBusMessages);

        logger.info('Message batch sent to FIFO queue', {
          queueName,
          batchSize: serviceBusMessages.length,
          totalMessages: messages.length,
          batchIndex: Math.floor(i / batchSize) + 1
        });
      }

    } catch (error) {
      logger.error('Error sending message batch to FIFO queue', { error, queueType });
      throw error;
    }
  }

  /**
   * Add demographics message with law firm as session ID for FIFO per firm
   */
  async addDemographicsMessage(
    lawFirm: string,
    demographicsData: any,
    priority: number = 5
  ): Promise<void> {
    const sessionId = this.generateSessionId('demographics', lawFirm);
    
    await this.sendMessage('demographics', {
      type: 'demographics',
      payload: demographicsData,
      sessionId,
      priority,
      retry_count: 0,
      max_retries: 3,
      correlation_id: demographicsData.id || uuidv4()
    });
  }

  /**
   * Add webhook message with law firm session for ordered delivery
   */
  async addWebhookMessage(
    lawFirm: string,
    webhookData: any,
    priority: number = 5
  ): Promise<void> {
    const sessionId = this.generateSessionId('webhook', lawFirm);
    
    await this.sendMessage('webhooks', {
      type: 'webhook',
      payload: webhookData,
      sessionId,
      priority,
      retry_count: 0,
      max_retries: 5,
      correlation_id: webhookData.correlation_id || uuidv4()
    });
  }

  /**
   * Add document processing message (non-FIFO, high throughput)
   */
  async addDocumentMessage(
    documentData: any,
    priority: number = 3
  ): Promise<void> {
    // Documents don't need FIFO, so we use regular queue
    const message = {
      id: uuidv4(),
      type: 'document_processing' as const,
      payload: documentData,
      sessionId: '', // Not needed for non-FIFO queue
      priority,
      retry_count: 0,
      max_retries: 3,
      created_at: new Date().toISOString(),
      correlation_id: documentData.correlationId || uuidv4()
    };

    const queueName = this.queueNames.documents;
    const sender = await this.getSender(queueName);

    const serviceBusMessage: ServiceBusMessage = {
      messageId: message.id,
      body: message,
      contentType: 'application/json',
      subject: message.type,
      timeToLive: 12 * 60 * 60 * 1000, // 12 hours for documents
    };

    await sender.sendMessages(serviceBusMessage);

    logger.info('Document message sent', {
      messageId: message.id,
      queueName,
      correlationId: message.correlation_id
    });
  }

  /**
   * Get queue statistics - Simplified version
   * TODO: Fix when Azure Service Bus SDK method is confirmed
   */
  async getQueueStats(queueType: 'demographics' | 'webhooks' | 'documents'): Promise<{
    activeMessages: number;
    deadLetterMessages: number;
    scheduledMessages: number;
  }> {
    // Temporarily return empty stats until SDK method is resolved
    logger.info('Queue stats requested', { queueType, queueName: this.queueNames[queueType] });
    
    return { 
      activeMessages: 0, 
      deadLetterMessages: 0, 
      scheduledMessages: 0 
    };
    
    // #edits: uncomment when SDK version is confirmed
    /*
    try {
      const queueName = this.queueNames[queueType];
      const queueStats = await this.adminClient.getQueueRuntimeProperties(queueName);
      
      return {
        activeMessages: queueStats.activeMessageCount || 0,
        deadLetterMessages: queueStats.deadLetterMessageCount || 0,
        scheduledMessages: queueStats.scheduledMessageCount || 0
      };
    } catch (error) {
      logger.error('Error getting queue stats', { error, queueType });
      return { activeMessages: 0, deadLetterMessages: 0, scheduledMessages: 0 };
    }
    */
  }

  /**
   * process messages from session-enabled queue (FIFO)
   */
  async createSessionReceiver(
    queueType: 'demographics' | 'webhooks',
    sessionId?: string
  ): Promise<ServiceBusReceiver> {
    const queueName = this.queueNames[queueType];
    
    if (sessionId) {
      // Process specific session
      return this.serviceBusClient.acceptSession(queueName, sessionId, {
        maxAutoLockRenewalDurationInMs: 5 * 60 * 1000, // 5 minutes
      });
    } else {
      // Accept next available session
      return this.serviceBusClient.acceptNextSession(queueName, {
        maxAutoLockRenewalDurationInMs: 5 * 60 * 1000,
      });
    }
  }

  private async getSender(queueName: string): Promise<ServiceBusSender> {
    if (!this.senders.has(queueName)) {
      const sender = this.serviceBusClient.createSender(queueName);
      this.senders.set(queueName, sender);
    }
    return this.senders.get(queueName)!;
  }

  private generateSessionId(type: string, identifier: string): string {
    // Create consistent session ID for FIFO ordering
    // Same law firm will always get same session = FIFO per law firm
    return `${type}_${identifier.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
  }

  async close(): Promise<void> {
    // Close all senders
    for (const [queueName, sender] of this.senders) {
      await sender.close();
      logger.info('Queue sender closed', { queueName });
    }

    // Close all receivers
    for (const [queueName, receiver] of this.receivers) {
      await receiver.close();
      logger.info('Queue receiver closed', { queueName });
    }

    // Close service bus client
    await this.serviceBusClient.close();
    logger.info('Service Bus client closed');
  }
}

export const fifoQueueService = new FifoQueueService();