import { z } from 'zod';

export const ApiKeySchema = z.object({
  id: z.string().uuid(),
  partitionKey: z.string(), // law_firm for partitioning
  key_id: z.string(), // Public identifier (first 8 chars of key)
  key_hash: z.string(), // Hashed full key for security
  name: z.string().max(100),
  description: z.string().max(500).optional(),
  
  // Owner information
  law_firm: z.string().max(75),
  created_by: z.string().uuid(),
  
  // Rate limiting configuration
  rate_limits: z.object({
    requests_per_minute: z.number().int().min(1).max(10000).default(60),
    requests_per_hour: z.number().int().min(1).max(100000).default(3600),
    requests_per_day: z.number().int().min(1).max(1000000).default(86400),
    burst_limit: z.number().int().min(1).max(1000).default(100), // Max requests in 10 seconds
  }).default({}),
  
  // Permissions and scopes
  scopes: z.array(z.enum([
    'demographics:read',
    'demographics:write', 
    'demographics:delete',
    'demographics:admin',
    'webhooks:manage',
    'files:upload'
  ])),
  
  // API key metadata
  status: z.enum(['active', 'suspended', 'revoked']).default('active'),
  last_used_at: z.string().datetime().optional(),
  last_used_ip: z.string().optional(),
  usage_count: z.number().int().default(0),
  
  // Expiration and security
  expires_at: z.string().datetime().optional(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
  
  // Optional environment restrictions
  allowed_ips: z.array(z.string()).optional(),
  allowed_domains: z.array(z.string()).optional(),
  environment: z.enum(['development', 'staging', 'production']).optional(),
});

export type ApiKey = z.infer<typeof ApiKeySchema>;

export const CreateApiKeyRequestSchema = z.object({
  name: z.string().min(3).max(100),
  description: z.string().max(500).optional(),
  scopes: z.array(z.enum([
    'demographics:read',
    'demographics:write', 
    'demographics:delete',
    'demographics:admin',
    'webhooks:manage',
    'files:upload'
  ])).min(1),
  rate_limits: z.object({
    requests_per_minute: z.number().int().min(1).max(1000).default(60),
    requests_per_hour: z.number().int().min(1).max(10000).default(3600), 
    requests_per_day: z.number().int().min(1).max(100000).default(86400),
    burst_limit: z.number().int().min(1).max(500).default(100),
  }).optional(),
  expires_in_days: z.number().int().min(1).max(3650).optional(), // Max 10 years
  allowed_ips: z.array(z.string().ip()).optional(),
  allowed_domains: z.array(z.string()).optional(),
  environment: z.enum(['development', 'staging', 'production']).optional(),
});

// Rate Limit Response
export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetTime: Date;
  limit: number;
  windowType: 'minute' | 'hour' | 'day' | 'burst';
}

export type CreateApiKeyRequest = z.infer<typeof CreateApiKeyRequestSchema>;