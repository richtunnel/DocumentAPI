import { IdempotencyService } from '../shared/services/idempotency.service';
import { Request, Response, NextFunction } from 'express';
import { logger } from '../shared/services/logger.service';
import { AuthenticatedRequest } from '../shared/types/express-extensions';

const idempotencyService = new IdempotencyService();

export function idempotencyMiddleware(ttlHours: number = 24) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    // Only apply to POST/PUT/PATCH requests
    if (!['POST', 'PUT', 'PATCH'].includes(req.method)) {
      return next();
    }

    const idempotencyKey = req.headers['x-idempotency-key'] as string;
    
    if (!idempotencyKey) {
      return next(); // Idempotency is optional
    }

    // Validate UUID format
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(idempotencyKey)) {
      res.status(400).json({
        error: 'Invalid idempotency key format. Must be a valid UUID.',
        code: 'INVALID_IDEMPOTENCY_KEY'
      });
      return;
    }

    // Check if the request has auth context (should be guaranteed by middleware order)
    if (!req.auth) {
      res.status(401).json({
        error: 'Authentication required for idempotency',
        code: 'AUTHENTICATION_REQUIRED'
      });
      return;
    }

    // Now we can safely cast to AuthenticatedRequest
    const authReq = req as AuthenticatedRequest;

    try {
      const { exists, response: cachedResponse } = await idempotencyService.checkIdempotency(
        authReq.auth.lawFirm,
        idempotencyKey,
        authReq.method,
        authReq.path,
        authReq.body
      );

      if (exists && cachedResponse) {
        logger.info('Returning cached idempotent response', {
          idempotencyKey,
          lawFirm: authReq.auth.lawFirm,
          method: authReq.method,
          path: authReq.path
        });

        res.status(cachedResponse.status).json(cachedResponse.body);
        return;
      }

      // Store original res.json method
      const originalJson = res.json.bind(res);
      
      // Override res.json to capture response for idempotency
      res.json = function(body: any) {
        // Store idempotent response asynchronously (don't block response)
        setImmediate(async () => {
          try {
            await idempotencyService.storeIdempotencyRecord(
              authReq.auth.lawFirm,
              idempotencyKey,
              authReq.method,
              authReq.path,
              authReq.body,
              res.statusCode,
              body,
              ttlHours
            );
          } catch (storeError) {
            logger.error('Failed to store idempotency record', {
              error: storeError,
              idempotencyKey,
              lawFirm: authReq.auth.lawFirm
            });
          }
        });

        // Call original json method
        return originalJson(body);
      };

      next();

    } catch (error) {
      logger.error('Idempotency middleware error', {
        error,
        idempotencyKey,
        lawFirm: authReq.auth?.lawFirm
      });

      // Continue without idempotency on error
      next();
    }
  };
}