import { Request, Response, NextFunction } from 'express';
import { logger } from '../shared/services/logger.service';

export function loggingMiddleware(req: Request, res: Response, next: NextFunction) {
  const startTime = Date.now();
  const requestId = req.headers['x-correlation-id'] as string || require('uuid').v4();
  
  // Add request ID
  req.requestId = requestId;
  
  // Add request ID to response headers
  res.set('X-Correlation-ID', requestId);
  
  // Log request
  logger.info('Incoming request', {
    requestId,
    method: req.method,
    path: req.path,
    query: req.query,
    ip: req.ip,
    userAgent: req.get('user-agent'),
    contentLength: req.get('content-length'),
    timestamp: new Date().toISOString()
  });

  // Capture response
  const originalSend = res.send.bind(res);
  res.send = function(body: any) {
    const processingTime = Date.now() - startTime;
    
    // Add processing time header
    res.set('X-Processing-Time', `${processingTime}ms`);
    
    logger.info('Request completed', {
      requestId,
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      processingTime,
      contentLength: body?.length || 0,
      timestamp: new Date().toISOString()
    });

    return originalSend(body);
  };

  next();
}