import { Request } from 'express';
import { Demographics } from './demographics';

declare global {
  namespace Express {
    interface Request {
     requestId: string;
      rawBody?: string;
      auth: {
        apiKey: ApiKey;
        lawFirm: string;
        keyId: string;
        scopes: string[];
    
      }
  }
}
}

// Define the validated query type
export type GetDemographicsQuery = {
  limit?: number;
  offset?: number;
  filter_claimanttype?: string;
  filter_status?: string;
  search?: string;
};

export interface ApiKey {
  id: string;
  partitionKey: string;
  key_id: string;
  key_hash: string;
  name: string;
  description?: string;
  law_firm: string;
  created_by: string;
  rate_limits: {
    requests_per_minute: number;
    requests_per_hour: number;
    requests_per_day: number;
    burst_limit: number;
  };
  scopes: string[];
 status: 'active' | 'suspended' | 'revoked';
  usage_count: number;
  expires_at?: string;
  created_at: string;
  updated_at: string;
  allowed_ips?: string[];
  allowed_domains?: string[];
  environment?: string;
}

// Export the extended type for explicit use where authentication is guaranteed
export interface AuthenticatedRequest extends Request {
  auth: {
    apiKey: ApiKey; 
    lawFirm: string;
    keyId: string;
    scopes: string[];
  };
}

export interface AuthMiddlewareOptions {
  requiredScopes?: string[];
  skipRateLimit?: boolean;
  allowAnonymous?: boolean;
}


export interface FifoQueueMessage {
  id: string;
  action: 'process';
  data: Demographics | { id: string; sf_id?: string; law_firm: string; created_at: string; webhook_url?: string; correlation_id?: string };
  event?: string; // For webhooks
  batch_info?: {
    correlation_id: string;
    batch_size: number;
    batch_index: number;
  };
  metadata?: {
    apiKeyId: string;
    requestId: string;
  };
}