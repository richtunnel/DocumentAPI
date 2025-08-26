import { HttpRequest } from "@azure/functions";

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

