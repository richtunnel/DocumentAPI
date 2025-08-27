import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { CreateDemographicsRequestSchema, Demographics } from '../shared/types/demographics';
import { databaseService } from '../shared/database/database.service';
import { fifoQueueService } from '../shared/services/fifoQueue.service';
import { logger } from '../shared/services/logger.service';
import { isAuthenticated } from '../middleware/auth.middleware';
import { requireAuth } from '../middleware/security.middleware';
import { validationMiddleware } from '../middleware/validation.middleware';
import { idempotencyMiddleware } from '../middleware/idempotency.middleware';
import { AuthenticatedRequest } from '../shared/types/auth';
import { z } from 'zod';

const router = Router();

// Validation schemas (same as before)
const GetDemographicsQuerySchema = z.object({
  limit: z.string().transform(val => Math.min(parseInt(val) || 50, 100)).optional(),
  offset: z.string().transform(val => parseInt(val) || 0).optional(),
  filter_claimanttype: z.string().optional(),
  filter_status: z.string().optional(),
  search: z.string().optional(),
});

/**
 * POST /api/v1/demographics
 * Submit single demographics record
 */
router.post('/',
  requireAuth(['demographics:write']),
  idempotencyMiddleware(24),
  validationMiddleware(CreateDemographicsRequestSchema),
  async (req: AuthenticatedRequest, res: any) => {
    const startTime = Date.now();
    
    // Type guard to ensure authentication
    if (!isAuthenticated(req)) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    try {
      logger.info('Demographics submission started', {
        requestId: req.requestId,
        lawFirm: req.auth.lawFirm,
        keyId: req.auth.keyId
      });

      const demographicsData = req.body;
      const now = new Date().toISOString();

      // Create demographics record
      const demographics: Demographics = {
        id: uuidv4(),
        partitionKey: req.auth.lawFirm,
        ...demographicsData,
        created_at: now,
        updated_at: now,
        created_by: req.auth.apiKey.created_by,
      };

      // Save to database
      await databaseService.createDemographic(demographics);

      // Add to FIFO processing queue
      await fifoQueueService.addDemographicsMessage(
        req.auth.lawFirm,
        {
          id: demographics.id,
          action: 'process',
          data: demographics
        },
        5
      );

      // Add webhook notification to queue
      await fifoQueueService.addWebhookMessage(
        req.auth.lawFirm,
        {
          event: 'demographics.created',
          data: {
            id: demographics.id,
            sf_id: demographics.sf_id,
            law_firm: demographics.law_firm,
            created_at: demographics.created_at,
          },
          metadata: {
            apiKeyId: req.auth.keyId,
            requestId: req.requestId,
          }
        }
      );

      const processingTime = Date.now() - startTime;
      logger.info('Demographics submission completed', {
        requestId: req.requestId,
        demographicsId: demographics.id,
        lawFirm: demographics.law_firm,
        processingTime
      });

      res.status(201).json({
        success: true,
        message: 'Demographics submitted successfully',
        data: {
          id: demographics.id,
          sf_id: demographics.sf_id,
          status: 'accepted',
          created_at: demographics.created_at
        },
        requestId: req.requestId,
        processingTime
      });

    } catch (error) {
      const processingTime = Date.now() - startTime;
      logger.error('Error submitting demographics', {
        error: error instanceof Error ? error.message : String(error),
        requestId: req.requestId,
        processingTime
      });

      res.status(500).json({
        success: false,
        error: 'Failed to submit demographics',
        code: 'SUBMISSION_ERROR',
        requestId: req.requestId,
        processingTime
      });
    }
  }
);

/**
 * GET /api/v1/demographics
 * Retrieve demographics with filtering and pagination
 */
router.get('/',
  requireAuth(['demographics:read']),
  validationMiddleware(GetDemographicsQuerySchema, 'query'),
  async (req: Request, res: Response) => {
    const startTime = Date.now();
    
    if (!isAuthenticated(req)) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    try {
      const { limit = 50, offset = 0, filter_claimanttype, filter_status, search } = req.query as any;

      logger.info('Demographics retrieval started', {
        requestId: req.requestId,
        lawFirm: req.auth.lawFirm,
        filters: { limit, offset, filter_claimanttype, filter_status, search }
      });

      const demographics = await databaseService.getDemographicsByLawFirm(
        req.auth.lawFirm,
        limit,
        offset,
        {
          claimanttype: filter_claimanttype,
          status: filter_status,
          search
        }
      );

      const processingTime = Date.now() - startTime;
      
      res.status(200).json({
        success: true,
        data: demographics,
        pagination: {
          limit,
          offset,
          count: demographics.length,
          has_more: demographics.length === limit
        },
        requestId: req.requestId,
        processingTime
      });

    } catch (error) {
      const processingTime = Date.now() - startTime;
      logger.error('Error retrieving demographics', {
        error: error instanceof Error ? error.message : String(error),
        requestId: req.requestId,
        processingTime
      });

      res.status(500).json({
        success: false,
        error: 'Failed to retrieve demographics',
        code: 'RETRIEVAL_ERROR',
        requestId: req.requestId,
        processingTime
      });
    }
  }
);

/**
 * GET /api/v1/demographics/:id
 * Get specific demographics record by ID
 */
router.get('/:id',
  requireAuth(['demographics:read']),
  async (req: Request, res: Response) => {
    const startTime = Date.now();
    
    if (!isAuthenticated(req)) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    try {
      const { id } = req.params;
      const demographic = await databaseService.getDemographicById(id, req.auth.lawFirm);

      if (!demographic) {
        return res.status(404).json({
          success: false,
          error: 'Demographic record not found',
          code: 'DEMOGRAPHIC_NOT_FOUND',
          requestId: req.requestId
        });
      }

      const processingTime = Date.now() - startTime;

      res.status(200).json({
        success: true,
        data: demographic,
        requestId: req.requestId,
        processingTime
      });

    } catch (error) {
      const processingTime = Date.now() - startTime;
      logger.error('Error getting demographic by ID', {
        error: error instanceof Error ? error.message : String(error),
        requestId: req.requestId,
        processingTime
      });

      res.status(500).json({
        success: false,
        error: 'Failed to retrieve demographic',
        code: 'RETRIEVAL_ERROR',
        requestId: req.requestId,
        processingTime
      });
    }
  }
);

export default router;