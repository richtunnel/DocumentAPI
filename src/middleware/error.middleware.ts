import { Request, Response, NextFunction } from 'express';
import { logger } from '../shared/services/logger.service';
import { AuthenticatedRequest } from '../shared/types/express-extensions';

export function errorMiddleware(error: any, req: Request, res: Response, next: NextFunction): void {
  const requestId = req.requestId || 'unknown';

  logger.error('Unhandled error in request', {
    error: error.message || String(error),
    stack: error.stack,
    requestId,
    path: req.path,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('user-agent'),
    lawFirm: (req as AuthenticatedRequest).auth?.lawFirm,
  });

  const isDevelopment = process.env.NODE_ENV === 'development';

  // Handle specific error types
  if (error.statusCode || error.status) {
    res.status(error.statusCode || error.status).json({
      error: error.message || 'An error occurred',
      code: error.code || 'UNKNOWN_ERROR',
      requestId,
      ...(isDevelopment && { stack: error.stack }),
    });
    return;
  }

  // Database errors
  if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
    res.status(503).json({
      error: 'Service temporarily unavailable',
      code: 'SERVICE_UNAVAILABLE',
      requestId,
    });
    return;
  }

  // Validation errors
  if (error.name === 'ValidationError') {
    res.status(400).json({
      error: 'Validation failed',
      code: 'VALIDATION_ERROR',
      details: error.details || error.message,
      requestId,
    });
    return;
  }

  // Default server error
  res.status(500).json({
    error: isDevelopment ? error.message || String(error) : 'Internal server error',
    code: 'INTERNAL_ERROR',
    requestId,
    ...(isDevelopment && { stack: error.stack }),
  });
}