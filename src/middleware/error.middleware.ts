import { Request, Response, NextFunction } from 'express';
import { logger } from '../shared/services/logger.service';


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


export function errorMiddleware(error: any, req: Request, res: Response, next: NextFunction) {
  const requestId = (req as AuthenticatedRequest).requestId || 'unknown';
  
  logger.error('Unhandled error in request', {
    error: error.message,
    stack: error.stack,
    requestId,
    path: req.path,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('user-agent')
  });

  // Don't leak error details in production
  const isDevelopment = process.env.NODE_ENV === 'development';
  
  if (error.statusCode || error.status) {
    return res.status(error.statusCode || error.status).json({
      error: error.message || 'An error occurred',
      code: error.code || 'UNKNOWN_ERROR',
      requestId,
      ...(isDevelopment && { stack: error.stack })
    });
  }

  // Database errors
  if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
    return res.status(503).json({
      error: 'Service temporarily unavailable',
      code: 'SERVICE_UNAVAILABLE',
      requestId
    });
  }

  // Validation errors
  if (error.name === 'ValidationError') {
    return res.status(400).json({
      error: 'Validation failed',
      code: 'VALIDATION_ERROR',
      details: error.details || error.message,
      requestId
    });
  }

  // Default server error
  res.status(500).json({
    error: isDevelopment ? error.message : 'Internal server error',
    code: 'INTERNAL_ERROR',
    requestId,
    ...(isDevelopment && { stack: error.stack })
  });
}
