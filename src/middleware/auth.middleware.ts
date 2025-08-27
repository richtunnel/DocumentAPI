import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { apiKeyService } from '../shared/services/apiKey.service';
import { rateLimiter } from '../shared/services/rateLimiter.service';
import { logger } from '../shared/services/logger.service';
import { AuthenticatedRequest, ApiKey, AuthMiddlewareOptions } from '../shared/types/express-extensions';

export interface AuthContext {
  apiKey: ApiKey; 
  lawFirm: string;
  keyId: string;
  scopes: string[];
}

export function authMiddleware(options: AuthMiddlewareOptions = {}) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const startTime = Date.now();
    const requestId = (req.headers['x-correlation-id'] as string) || uuidv4();
    req.requestId = requestId;

    try {
      // Handle anonymous access
      if (options.allowAnonymous && !req.headers['x-api-key']) {
        logger.info('Allowing anonymous access', { requestId, path: req.path });
        return next(); // req.auth remains undefined
      }

      const clientIP = req.ip || req.connection.remoteAddress || 'unknown';
      const apiKeyHeader = req.headers['x-api-key'] as string;

      if (!apiKeyHeader) {
        logger.warn('Missing API key', { requestId, clientIP, path: req.path });
        res.status(401).json({
          error: 'API key required',
          code: 'MISSING_API_KEY',
          requestId,
        });
        return;
      }

      const { apiKey, isValid, error } = await apiKeyService.validateApiKey(
        apiKeyHeader,
        clientIP,
        options.requiredScopes || [],
      );

      if (!isValid) {
        logger.warn('Invalid API key', {
          requestId,
          clientIP,
          keyId: apiKeyHeader.substring(0, 11),
          error,
          path: req.path,
        });
        res.status(401).json({
          error: error || 'Invalid API key',
          code: 'INVALID_API_KEY',
          requestId,
        });
        return;
      }

      if (!options.skipRateLimit) {
        const rateLimitResult = await rateLimiter.checkRateLimit(apiKey, clientIP);
        if (!rateLimitResult.allowed) {
          logger.warn('Rate limit exceeded', {
            requestId,
            keyId: apiKey.key_id,
            clientIP,
            limit: rateLimitResult.limit,
            windowType: rateLimitResult.windowType,
          });

          res.set({
            'X-RateLimit-Limit': rateLimitResult.limit.toString(),
            'X-RateLimit-Remaining': rateLimitResult.remaining.toString(),
            'X-RateLimit-Reset': rateLimitResult.resetTime.toISOString(),
            'X-RateLimit-Window': rateLimitResult.windowType,
            'Retry-After': Math.ceil((rateLimitResult.resetTime.getTime() - Date.now()) / 1000).toString(),
          });

          res.status(429).json({
            error: 'Rate limit exceeded',
            code: 'RATE_LIMIT_EXCEEDED',
            resetTime: rateLimitResult.resetTime.toISOString(),
            requestId,
          });
          return;
        }

        res.set({
          'X-RateLimit-Limit': rateLimitResult.limit.toString(),
          'X-RateLimit-Remaining': rateLimitResult.remaining.toString(),
          'X-RateLimit-Reset': rateLimitResult.resetTime.toISOString(),
          'X-RateLimit-Window': rateLimitResult.windowType,
        });
      }

      // Set auth for authenticated requests
      (req as AuthenticatedRequest).auth = {
        apiKey: apiKey as ApiKey,
        lawFirm: apiKey.law_firm,
        keyId: apiKey.key_id,
        scopes: apiKey.scopes,
      };

      const authTime = Date.now() - startTime;
      logger.info('Authentication successful', {
        requestId,
        keyId: apiKey.key_id,
        lawFirm: apiKey.law_firm,
        scopes: apiKey.scopes,
        clientIP,
        authTime,
        path: req.path,
      });

      next();
    } catch (error) {
      const authTime = Date.now() - startTime;
      logger.error('Authentication middleware error', {
        requestId,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        authTime,
      });

      res.status(500).json({
        error: 'Internal authentication error',
        code: 'AUTH_SYSTEM_ERROR',
        requestId,
      });
    }
  };
}