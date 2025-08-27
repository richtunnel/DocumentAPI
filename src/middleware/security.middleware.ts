import { Request, Response, NextFunction } from 'express';
import { authMiddleware } from './auth.middleware';

export function securityMiddleware(req: Request, res: Response, next: NextFunction) {
  // Remove sensitive headers
  res.removeHeader('X-Powered-By');
  res.removeHeader('Server');
  
  // Add security headers
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'X-XSS-Protection': '1; mode=block',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Strict-Transport-Security': 'max-age=31536000; includeSubDomains'
  });

  next();
}

// Helper function to require authentication
export const requireAuth = (scopes: string[] = []) => authMiddleware({ requiredScopes: scopes });

// Helper function to require admin authentication
export const requireAdmin = () => authMiddleware({ requiredScopes: ['demographics:admin'] });

// Helper function to allow anonymous access
export const allowAnonymous = () => authMiddleware({ allowAnonymous: true });