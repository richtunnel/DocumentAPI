import { app, HttpRequest, HttpResponse, InvocationContext } from '@azure/functions';
import { v4 as uuidv4 } from 'uuid';
import { CreateDemographicsRequestSchema, Demographics } from '../../shared/types/demographics';
import { databaseService } from '../../shared/database/database.service';
import { queueService } from '../../shared/services/queue.service';
import { authMiddleware, addRateLimitHeaders } from '../../shared/middleware/auth.middleware';
import { logger } from '../monitor/winstonLogger';

async function submitDemographics(request: HttpRequest, context: InvocationContext): Promise<HttpResponse> {
  const startTime = Date.now();
  
  try {
    //  authentication with single line that handle everything
    const authResult = await authMiddleware(request, context, {
      requiredScopes: ['demographics:write']
    });

    if (!authResult.success) {
      return authResult.response; // Returns 401/429 with proper error handling
    }

    // extract authenticated data
    const { request: originalRequest, auth, requestId } = authResult.data;

    logger.info('Demographics submission started', { 
      requestId,
      lawFirm: auth.lawFirm,
      keyId: auth.keyId
    });

    // business Logic
    const body = await originalRequest.json();
    const validation = CreateDemographicsRequestSchema.safeParse(body);
    
    if (!validation.success) {
      return addRateLimitHeaders(new HttpResponse({
        status: 400,
        jsonBody: { 
          error: 'Validation failed', 
          details: validation.error.issues,
          requestId
        }
      }), context);
    }

    const demographicsData = validation.data;
    const now = new Date().toISOString();

    // Create demographics record using authenticated context
    const demographics: Demographics = {
      id: uuidv4(),
      partitionKey: auth.lawFirm,         // from authenticated user
      ...demographicsData,
      created_at: now,
      updated_at: now,
      created_by: auth.apiKey.created_by,  // from authenticated user
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
        apiKeyId: auth.keyId,
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

    // Rate limit headers automatically added
    return addRateLimitHeaders(new HttpResponse({
      status: 201,
      jsonBody: {
        id: demographics.id,
        message: 'Demographics submitted successfully',
        requestId,
        processingTime
      }
    }), context);

  } catch (error) {
    const processingTime = Date.now() - startTime;
    logger.error('Error submitting demographics', { 
      error: error instanceof Error ? error.message : String(error),
      processingTime 
    });
    
    return new HttpResponse({
      status: 500,
      jsonBody: { 
        error: 'Internal server error', 
        processingTime
      }
    });
  }
}

// Register the function
app.http('submitDemographics', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'demographics',
  handler: submitDemographics
});

export { submitDemographics };