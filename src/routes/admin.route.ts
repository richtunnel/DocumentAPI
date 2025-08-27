import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { CreateApiKeyRequestSchema } from '../shared/types/apiKey';
import { apiKeyService } from '../shared/services/apiKey.service';
import { logger } from '../shared/services/logger.service';
import { AuthenticatedRequest } from '../middleware/auth.middleware';
import { requireAdmin } from '../middleware/security.middleware';
import { validationMiddleware } from '../middleware/validation.middleware';
import { z } from 'zod';

const adminRouter = Router();

// Extended schema for development
const DevCreateApiKeySchema = CreateApiKeyRequestSchema.extend({
  law_firm: z.string().min(3).max(75),
  created_by_email: z.string().email(),
});

/**
 * POST /api/v1/admin/api-keys
 * Create new API key
 */
adminRouter.post('/api-keys',
  process.env.NODE_ENV === 'production' 
    ? requireAdmin() 
    : validationMiddleware(DevCreateApiKeySchema),
  validationMiddleware(
    process.env.NODE_ENV === 'production' 
      ? CreateApiKeyRequestSchema 
      : DevCreateApiKeySchema
  ),
  async (req: AuthenticatedRequest, res: Response) => {
    const startTime = Date.now();
    
    try {
      logger.info('API key creation started', { 
        requestId: req.requestId,
        environment: process.env.NODE_ENV 
      });

      let lawFirm: string;
      let createdBy: string;

      if (process.env.NODE_ENV === 'production') {
        // Production: use authenticated context
        lawFirm = req.auth.lawFirm;
        createdBy = req.auth.apiKey.created_by;
      } else {
        // Development: get from request body
        lawFirm = req.body.law_firm;
        createdBy = uuidv4();
      }

      const createRequest = req.body;
      const { apiKey, plainTextKey } = await apiKeyService.createApiKey(
        createRequest,
        lawFirm,
        createdBy
      );

      const processingTime = Date.now() - startTime;
      logger.info('API key created successfully', {
        requestId: req.requestId,
        keyId: apiKey.key_id,
        lawFirm: apiKey.law_firm,
        scopes: apiKey.scopes,
        processingTime
      });

      res.status(201).json({
        success: true,
        message: 'API key created successfully',
        data: {
          apiKey: {
            id: apiKey.id,
            key_id: apiKey.key_id,
            name: apiKey.name,
            description: apiKey.description,
            scopes: apiKey.scopes,
            rate_limits: apiKey.rate_limits,
            expires_at: apiKey.expires_at,
            created_at: apiKey.created_at,
            law_firm: apiKey.law_firm,
          },
          key: plainTextKey,
        },
        warning: 'Store this API key securely. It will not be shown again.',
        requestId: req.requestId,
        processingTime
      });

    } catch (error) {
      const processingTime = Date.now() - startTime;
      logger.error('Error creating API key', {
        error: error instanceof Error ? error.message : String(error),
        requestId: req.requestId,
        processingTime
      });

      res.status(500).json({
        success: false,
        error: 'Failed to create API key',
        code: 'API_KEY_CREATION_ERROR',
        requestId: req.requestId,
        processingTime
      });
    }
  }
);

export default adminRouter;
