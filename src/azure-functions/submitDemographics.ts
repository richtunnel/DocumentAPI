import { app, HttpRequest, HttpResponse, InvocationContext } from '@azure/functions';
import { v4 as uuidv4 } from 'uuid';
import { CreateDemographicsRequestSchema, Demographics } from '../shared/types/demographics';
import { databaseService } from '../shared/database/database.service';
import { apiKeyService } from '../shared/services/apiKey.service';
import { rateLimiter } from '../shared/services/rateLimiter.service';
import { queueService } from '../shared/services/queue.service';
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

async function submitDemographics(request: HttpRequest, context: InvocationContext): Promise<HttpResponse> {
  const requestId = uuidv4();
  const startTime = Date.now();
  
  try {
    logger.info('Demographics submission started', { requestId });

    // Get client IP
    const clientIP = request.headers.get('x-forwarded-for') || 
                    request.headers.get('x-real-ip') || 
                    'unknown';

    // Validate API key
    const apiKeyHeader = request.headers.get('x-api-key');
    if (!apiKeyHeader) {
      return new HttpResponse({
        status: 401,
        jsonBody: { error: 'API key required', requestId }
      });
    }

    const { apiKey, isValid, error } = await apiKeyService.validateApiKey(
      apiKeyHeader,
      clientIP,
      ['demographics:write']
    );

    if (!isValid) {
      return new HttpResponse({
        status: 401,
        jsonBody: { error: error || 'Invalid API key', requestId }
      });
    }

    // Check rate limits
    const rateLimitResult = await rateLimiter.checkRateLimit(apiKey, clientIP);
    if (!rateLimitResult.allowed) {
      return new HttpResponse({
        status: 429,
        headers: {
          'X-RateLimit-Limit': rateLimitResult.limit.toString(),
          'X-RateLimit-Remaining': rateLimitResult.remaining.toString(),
          'X-RateLimit-Reset': rateLimitResult.resetTime.toISOString(),
          'X-RateLimit-Window': rateLimitResult.windowType,
        },
        jsonBody: { 
          error: 'Rate limit exceeded', 
          resetTime: rateLimitResult.resetTime.toISOString(),
          requestId 
        }
      });
    }

    // Parse and validate request body
    const body = await request.json();
    const validation = CreateDemographicsRequestSchema.safeParse(body);
    
    if (!validation.success) {
      return new HttpResponse({
        status: 400,
        jsonBody: { 
          error: 'Validation failed', 
          details: validation.error.issues,
          requestId 
        }
      });
    }

    const demographicsData = validation.data;
    const now = new Date().toISOString();

    // Create demographics record
    const demographics: Demographics = {
      id: uuidv4(),
      partitionKey: apiKey.law_firm,
      ...demographicsData,
      created_at: now,
      updated_at: now,
      created_by: apiKey.created_by,
    };

    // Save to database
    await databaseService.createDemographic(demographics);

    // Add webhook notification to queue
    await queueService.addWebhookMessage({
      event: 'demographics.created',
      data: {
        id: demographics.id,
        law_firm: demographics.law_firm,
        created_at: demographics.created_at,
      },
      metadata: {
        apiKeyId: apiKey.key_id,
        requestId,
      }
    });

    const processingTime = Date.now() - startTime;
    logger.info('Demographics submission completed', { 
      requestId, 
      demographicsId: demographics.id,
      lawFirm: demographics.law_firm,
      processingTime 
    });

    return new HttpResponse({
      status: 201,
      headers: {
        'X-RateLimit-Limit': rateLimitResult.limit.toString(),
        'X-RateLimit-Remaining': rateLimitResult.remaining.toString(),
        'X-RateLimit-Reset': rateLimitResult.resetTime.toISOString(),
      },
      jsonBody: {
        id: demographics.id,
        message: 'Demographics submitted successfully',
        requestId,
        processingTime
      }
    });

  } catch (error) {
    const processingTime = Date.now() - startTime;
    logger.error('Error submitting demographics', { requestId, error, processingTime });
    
    return new HttpResponse({
      status: 500,
      jsonBody: { 
        error: 'Internal server error', 
        requestId,
        processingTime
      }
    });
  }
}

app.http('submitDemographics', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'demographics',
  handler: submitDemographics
});