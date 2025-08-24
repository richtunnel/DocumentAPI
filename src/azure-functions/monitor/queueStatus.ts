
//Real-time Queue Monitoring Function**
import { app, HttpRequest, HttpResponse } from '@azure/functions';
import { ServiceBusAdministrationClient } from '@azure/service-bus';

async function queueStatus(request: HttpRequest): Promise<HttpResponse> {
  const adminClient = new ServiceBusAdministrationClient(
    process.env.SERVICE_BUS_CONNECTION_STRING!
  );

  const processQueue = await adminClient.getQueueRuntimeProperties('demographics-processing');
  const webhookQueue = await adminClient.getQueueRuntimeProperties('webhook-notifications');

  return new HttpResponse({
    jsonBody: {
      timestamp: new Date().toISOString(),
      queues: {
        demographics_processing: {
          activeMessages: processQueue.activeMessageCount,
          deadLetterMessages: processQueue.deadLetterMessageCount,
          scheduledMessages: processQueue.scheduledMessageCount,
          totalMessages: processQueue.totalMessageCount
        },
        webhook_notifications: {
          activeMessages: webhookQueue.activeMessageCount,  
          deadLetterMessages: webhookQueue.deadLetterMessageCount,
          scheduledMessages: webhookQueue.scheduledMessageCount,
          totalMessages: webhookQueue.totalMessageCount
        }
      },
      processing_stats: {
        estimated_processing_time: Math.ceil(processQueue.activeMessageCount / 32) * 30, // seconds
        queue_health: processQueue.deadLetterMessageCount > 10 ? 'unhealthy' : 'healthy'
      }
    }
  });
}

app.http('queueStatus', {
  methods: ['GET'],
  route: 'monitor/queues',
  handler: queueStatus
});