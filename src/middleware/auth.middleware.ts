import { Request, Response, NextFunction } from 'express';
import { apiKeyService } from '../shared/services/apiKey.service';
import { rateLimiter } from '../shared/services/rateLimiter.service';
import { logger } from '../shared/services/logger.service';

// TypeScript interfaces that don't conflict with Azure Functions
export interface AuthContext {
  apiKey: any;
  lawFirm: string;
  keyId: string;
  scopes: string[];
}

export interface AuthenticatedRequest extends Request {
  auth: {
    apiKey: any;
    lawFirm: string;
    keyId: string;
    scopes: string[];
  };
  requestId: string;
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

// Type guard to check if request is authenticated
export function isAuthenticated(req: Request): req is Request & { auth: NonNullable<Request['auth']> } {
  return !!req.auth;
}
export function authMiddleware(options: AuthMiddlewareOptions = {}) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const startTime = Date.now();
    const requestId = req.headers['x-correlation-id'] as string || require('uuid').v4();
 
    try {
      // Add request ID to request object
      (req as AuthenticatedRequest).requestId = requestId;

      // Skip auth for anonymous endpoints
      if (options.allowAnonymous) {
        return next();
      }

      // Get client IP
      const clientIP = req.ip || req.connection.remoteAddress || 'unknown';

      // Validate API key
      const apiKeyHeader = req.headers['x-api-key'] as string;
      if (!apiKeyHeader) {
        logger.warn('Missing API key', { requestId, clientIP, path: req.path });
        return res.status(401).json({
          error: 'API key required',
          code: 'MISSING_API_KEY',
          requestId
        });
      }

      // #edit later
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
          path: req.path
        });

        return res.status(401).json({
          error: error || 'Invalid API key',
          code: 'INVALID_API_KEY',
          requestId
        });
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

          // Add rate limit headers
          res.set({
            'X-RateLimit-Limit': rateLimitResult.limit.toString(),
            'X-RateLimit-Remaining': rateLimitResult.remaining.toString(),
            'X-RateLimit-Reset': rateLimitResult.resetTime.toISOString(),
            'X-RateLimit-Window': rateLimitResult.windowType,
            'Retry-After': Math.ceil((rateLimitResult.resetTime.getTime() - Date.now()) / 1000).toString()
          });

          return res.status(429).json({
            error: 'Rate limit exceeded',
            code: 'RATE_LIMIT_EXCEEDED',
            resetTime: rateLimitResult.resetTime.toISOString(),
            requestId
          });
        }

        // Add rate limit headers to successful requests
        res.set({
          'X-RateLimit-Limit': rateLimitResult.limit.toString(),
          'X-RateLimit-Remaining': rateLimitResult.remaining.toString(),
          'X-RateLimit-Reset': rateLimitResult.resetTime.toISOString(),
          'X-RateLimit-Window': rateLimitResult.windowType
        });
      }

      // Add auth context to request
      (req as AuthenticatedRequest).auth = {
        apiKey,
        lawFirm: apiKey.law_firm,
        keyId: apiKey.key_id,
        scopes: apiKey.scopes
      };

      const authTime = Date.now() - startTime;
      logger.info('Authentication successful', {
        requestId,
        keyId: apiKey.key_id,
        lawFirm: apiKey.law_firm,
        scopes: apiKey.scopes,
        clientIP,
        authTime,
        path: req.path
      });

      next();

    } catch (error) {
      const authTime = Date.now() - startTime;
      logger.error('Authentication middleware error', {
        requestId,
        error: error instanceof Error ? error.message : String(error),
        authTime
      });

      return res.status(500).json({
        error: 'Internal authentication error',
        code: 'AUTH_SYSTEM_ERROR',
        requestId
      });
    }
  };
}



