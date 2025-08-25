import { app, HttpRequest, HttpResponse, InvocationContext } from '@azure/functions';
import { v4 as uuidv4 } from 'uuid';
import { databaseService } from '../../shared/database/database.service';
import { apiKeyService } from '../../shared/services/apiKey.service';
import { rateLimiter } from '../../shared/services/rateLimiter.service';
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

async function getDemographicById(request: HttpRequest, context: InvocationContext): Promise<HttpResponse> {
  const requestId = uuidv4();
  const startTime = Date.now();
  
  try {
    logger.info('Get demographic by ID started', { requestId });

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
      ['demographics:read']
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

    // Get demographic ID from route parameters
    const demographicId = request.params.id;
    if (!demographicId) {
      return new HttpResponse({
        status: 400,
        jsonBody: { error: 'Demographic ID required', requestId }
      });
    }

    // Retrieve specific demographic
    const demographic = await databaseService.getDemographicById(
      demographicId,
      apiKey.law_firm
    );

    if (!demographic) {
      return new HttpResponse({
        status: 404,
        jsonBody: { error: 'Demographic not found', requestId }
      });
    }

    const processingTime = Date.now() - startTime;
    logger.info('Get demographic by ID completed', { 
      requestId, 
      demographicId,
      lawFirm: apiKey.law_firm,
      processingTime 
    });

    return new HttpResponse({
      status: 200,
      headers: {
        'X-RateLimit-Limit': rateLimitResult.limit.toString(),
        'X-RateLimit-Remaining': rateLimitResult.remaining.toString(),
        'X-RateLimit-Reset': rateLimitResult.resetTime.toISOString(),
      },
      jsonBody: {
        data: demographic,
        requestId,
        processingTime
      }
    });

  } catch (error) {
    const processingTime = Date.now() - startTime;
    logger.error('Error getting demographic by ID', { requestId, error, processingTime });
    
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

app.http('getDemographicById', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'demographics/{id}',
  handler: getDemographicById
});
