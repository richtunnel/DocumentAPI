import { app, HttpRequest, HttpResponse, InvocationContext } from '@azure/functions';
import { databaseService } from '../../shared/database/database.service';
import { authMiddleware, addRateLimitHeaders } from '../../shared/middleware/auth.middleware';
import { logger } from '../monitor/winstonLogger';

async function retrieveDemographics(request: HttpRequest, context: InvocationContext): Promise<HttpResponse> {
  const startTime = Date.now();
  
  try {
    // Use authMiddleware for authentication and rate limiting
    const authResult = await authMiddleware(request, context, {
      requiredScopes: ['demographics:read']
    });

    if (!authResult.success) {
      return authResult.response;
    }

    const { auth, requestId } = authResult.data;

    logger.info('Demographics retrieval started', { 
      requestId,
      lawFirm: auth.lawFirm,
      keyId: auth.keyId 
    });

    // Parse query parameters
    const limit = Math.min(parseInt(request.query.get('limit') || '50'), 100);
    const offset = parseInt(request.query.get('offset') || '0');

    // Retrieve demographics for the authenticated law firm
    const demographics = await databaseService.getDemographicsByLawFirm(
      auth.lawFirm,
      limit,
      offset
    );

    const processingTime = Date.now() - startTime;
    logger.info('Demographics retrieval completed', { 
      requestId, 
      count: demographics.length,
      lawFirm: auth.lawFirm,
      processingTime 
    });

    return addRateLimitHeaders(new HttpResponse({
      status: 200,
      jsonBody: {
        data: demographics,
        pagination: {
          limit,
          offset,
          count: demographics.length,
        },
        requestId,
        processingTime
      }
    }), context);

  } catch (error) {
    const processingTime = Date.now() - startTime;
    logger.error('Error retrieving demographics', { error, processingTime });
    
    return new HttpResponse({
      status: 500,
      jsonBody: { 
        error: 'Internal server error', 
        processingTime
      }
    });
  }
}

app.http('retrieveDemographics', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'demographics',
  handler: retrieveDemographics
});

export { retrieveDemographics };