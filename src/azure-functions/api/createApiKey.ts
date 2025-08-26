import { app, HttpRequest, HttpResponse, InvocationContext } from '@azure/functions';
import { v4 as uuidv4 } from 'uuid';
import { CreateApiKeyRequestSchema } from '../../shared/types/apiKey';
import { apiKeyService } from '../../shared/services/apiKey.service';
import { authMiddleware, addRateLimitHeaders } from '../../shared/middleware/auth.middleware';
import { z } from "zod";
import { logger } from '../monitor/winstonLogger';

// Production version with JWT authentication
async function createApiKey(request: HttpRequest, context: InvocationContext): Promise<HttpResponse> {
  const requestId = uuidv4();
  const startTime = Date.now();
  
  try {
    logger.info('API key creation started', { requestId });

    // Use authMiddleware for admin operations
    const authResult = await authMiddleware(request, context, {
      requiredScopes: ['demographics:admin']
    });

    if (!authResult.success) {
      return authResult.response;
    }

    const { auth } = authResult.data;

    // Parse and validate request body
    const body = await request.json();
    const validation = CreateApiKeyRequestSchema.safeParse(body);
    
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

    const createRequest = validation.data;

    // Create API key using authenticated user's context
    const { apiKey, plainTextKey } = await apiKeyService.createApiKey(
      createRequest,
      auth.lawFirm,
      auth.apiKey.created_by
    );

    const processingTime = Date.now() - startTime;
    logger.info('API key created successfully', { 
      requestId, 
      keyId: apiKey.key_id,
      lawFirm: apiKey.law_firm,
      scopes: apiKey.scopes,
      processingTime 
    });

    return addRateLimitHeaders(new HttpResponse({
      status: 201,
      jsonBody: {
        message: 'API key created successfully',
        apiKey: {
          id: apiKey.id,
          key_id: apiKey.key_id,
          name: apiKey.name,
          description: apiKey.description,
          scopes: apiKey.scopes,
          rate_limits: apiKey.rate_limits,
          expires_at: apiKey.expires_at,
          created_at: apiKey.created_at,
          law_firm: apiKey.law_firm,
        },
        key: plainTextKey,
        requestId,
        processingTime,
        warning: 'Store this API key securely. It will not be shown again.'
      }
    }), context);

  } catch (error) {
    const processingTime = Date.now() - startTime;
    logger.error('Error creating API key', { requestId, error, processingTime });
    
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

// Development version with simplified auth
async function createDevelopmentApiKey(request: HttpRequest, context: InvocationContext): Promise<HttpResponse> {
  const requestId = uuidv4();
  const startTime = Date.now();
  
  try {
    logger.info('Development API key creation started', { requestId });

    // Extended validation to include required auth fields for development
    const extendedSchema = CreateApiKeyRequestSchema.extend({
      law_firm: z.string().min(3).max(75),
      created_by_email: z.string().email(),
    });
    
    const body = await request.json();
    const validation = extendedSchema.safeParse(body);
    
    if (!validation.success) {
      return new HttpResponse({
        status: 400,
        jsonBody: { 
          error: 'Validation failed. law_firm and created_by_email are required.',
          details: validation.error.issues,
          requestId 
        }
      });
    }

    const createRequest = validation.data;
    const lawFirm = createRequest.law_firm;
    const createdBy = uuidv4();

    // Create API key
    const { apiKey, plainTextKey } = await apiKeyService.createApiKey(
      createRequest,
      lawFirm,
      createdBy
    );

    const processingTime = Date.now() - startTime;
    logger.info('Development API key created successfully', { 
      requestId, 
      keyId: apiKey.key_id,
      lawFirm: apiKey.law_firm,
      processingTime 
    });

    return new HttpResponse({
      status: 201,
      jsonBody: {
        message: 'API key created successfully',
        apiKey: {
          id: apiKey.id,
          key_id: apiKey.key_id,
          name: apiKey.name,
          law_firm: apiKey.law_firm,
          scopes: apiKey.scopes,
          rate_limits: apiKey.rate_limits,
          expires_at: apiKey.expires_at,
          created_at: apiKey.created_at,
        },
        key: plainTextKey,
        requestId,
        processingTime
      }
    });

  } catch (error) {
    const processingTime = Date.now() - startTime;
    logger.error('Error creating development API key', { requestId, error, processingTime });
    
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

// Register appropriate handler based on environment
if (process.env.NODE_ENV === 'development' || process.env.NODE_ENV !== 'production') {
  app.http('createApiKey', {
    methods: ['POST'],
    authLevel: 'anonymous',
    route: 'admin/api-keys',
    handler: createDevelopmentApiKey
  });
} else {
  app.http('createApiKey', {
    methods: ['POST'],
    authLevel: 'anonymous',
    route: 'admin/api-keys',
    handler: createApiKey 
  });
}

export { createApiKey, createDevelopmentApiKey };
