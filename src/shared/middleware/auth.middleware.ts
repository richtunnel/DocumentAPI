import { HttpRequest, HttpResponse, InvocationContext } from '@azure/functions';
import { v4 as uuidv4 } from 'uuid';
import { apiKeyService } from '../services/apiKey.service';
import { rateLimiter } from '../services/rateLimiter.service';
import { logger } from '../../azure-functions/monitor/winstonLogger';

// ✅ TypeScript interfaces that don't conflict with Azure Functions
export interface AuthContext {
  apiKey: any;
  lawFirm: string;
  keyId: string;
  scopes: string[];
}

export interface AuthenticatedRequest {
  request: HttpRequest;    // Original request object
  auth: AuthContext;       // Authentication context
  requestId: string;       // Unique request ID
}

export interface AuthMiddlewareOptions {
  requiredScopes?: string[];
  skipRateLimit?: boolean;
  allowAnonymous?: boolean;
}

/**
 * Authentication middleware for Azure Functions
 * Validates API keys, checks rate limits, and adds user context
 */
export async function authMiddleware(
  request: HttpRequest,
  context: InvocationContext,
  options: AuthMiddlewareOptions = {}
): Promise<{ success: true; data: AuthenticatedRequest } | { success: false; response: HttpResponse }> {
  const requestId = uuidv4();
  const startTime = Date.now();

  try {
    // Skip auth for health checks or anonymous endpoints
    if (options.allowAnonymous) {
      return { 
        success: true, 
        data: { 
          request, 
          auth: null as any, // No auth context for anonymous requests
          requestId 
        } 
      };
    }

    // Get client IP
    const clientIP = request.headers.get('x-forwarded-for') || 
                    request.headers.get('x-real-ip') || 
                    'unknown';

    // Validate API key
    const apiKeyHeader = request.headers.get('x-api-key');
    if (!apiKeyHeader) {
      logger.warn('Missing API key', { requestId, clientIP, path: request.url });
      return {
        success: false,
        response: new HttpResponse({
          status: 401,
          jsonBody: { 
            error: 'API key required', 
            requestId,
            code: 'MISSING_API_KEY'
          }
        })
      };
    }

    const { apiKey, isValid, error } = await apiKeyService.validateApiKey(
      apiKeyHeader,
      clientIP,
      options.requiredScopes || []
    );

    if (!isValid) {
      logger.warn('Invalid API key', { 
        requestId, 
        clientIP, 
        keyId: apiKeyHeader.substring(0, 11),
        error,
        path: request.url 
      });
      
      return {
        success: false,
        response: new HttpResponse({
          status: 401,
          jsonBody: { 
            error: error || 'Invalid API key', 
            requestId,
            code: 'INVALID_API_KEY'
          }
        })
      };
    }

    // Check rate limits
    if (!options.skipRateLimit) {
      const rateLimitResult = await rateLimiter.checkRateLimit(apiKey, clientIP);
      if (!rateLimitResult.allowed) {
        logger.warn('Rate limit exceeded', {
          requestId,
          keyId: apiKey.key_id,
          clientIP,
          limit: rateLimitResult.limit,
          windowType: rateLimitResult.windowType
        });

        return {
          success: false,
          response: new HttpResponse({
            status: 429,
            headers: {
              'X-RateLimit-Limit': rateLimitResult.limit.toString(),
              'X-RateLimit-Remaining': rateLimitResult.remaining.toString(),
              'X-RateLimit-Reset': rateLimitResult.resetTime.toISOString(),
              'X-RateLimit-Window': rateLimitResult.windowType,
              'Retry-After': Math.ceil((rateLimitResult.resetTime.getTime() - Date.now()) / 1000).toString()
            },
            jsonBody: { 
              error: 'Rate limit exceeded', 
              resetTime: rateLimitResult.resetTime.toISOString(),
              requestId,
              code: 'RATE_LIMIT_EXCEEDED'
            }
          })
        };
      }

      // Store rate limit headers for later use
      context.extraOutputs.set('rateLimitHeaders', {
        'X-RateLimit-Limit': rateLimitResult.limit.toString(),
        'X-RateLimit-Remaining': rateLimitResult.remaining.toString(),
        'X-RateLimit-Reset': rateLimitResult.resetTime.toISOString(),
        'X-RateLimit-Window': rateLimitResult.windowType
      });
    }

    const authTime = Date.now() - startTime;
    logger.info('Authentication successful', {
      requestId,
      keyId: apiKey.key_id,
      lawFirm: apiKey.law_firm,
      scopes: apiKey.scopes,
      clientIP,
      authTime,
      path: request.url
    });

    return { 
      success: true, 
      data: {
        request,
        auth: {
          apiKey,
          lawFirm: apiKey.law_firm,
          keyId: apiKey.key_id,
          scopes: apiKey.scopes
        },
        requestId
      }
    };

  } catch (error) {
    const authTime = Date.now() - startTime;
    logger.error('Authentication middleware error', { 
      requestId, 
      error: error instanceof Error ? error.message : String(error),
      authTime 
    });

    return {
      success: false,
      response: new HttpResponse({
        status: 500,
        jsonBody: { 
          error: 'Internal authentication error', 
          requestId,
          code: 'AUTH_SYSTEM_ERROR'
        }
      })
    };
  }
}

/**
 * Helper function to add rate limit headers to response
 */
export function addRateLimitHeaders(response: HttpResponse, context: InvocationContext): HttpResponse {
  const rateLimitHeaders = context.extraOutputs.get('rateLimitHeaders');
  
  if (rateLimitHeaders) {
    const headers = { ...response.headers };
    Object.assign(headers, rateLimitHeaders);
    
    return new HttpResponse({
      status: response.status,
      headers,
      jsonBody: response.jsonBody,
      body: response.body
    });
  }

  return response;
}

/**
 * Convenience wrapper for common authentication patterns
 */
export async function requireAuth(
  request: HttpRequest, 
  context: InvocationContext, 
  scopes: string[]
): Promise<{ success: true; auth: AuthContext; requestId: string } | { success: false; response: HttpResponse }> {
  const authResult = await authMiddleware(request, context, { requiredScopes: scopes });
  
  if (!authResult.success) {
    return { success: false, response: authResult.response };
  }

  return { 
    success: true, 
    auth: authResult.data.auth, 
    requestId: authResult.data.requestId 
  };
}

/**
 * Middleware for admin-only endpoints
 */
export async function requireAdminAuth(
  request: HttpRequest, 
  context: InvocationContext
): Promise<{ success: true; auth: AuthContext; requestId: string } | { success: false; response: HttpResponse }> {
  return requireAuth(request, context, ['demographics:admin']);
}

/**
 * Middleware for read operations
 */
export async function requireReadAuth(
  request: HttpRequest, 
  context: InvocationContext
): Promise<{ success: true; auth: AuthContext; requestId: string } | { success: false; response: HttpResponse }> {
  return requireAuth(request, context, ['demographics:read']);
}

/**
 * Middleware for write operations
 */
export async function requireWriteAuth(
  request: HttpRequest, 
  context: InvocationContext
): Promise<{ success: true; auth: AuthContext; requestId: string } | { success: false; response: HttpResponse }> {
  return requireAuth(request, context, ['demographics:write']);
}

/**
 * Extract user context from an authenticated request
 * Useful for getting auth info after middleware has run
 */
export function getAuthContext(request: any): AuthContext | null {
  // This is a helper if you need to access auth context later
  // In practice, you'll get it directly from the middleware return value
  return null;
}