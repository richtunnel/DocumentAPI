
//Real-time Queue Monitoring Function**
import { app, HttpRequest, HttpResponse } from '@azure/functions';
import { ServiceBusAdministrationClient } from '@azure/service-bus';

async function queueStatus(request: HttpRequest): Promise<HttpResponse> {
  try {
    const adminClient = new ServiceBusAdministrationClient(
      process.env.SERVICE_BUS_CONNECTION_STRING!
    );

    // Temporarily return static data until SDK method is resolved
    return new HttpResponse({
      jsonBody: {
        timestamp: new Date().toISOString(),
        queues: {
          demographics_processing_fifo: {
            activeMessages: 0,
            deadLetterMessages: 0,
            scheduledMessages: 0,
            totalMessages: 0,
            note: "Queue stats temporarily unavailable - SDK method resolution needed"
          },
          webhook_notifications_fifo: {
            activeMessages: 0,
            deadLetterMessages: 0,
            scheduledMessages: 0,
            totalMessages: 0,
            note: "Queue stats temporarily unavailable - SDK method resolution needed"
          }
        },
        processing_stats: {
          estimated_processing_time: 0,
          queue_health: 'unknown'
        }
      }
    });

  } catch (error) {
    return new HttpResponse({
      status: 500,
      jsonBody: {
        error: 'Failed to get queue status',
        timestamp: new Date().toISOString()
      }
    });
  }
}