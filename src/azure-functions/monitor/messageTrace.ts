import { app, HttpRequest, HttpResponse } from '@azure/functions';

async function messageTrace(request: HttpRequest): Promise<HttpResponse> {
  const messageId = request.params.messageId;
  
  // Query your logs/database for message trace
  const trace = {
    messageId,
    status: 'processing', // created, processing, completed, failed
    timeline: [
      { timestamp: '2025-01-15T10:30:00Z', event: 'message_created', details: 'Added to demographics-processing queue' },
      { timestamp: '2025-01-15T10:30:30Z', event: 'processing_started', details: 'Picked up by hybrid worker' },
      { timestamp: '2025-01-15T10:30:31Z', event: 'webhook_delivered', details: 'Sent to https://client-webhook.com/demographics' },
      { timestamp: '2025-01-15T10:30:32Z', event: 'completed', details: 'Message processing completed successfully' }
    ],
    retry_count: 0,
    last_error: null
  };

  return new HttpResponse({
    jsonBody: trace
  });
}

app.http('messageTrace', {
  methods: ['GET'], 
  route: 'monitor/messages/{messageId}',
  handler: messageTrace
});