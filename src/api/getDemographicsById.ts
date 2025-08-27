import { app, HttpRequest, HttpResponse, InvocationContext } from '@azure/functions';
import { databaseService } from '../shared/database/database.service';
import { authMiddleware, addRateLimitHeaders } from '../middleware/auth.middleware';
import { logger } from '../shared/services/logger.service';

async function getDemographicById(request: HttpRequest, context: InvocationContext): Promise<HttpResponse> {
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

    logger.info('Get demographic by ID started', { 
      requestId,
      lawFirm: auth.lawFirm,
      keyId: auth.keyId 
    });

    // Get demographic ID from route parameters
    const demographicId = request.params.id;
    if (!demographicId) {
      return addRateLimitHeaders(new HttpResponse({
        status: 400,
        jsonBody: { 
          error: 'Demographic ID required', 
          requestId 
        }
      }), context);
    }

    // Retrieve specific demographic for the authenticated law firm
    const demographic = await databaseService.getDemographicById(
      demographicId,
      auth.lawFirm
    );

    if (!demographic) {
      return addRateLimitHeaders(new HttpResponse({
        status: 404,
        jsonBody: { 
          error: 'Demographic not found', 
          requestId 
        }
      }), context);
    }

    const processingTime = Date.now() - startTime;
    logger.info('Get demographic by ID completed', { 
      requestId, 
      demographicId,
      lawFirm: auth.lawFirm,
      processingTime 
    });

    return addRateLimitHeaders(new HttpResponse({
      status: 200,
      jsonBody: {
        data: demographic,
        requestId,
        processingTime
      }
    }), context);

  } catch (error) {
    const processingTime = Date.now() - startTime;
    logger.error('Error getting demographic by ID', { error, processingTime });
    
    return new HttpResponse({
      status: 500,
      jsonBody: { 
        error: 'Internal server error', 
        processingTime
      }
    });
  }
}

app.http('getDemographicById', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'demographics/{id}',
  handler: getDemographicById
});

export { getDemographicById };
