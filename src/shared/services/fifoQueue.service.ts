import { ServiceBusClient, ServiceBusMessage, ServiceBusSender, ServiceBusReceiver, ServiceBusAdministrationClient } from "@azure/service-bus";
import { v4 as uuidv4 } from "uuid";
import { logger } from "./logger.service";
import * as dotenv from "dotenv";

dotenv.config();

interface FifoQueueMessage {
  id: string;
  type: "demographics" | "webhook" | "document_processing";
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
  private serviceBusClient: ServiceBusClient | any; // Allow mock or real client
  private adminClient: ServiceBusAdministrationClient | undefined;
  private senders: Map<string, ServiceBusSender | any> = new Map();
  private receivers: Map<string, ServiceBusReceiver | any> = new Map();
  private mockMessages: { [queueName: string]: FifoQueueMessage[] } = {}; // In-memory store for mock

  private readonly queueNames = {
    demographics: "demographics-processing-fifo",
    webhooks: "webhook-notifications-fifo",
    documents: "document-processing",
    deadLetter: "dead-letter-processing",
  };

  constructor() {
    const connectionString = process.env.SERVICE_BUS_CONNECTION_STRING;
    if (process.env.NODE_ENV === "development" && !connectionString) {
      // Mock Service Bus for local development
      this.serviceBusClient = {
        createSender: (queueName: string) => ({
          sendMessages: async (messages: ServiceBusMessage | ServiceBusMessage[]) => {
            const msgArray = Array.isArray(messages) ? messages : [messages];
            this.mockMessages[queueName] = this.mockMessages[queueName] || [];
            msgArray.forEach((msg) => {
              const fifoMsg = msg.body as FifoQueueMessage;
              this.mockMessages[queueName].push(fifoMsg);
              logger.info(`Mock send to ${queueName}:`, { messageId: fifoMsg.id, sessionId: fifoMsg.sessionId });
            });
            return { success: true };
          },
        }),
        createReceiver: (queueName: string, options: any) => ({
          subscribe: (handler: { processMessage: (msg: any) => void; processError: (err: any) => void }) => {
            const messages = this.mockMessages[queueName] || [];
            messages.forEach((msg) => handler.processMessage({ body: msg }));
            // Clear after processing to mimic FIFO per session
            this.mockMessages[queueName] = messages.filter((msg) => msg.sessionId !== (options?.sessionId || ""));
            // Simulate error for testing
            if (Math.random() > 0.8) handler.processError(new Error("Mock error for testing"));
          },
        }),
        acceptSession: (queueName: string, sessionId: string, options: any) => ({
          subscribe: (handler: { processMessage: (msg: any) => void; processError: (err: any) => void }) => {
            const sessionMessages = (this.mockMessages[queueName] || []).filter((msg) => msg.sessionId === sessionId);
            sessionMessages.forEach((msg) => handler.processMessage({ body: msg }));
            this.mockMessages[queueName] = this.mockMessages[queueName].filter((msg) => msg.sessionId !== sessionId);
          },
        }),
        acceptNextSession: (queueName: string, options: any) => ({
          subscribe: (handler: { processMessage: (msg: any) => void; processError: (err: any) => void }) => {
            const sessions = [...new Set((this.mockMessages[queueName] || []).map((msg) => msg.sessionId))];
            if (sessions.length > 0) {
              const sessionId = sessions[0];
              const sessionMessages = (this.mockMessages[queueName] || []).filter((msg) => msg.sessionId === sessionId);
              sessionMessages.forEach((msg) => handler.processMessage({ body: msg }));
              this.mockMessages[queueName] = this.mockMessages[queueName].filter((msg) => msg.sessionId !== sessionId);
            }
          },
        }),
        close: async () => logger.info("Mock client closed"),
      };
    } else {
      this.serviceBusClient = new ServiceBusClient(connectionString || "");
      this.adminClient = new ServiceBusAdministrationClient(connectionString || "");
    }
  }

  async sendMessage(
    queueType: "demographics" | "webhooks" | "documents",
    message: Omit<FifoQueueMessage, "id" | "created_at">
  ): Promise<void> {
    try {
      const queueName = this.queueNames[queueType];
      const sender = await this.getSender(queueName);

      const fifoMessage: FifoQueueMessage = {
        id: uuidv4(),
        created_at: new Date().toISOString(),
        ...message,
      };

      const serviceBusMessage: ServiceBusMessage = {
        messageId: fifoMessage.id,
        body: fifoMessage,
        sessionId: fifoMessage.sessionId,
        correlationId: fifoMessage.correlation_id,
        contentType: "application/json",
        subject: fifoMessage.type,
        timeToLive: 24 * 60 * 60 * 1000,
        scheduledEnqueueTimeUtc: fifoMessage.scheduled_for ? new Date(fifoMessage.scheduled_for) : undefined,
      };

      await sender.sendMessages(serviceBusMessage);

      logger.info("Message sent to FIFO queue", {
        messageId: fifoMessage.id,
        queueName,
        sessionId: fifoMessage.sessionId,
        type: fifoMessage.type,
      });
    } catch (error) {
      logger.error("Error sending message to FIFO queue", { error, queueType });
      throw error;
    }
  }

