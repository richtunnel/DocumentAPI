import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { CreateDemographicsRequestSchema, Demographics } from '../shared/types/demographics';
import { databaseService } from '../shared/database/database.service';
import { fifoQueueService } from '../shared/services/fifoQueue.service';
import { logger } from '../shared/services/logger.service';
import { AuthenticatedRequest, requireAuth } from '../middleware/auth.middleware';
import { validationMiddleware } from '../middleware/validation.middleware';
import { idempotencyMiddleware } from '../middleware/idempotency.middleware';
import { z } from 'zod';

const router = Router();

// Validation schemas
export const GetDemographicsQuerySchema = z.object({
  limit: z.string().transform(val => Math.min(parseInt(val) || 50, 100)).optional(),
  offset: z.string().transform(val => parseInt(val) || 0).optional(),
  filter_claimanttype: z.string().optional(),
  filter_status: z.string().optional(),
  search: z.string().optional(),
});

const BatchSubmitSchema = z.object({
  demographics: z.array(CreateDemographicsRequestSchema).min(1).max(100),
  webhook_url: z.string().url().optional(),
  webhook_events: z.array(z.enum(['created', 'updated', 'processed', 'failed'])).optional(),
  batch_options: z.object({
    priority: z.number().min(1).max(10).default(5),
    process_immediately: z.boolean().default(false),
    notify_on_completion: z.boolean().default(true)
  }).optional()
});

/**
 * POST /api/v1/demographics
 * Submit single demographics record
 */
