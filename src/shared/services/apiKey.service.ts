import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { ApiKey, CreateApiKeyRequest } from '../types/apiKey';
import { databaseService } from '../database/database';
import winston from 'winston';

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console()
  ]
});

class ApiKeyService {
  private readonly encryptionKey: string;

  constructor() {
    this.encryptionKey = process.env.API_KEY_ENCRYPTION_KEY!;
    if (!this.encryptionKey || this.encryptionKey.length < 32) {
      throw new Error('API_KEY_ENCRYPTION_KEY must be at least 32 characters');
    }
  }

  generateApiKey(): string {
    // Generate a secure random API key
    const prefix = 'ak_'; // API key prefix for easy identification
    const randomBytes = crypto.randomBytes(32).toString('hex');
    return `${prefix}${randomBytes}`;
  }

  async hashApiKey(apiKey: string): Promise<string> {
    const saltRounds = 12;
    return bcrypt.hash(apiKey, saltRounds);
  }

  async verifyApiKey(apiKey: string, hashedKey: string): Promise<boolean> {
    return bcrypt.compare(apiKey, hashedKey);
  }

  extractKeyId(apiKey: string): string {
    // First 8 characters after prefix for public identification
    return apiKey.substring(0, 11); // 'ak_' + first 8 chars
  }

  async createApiKey(
    request: CreateApiKeyRequest,
    lawFirm: string,
    createdBy: string
  ): Promise<{ apiKey: ApiKey; plainTextKey: string }> {
    const now = new Date().toISOString();
    const id = uuidv4();
    const plainTextKey = this.generateApiKey();
    const keyHash = await this.hashApiKey(plainTextKey);
    const keyId = this.extractKeyId(plainTextKey);

    // Calculate expiration date
    let expiresAt: string | undefined;
    if (request.expires_in_days) {
      const expiration = new Date();
      expiration.setDate(expiration.getDate() + request.expires_in_days);
      expiresAt = expiration.toISOString();
    }

    // Set default rate limits if not provided
    const rateLimits = request.rate_limits || {
      requests_per_minute: 60,
      requests_per_hour: 3600,
      requests_per_day: 86400,
      burst_limit: 100,
    };

    const apiKey: ApiKey = {
      id,
      partitionKey: lawFirm,
      key_id: keyId,
      key_hash: keyHash,
      name: request.name,
      description: request.description,
      law_firm: lawFirm,
      created_by: createdBy,
      rate_limits: rateLimits,
      scopes: request.scopes,
      status: 'active',
      usage_count: 0,
      expires_at: expiresAt,
      created_at: now,
      updated_at: now,
      allowed_ips: request.allowed_ips,
      allowed_domains: request.allowed_domains,
      environment: request.environment,
    };

    await databaseService.createApiKey(apiKey);

    logger.info('API key created', {
      keyId,
      lawFirm,
      name: request.name,
      scopes: request.scopes,
    });

    return { apiKey, plainTextKey };
  }

  async validateApiKey(
    apiKeyHeader: string,
    ipAddress: string,
    requiredScopes: string[] = []
  ): Promise<{ apiKey: ApiKey; isValid: boolean; error?: string }> {
    try {
      if (!apiKeyHeader || !apiKeyHeader.startsWith('ak_')) {
        return { apiKey: null as any, isValid: false, error: 'Invalid API key format' };
      }

      // Hash the provided key to compare with stored hash
      const keyHash = await this.hashApiKey(apiKeyHeader);
      const apiKey = await databaseService.getApiKeyByHash(keyHash);

      if (!apiKey) {
        return { apiKey: null as any, isValid: false, error: 'API key not found' };
      }

      // Verify the key matches
      const isValidKey = await this.verifyApiKey(apiKeyHeader, apiKey.key_hash);
      if (!isValidKey) {
        return { apiKey, isValid: false, error: 'Invalid API key' };
      }

      // Check if key is active
      if (apiKey.status !== 'active') {
        return { apiKey, isValid: false, error: `API key is ${apiKey.status}` };
      }

      // Check expiration
      if (apiKey.expires_at && new Date(apiKey.expires_at) < new Date()) {
        return { apiKey, isValid: false, error: 'API key has expired' };
      }

      // Check IP restrictions
      if (apiKey.allowed_ips && apiKey.allowed_ips.length > 0) {
        if (!apiKey.allowed_ips.includes(ipAddress)) {
          return { apiKey, isValid: false, error: 'IP address not allowed' };
        }
      }

      // Check required scopes
      if (requiredScopes.length > 0) {
        const hasRequiredScopes = requiredScopes.every(scope => 
          apiKey.scopes.includes(scope as any)
        );
        if (!hasRequiredScopes) {
          return { apiKey, isValid: false, error: 'Insufficient permissions' };
        }
      }

      // Update usage tracking
      await databaseService.updateApiKeyUsage(apiKey.id, ipAddress);

      return { apiKey, isValid: true };
    } catch (error) {
      logger.error('Error validating API key', { error, ipAddress });
      return { apiKey: null as any, isValid: false, error: 'Internal error' };
    }
  }
}

export const apiKeyService = new ApiKeyService();