  async sendMessageBatch(
    queueType: "demographics" | "webhooks" | "documents",
    messages: Omit<FifoQueueMessage, "id" | "created_at">[],
    batchSize: number = 100
  ): Promise<void> {
    try {
      const queueName = this.queueNames[queueType];
      const sender = await this.getSender(queueName);

      for (let i = 0; i < messages.length; i += batchSize) {
        const batch = messages.slice(i, i + batchSize);
        const serviceBusMessages: ServiceBusMessage[] = batch.map((msg) => {
          const fifoMessage: FifoQueueMessage = {
            id: uuidv4(),
            created_at: new Date().toISOString(),
            ...msg,
          };
          return {
            messageId: fifoMessage.id,
            body: fifoMessage,
            sessionId: fifoMessage.sessionId,
            correlationId: fifoMessage.correlation_id,
            contentType: "application/json",
            subject: fifoMessage.type,
            timeToLive: 24 * 60 * 60 * 1000,
          };
        });

        await sender.sendMessages(serviceBusMessages);

        logger.info("Message batch sent to FIFO queue", {
          queueName,
          batchSize: serviceBusMessages.length,
          totalMessages: messages.length,
          batchIndex: Math.floor(i / batchSize) + 1,
        });
      }
    } catch (error) {
      logger.error("Error sending message batch to FIFO queue", { error, queueType });
      throw error;
    }
  }

  async addDemographicsMessage(lawFirm: string, demographicsData: any, priority: number = 5): Promise<void> {
    const sessionId = this.generateSessionId("demographics", lawFirm);
    await this.sendMessage("demographics", {
      type: "demographics",
      payload: demographicsData,
      sessionId,
      priority,
      retry_count: 0,
      max_retries: 3,
      correlation_id: demographicsData.id || uuidv4(),
    });
  }

  async addWebhookMessage(lawFirm: string, webhookData: any, priority: number = 5): Promise<void> {
    const sessionId = this.generateSessionId("webhook", lawFirm);
    await this.sendMessage("webhooks", {
      type: "webhook",
      payload: webhookData,
      sessionId,
      priority,
      retry_count: 0,
      max_retries: 5,
      correlation_id: webhookData.correlation_id || uuidv4(),
    });
  }

  async addDocumentMessage(documentData: any, priority: number = 3): Promise<void> {
    const message = {
      id: uuidv4(),
      type: "document_processing" as const,
      payload: documentData,
      sessionId: "",
      priority,
      retry_count: 0,
      max_retries: 3,
      created_at: new Date().toISOString(),
      correlation_id: documentData.correlationId || uuidv4(),
    };

    const queueName = this.queueNames.documents;
    const sender = await this.getSender(queueName);

    const serviceBusMessage: ServiceBusMessage = {
      messageId: message.id,
      body: message,
      contentType: "application/json",
      subject: message.type,
      timeToLive: 12 * 60 * 60 * 1000,
    };

    await sender.sendMessages(serviceBusMessage);

    logger.info("Document message sent", {
      messageId: message.id,
      queueName,
      correlationId: message.correlation_id,
    });
  }

  async getQueueStats(queueType: "demographics" | "webhooks" | "documents"): Promise<{
    activeMessages: number;
    deadLetterMessages: number;
    scheduledMessages: number;
  }> {
    if (process.env.NODE_ENV === "development") {
      return {
        activeMessages: this.mockMessages[this.queueNames[queueType]]?.length || 0,
        deadLetterMessages: 0,
        scheduledMessages: 0,
      };
    }
    if (!this.adminClient) throw new Error("Admin client not initialized in production");
    const queueName = this.queueNames[queueType];
    const queueStats = await this.adminClient.getQueueRuntimeProperties(queueName);
    return {
      activeMessages: queueStats.activeMessageCount || 0,
      deadLetterMessages: queueStats.deadLetterMessageCount || 0,
      scheduledMessages: queueStats.scheduledMessageCount || 0,
    };
  }

  async createSessionReceiver(
    queueType: "demographics" | "webhooks",
    sessionId?: string
  ): Promise<ServiceBusReceiver> {
    const queueName = this.queueNames[queueType];
    if (process.env.NODE_ENV === "development") {
      return {
        subscribe: (handler: { processMessage: (msg: any) => void; processError: (err: any) => void }) => {
          const sessionMessages = this.mockMessages[queueName]?.filter((msg) => msg.sessionId === sessionId) || [];
          sessionMessages.forEach((msg) => handler.processMessage({ body: msg }));
          this.mockMessages[queueName] = this.mockMessages[queueName]?.filter((msg) => msg.sessionId !== sessionId) || [];
        },
        close: async () => {},
      } as any;
    }
    return sessionId
      ? this.serviceBusClient.acceptSession(queueName, sessionId, { maxAutoLockRenewalDurationInMs: 5 * 60 * 1000 })
      : this.serviceBusClient.acceptNextSession(queueName, { maxAutoLockRenewalDurationInMs: 5 * 60 * 1000 });
  }

  private async getSender(queueName: string): Promise<ServiceBusSender> {
    if (!this.senders.has(queueName)) {
      const sender = this.serviceBusClient.createSender(queueName);
      this.senders.set(queueName, sender);
    }
    return this.senders.get(queueName)!;
  }

  private generateSessionId(type: string, identifier: string): string {
    return `${type}_${identifier.toLowerCase().replace(/[^a-z0-9]/g, "_")}`;
  }

  async close(): Promise<void> {
    for (const [queueName, sender] of this.senders) {
      await (sender as any).close?.();
      logger.info("Queue sender closed", { queueName });
    }
    for (const [queueName, receiver] of this.receivers) {
      await (receiver as any).close?.();
      logger.info("Queue receiver closed", { queueName });
    }
    await this.serviceBusClient.close();
    logger.info("Service Bus client closed");
  }
}

export const fifoQueueService = new FifoQueueService();