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

async function retrieveDemographics(request: HttpRequest, context: InvocationContext): Promise<HttpResponse> {
  const requestId = uuidv4();
  const startTime = Date.now();
  
  try {
    logger.info('Demographics retrieval started', { requestId });

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

    // Parse query parameters
    const limit = Math.min(parseInt(request.query.get('limit') || '50'), 100);
    const offset = parseInt(request.query.get('offset') || '0');

    // Retrieve demographics for the law firm
    const demographics = await databaseService.getDemographicsByLawFirm(
      apiKey.law_firm,
      limit,
      offset
    );

    const processingTime = Date.now() - startTime;
    logger.info('Demographics retrieval completed', { 
      requestId, 
      count: demographics.length,
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
        data: demographics,
        pagination: {
          limit,
          offset,
          count: demographics.length,
        },
        requestId,
        processingTime
      }
    });

  } catch (error) {
    const processingTime = Date.now() - startTime;
    logger.error('Error retrieving demographics', { requestId, error, processingTime });
    
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

app.http('retrieveDemographics', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'demographics',
  handler: retrieveDemographics
});