router.post('/',
  requireAuth(['demographics:write']),
  idempotencyMiddleware(24),
  validationMiddleware(CreateDemographicsRequestSchema),
  async (req: AuthenticatedRequest, res: Response) => {
    const startTime = Date.now();
    
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
        5 // normal priority
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
 * POST /api/v1/demographics/batch
 * Submit multiple demographics records
 */
router.post('/batch',
  requireAuth(['demographics:write']),
  idempotencyMiddleware(48), // Longer TTL for batch operations
  validationMiddleware(BatchSubmitSchema),
  async (req: AuthenticatedRequest, res: Response) => {
    const startTime = Date.now();
    const { demographics, webhook_url, webhook_events, batch_options } = req.body;
    
    try {
      logger.info('Batch demographics submission started', {
        requestId: req.requestId,
        lawFirm: req.auth.lawFirm,
        batchSize: demographics.length
      });

      const results = [];
      const now = new Date().toISOString();
      const correlationId = uuidv4();

      // Process each demographic in the batch
      for (let i = 0; i < demographics.length; i++) {
        const demographicsData = demographics[i];
        
        try {
          const demographic: Demographics = {
            id: uuidv4(),
            partitionKey: req.auth.lawFirm,
            ...demographicsData,
            created_at: now,
            updated_at: now,
            created_by: req.auth.apiKey.created_by,
          };

          // Save to database
          await databaseService.createDemographic(demographic);

          // Add to processing queue with batch correlation ID
          await fifoQueueService.addDemographicsMessage(
            req.auth.lawFirm,
            {
              id: demographic.id,
              action: 'process',
              data: demographic,
              batch_info: {
                correlation_id: correlationId,
                batch_size: demographics.length,
                batch_index: i
              }
            },
            batch_options?.priority || 5
          );

          results.push({
            index: i,
            id: demographic.id,
            sf_id: demographic.sf_id,
            status: 'accepted',
            created_at: demographic.created_at
          });

        } catch (itemError) {
          logger.error('Error processing batch item', {
            error: itemError,
            index: i,
            requestId: req.requestId
          });

          results.push({
            index: i,
            status: 'failed',
            error: itemError instanceof Error ? itemError.message : 'Processing failed'
          });
        }
      }

      // Add batch completion webhook if configured
      if (webhook_url && batch_options?.notify_on_completion) {
        await fifoQueueService.addWebhookMessage(
          req.auth.lawFirm,
          {
            event: 'demographics.batch_completed',
            data: {
              correlation_id: correlationId,
              batch_size: demographics.length,
              successful_count: results.filter(r => r.status === 'accepted').length,
              failed_count: results.filter(r => r.status === 'failed').length,
              webhook_url
            },
            metadata: {
              apiKeyId: req.auth.keyId,
              requestId: req.requestId,
            }
          }
        );
      }

      const successCount = results.filter(r => r.status === 'accepted').length;
      const processingTime = Date.now() - startTime;

      logger.info('Batch demographics submission completed', {
        requestId: req.requestId,
        correlationId,
        batchSize: demographics.length,
        successCount,
        processingTime
      });

      res.status(202).json({
        success: true,
        message: `Accepted ${successCount} of ${demographics.length} records for processing`,
        data: results,
        metadata: {
          correlation_id: correlationId,
          batch_size: demographics.length,
          successful_count: successCount,
          failed_count: demographics.length - successCount,
          processing_time: processingTime
        },
        requestId: req.requestId
      });

    } catch (error) {
      const processingTime = Date.now() - startTime;
      logger.error('Error in batch submission', {
        error: error instanceof Error ? error.message : String(error),
        requestId: req.requestId,
        processingTime
      });

      res.status(500).json({
        success: false,
        error: 'Batch submission failed',
        code: 'BATCH_SUBMISSION_ERROR',
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
  async (req: AuthenticatedRequest, res: Response) => {
    const startTime = Date.now();
    
    try {
      const { limit = 50, offset = 0, filter_claimanttype, filter_status, search } = req.query as any;

      logger.info('Demographics retrieval started', {
        requestId: req.requestId,
        lawFirm: req.auth.lawFirm,
        filters: { limit, offset, filter_claimanttype, filter_status, search }
      });

      // Get demographics with filters (implement filtering in database service)
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
      logger.info('Demographics retrieval completed', {
        requestId: req.requestId,
        count: demographics.length,
        lawFirm: req.auth.lawFirm,
        processingTime
      });

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
  async (req: AuthenticatedRequest, res: Response) => {
    const startTime = Date.now();
    
    try {
      const { id } = req.params;

      logger.info('Get demographic by ID started', {
        requestId: req.requestId,
        demographicId: id,
        lawFirm: req.auth.lawFirm
      });

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
      logger.info('Get demographic by ID completed', {
        requestId: req.requestId,
        demographicId: id,
        lawFirm: req.auth.lawFirm,
        processingTime
      });

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

/**
 * PUT /api/v1/demographics/:id
 * Update existing demographics record
 */
router.put('/:id',
  requireAuth(['demographics:write']),
  idempotencyMiddleware(24),
  validationMiddleware(CreateDemographicsRequestSchema),
  async (req: AuthenticatedRequest, res: Response) => {
    const startTime = Date.now();
    
    try {
      const { id } = req.params;
      const updateData = req.body;

      logger.info('Demographics update started', {
        requestId: req.requestId,
        demographicId: id,
        lawFirm: req.auth.lawFirm
      });

      // Check if record exists
      const existing = await databaseService.getDemographicById(id, req.auth.lawFirm);
      if (!existing) {
        return res.status(404).json({
          success: false,
          error: 'Demographic record not found',
          code: 'DEMOGRAPHIC_NOT_FOUND',
          requestId: req.requestId
        });
      }

      // Update record
      const updatedDemographic = {
        ...existing,
        ...updateData,
        updated_at: new Date().toISOString()
      };

      await databaseService.updateDemographic(id, updatedDemographic);

      // Add to processing queue
      await fifoQueueService.addDemographicsMessage(
        req.auth.lawFirm,
        {
          id: id,
          action: 'update',
          data: updatedDemographic
        },
        5
      );

      // Add webhook notification
      await fifoQueueService.addWebhookMessage(
        req.auth.lawFirm,
        {
          event: 'demographics.updated',
          data: {
            id: id,
            sf_id: updatedDemographic.sf_id,
            law_firm: updatedDemographic.law_firm,
            updated_at: updatedDemographic.updated_at,
          },
          metadata: {
            apiKeyId: req.auth.keyId,
            requestId: req.requestId,
          }
        }
      );

      const processingTime = Date.now() - startTime;
      logger.info('Demographics update completed', {
        requestId: req.requestId,
        demographicId: id,
        lawFirm: req.auth.lawFirm,
        processingTime
      });

      res.status(200).json({
        success: true,
        message: 'Demographics updated successfully',
        data: {
          id: id,
          sf_id: updatedDemographic.sf_id,
          status: 'updated',
          updated_at: updatedDemographic.updated_at
        },
        requestId: req.requestId,
        processingTime
      });

    } catch (error) {
      const processingTime = Date.now() - startTime;
      logger.error('Error updating demographics', {
        error: error instanceof Error ? error.message : String(error),
        requestId: req.requestId,
        processingTime
      });

      res.status(500).json({
        success: false,
        error: 'Failed to update demographics',
        code: 'UPDATE_ERROR',
        requestId: req.requestId,
        processingTime
      });
    }
  }
);

/**
 * DELETE /api/v1/demographics/:id
 * Soft delete demographics record
 */
router.delete('/:id',
  requireAuth(['demographics:delete']),
  async (req: AuthenticatedRequest, res: Response) => {
    const startTime = Date.now();
    
    try {
      const { id } = req.params;

      logger.info('Demographics deletion started', {
        requestId: req.requestId,
        demographicId: id,
        lawFirm: req.auth.lawFirm
      });

      // Check if record exists
      const existing = await databaseService.getDemographicById(id, req.auth.lawFirm);
      if (!existing) {
        return res.status(404).json({
          success: false,
          error: 'Demographic record not found',
          code: 'DEMOGRAPHIC_NOT_FOUND',
          requestId: req.requestId
        });
      }

      // Soft delete (update status to 'deleted')
      await databaseService.softDeleteDemographic(id, req.auth.lawFirm);

      const processingTime = Date.now() - startTime;
      logger.info('Demographics deletion completed', {
        requestId: req.requestId,
        demographicId: id,
        lawFirm: req.auth.lawFirm,
        processingTime
      });

      res.status(200).json({
        success: true,
        message: 'Demographics record deleted successfully',
        data: {
          id: id,
          status: 'deleted',
          deleted_at: new Date().toISOString()
        },
        requestId: req.requestId,
        processingTime
      });

    } catch (error) {
      const processingTime = Date.now() - startTime;
      logger.error('Error deleting demographics', {
        error: error instanceof Error ? error.message : String(error),
        requestId: req.requestId,
        processingTime
      });

      res.status(500).json({
        success: false,
        error: 'Failed to delete demographics',
        code: 'DELETION_ERROR',
        requestId: req.requestId,
        processingTime
      });
    }
  }
);

export default router;