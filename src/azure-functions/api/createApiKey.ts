import { app, HttpRequest, HttpResponse, InvocationContext } from '@azure/functions';
import { v4 as uuidv4 } from 'uuid';
import { CreateApiKeyRequestSchema } from '../../shared/types/apiKey';
import { apiKeyService } from '../../shared/services/apiKey.service';
import winston from 'winston';
import jwt from 'jsonwebtoken';
import {z} from "zod";

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

// Interface for authenticated user info
interface AuthenticatedUser {
  userId: string;
  lawFirm: string;
  email: string;
  roles: string[];
}

async function createApiKey(request: HttpRequest, context: InvocationContext): Promise<HttpResponse> {
  const requestId = uuidv4();
  const startTime = Date.now();
  
  try {
    logger.info('API key creation started', { requestId });

    //JWT Token Authentication
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new HttpResponse({
        status: 401,
        jsonBody: { error: 'Bearer token required', requestId }
      });
    }

    const token = authHeader.substring(7);
    let authenticatedUser: AuthenticatedUser;

    try {
      // Verify and decode JWT token
      const decoded = jwt.verify(token, process.env.JWT_SECRET!) as any;
      authenticatedUser = {
        userId: decoded.sub || decoded.userId,
        lawFirm: decoded.lawFirm,
        email: decoded.email,
        roles: decoded.roles || []
      };

      // Check if user has admin role
      if (!authenticatedUser.roles.includes('admin')) {
        return new HttpResponse({
          status: 403,
          jsonBody: { error: 'Admin role required to create API keys', requestId }
        });
      }
    } catch (jwtError) {
      return new HttpResponse({
        status: 401,
        jsonBody: { error: 'Invalid or expired token', requestId }
      });
    }

    // Parse and validate request body
    const body = await request.json();
    const validation = CreateApiKeyRequestSchema.safeParse(body);
    
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

    const createRequest = validation.data;

    // extract law firm and created by from authenticated user from JWT Token
    const lawFirm = authenticatedUser.lawFirm; 
    const createdBy = authenticatedUser.userId; 

    // Create API key
    const { apiKey, plainTextKey } = await apiKeyService.createApiKey(
      createRequest,
      lawFirm,
      createdBy
    );

    const processingTime = Date.now() - startTime;
    logger.info('API key created successfully', { 
      requestId, 
      keyId: apiKey.key_id,
      lawFirm: apiKey.law_firm,
      createdBy: authenticatedUser.email,
      scopes: apiKey.scopes,
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
          description: apiKey.description,
          scopes: apiKey.scopes,
          rate_limits: apiKey.rate_limits,
          expires_at: apiKey.expires_at,
          created_at: apiKey.created_at,
          law_firm: apiKey.law_firm,
        },
        key: plainTextKey, // only returned once
        requestId,
        processingTime,
        warning: 'Store this API key securely. It will not be shown again.'
      }
    });

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

// Create api key for development
async function createDevelopmentApiKey(request: HttpRequest, context: InvocationContext): Promise<HttpResponse> {
  const requestId = uuidv4();
  const startTime = Date.now();
  
  try {
    // Simple approach: Pass law_firm and user info in request body
    const body = await request.json();
    
    // Extended validation to include required auth fields
    const extendedSchema = CreateApiKeyRequestSchema.extend({
      law_firm: z.string().min(3).max(75), // Required in request
      created_by_email: z.string().email(), // Who's creating it
    });
    
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
    
    // Use law_firm from request body
    const lawFirm = createRequest.law_firm;
    const createdBy = uuidv4(); // Generate UUID for created_by

    // Create API key
    const { apiKey, plainTextKey } = await apiKeyService.createApiKey(
      createRequest,
      lawFirm,
      createdBy
    );

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
        requestId
      }
    });

  } catch (error) {
    logger.error('Error creating API key', { requestId, error });
    
    return new HttpResponse({
      status: 500,
      jsonBody: { 
        error: 'Internal server error', 
        requestId
      }
    });
  }
}

if(process.env.NODE_ENV === 'development' || process.env.NODE_ENV !== 'production') {
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