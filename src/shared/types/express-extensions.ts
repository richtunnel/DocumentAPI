import { Request } from 'express';

declare global {
  namespace Express {
    interface Request {
      auth?: {
        apiKey: any;
        lawFirm: string;
        keyId: string;
        scopes: string[];
      };
      requestId: string;
      rawBody?: string;
    }
  }
}

// Export the extended type for explicit use where needed
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
