import { Router, Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import {
  CreateDemographicsRequestSchema,
  Demographics,
  GetDemographicsQuerySchema,
  GetDemographicsQuery,
  BatchSubmitSchema,
} from '../shared/types/demographics';
import { databaseService } from '../shared/database/database.service';
import { fifoQueueService } from '../shared/services/fifoQueue.service';
import { logger } from '../shared/services/logger.service';
import { authMiddleware } from '../middleware/auth.middleware';
import { validationMiddleware } from '../middleware/validation.middleware';
import { idempotencyMiddleware } from '../middleware/idempotency.middleware';
import { AuthenticatedRequest } from '../shared/types/express-extensions';

const router = Router();

/**
 * POST /api/v1/demographics
 * Submit single demographics record
 */
router.post(
  '/',
  authMiddleware({ requiredScopes: ['demographics:write'] }),
  idempotencyMiddleware(24),
  validationMiddleware(CreateDemographicsRequestSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const startTime = Date.now();

    // Type guard for req.auth
    if (!req.auth) {
      logger.error('Authentication required', { requestId: req.requestId });
      res.status(401).json({
        error: 'Authentication required',
        code: 'AUTHENTICATION_REQUIRED',
        requestId: req.requestId,
      });
      return;
    }

    const authReq = req as AuthenticatedRequest;

    try {
      logger.info('Demographics submission started', {
        requestId: req.requestId,
        lawFirm: authReq.auth.lawFirm,
        keyId: authReq.auth.keyId,
      });

      const demographicsData = req.body;
      const now = new Date().toISOString();

      const demographics: Demographics = {
        id: uuidv4(),
        partitionKey: authReq.auth.lawFirm,
        ...demographicsData,
        created_at: now,
        updated_at: now,
        created_by: authReq.auth.apiKey.created_by,
      };

      await databaseService.createDemographic(demographics);

      await fifoQueueService.addDemographicsMessage(authReq.auth.lawFirm, {
        id: demographics.id,
        action: 'process',
        data: demographics,
      }, 5);

      await fifoQueueService.addWebhookMessage(authReq.auth.lawFirm, {
        event: 'demographics.created',
        data: {
          id: demographics.id,
          sf_id: demographics.sf_id,
          law_firm: demographics.law_firm,
          created_at: demographics.created_at,
        },
        metadata: {
          apiKeyId: authReq.auth.keyId,
          requestId: req.requestId,
        },
      });

      const processingTime = Date.now() - startTime;
      logger.info('Demographics submission completed', {
        requestId: req.requestId,
        demographicsId: demographics.id,
        lawFirm: demographics.law_firm,
        processingTime,
      });

      res.status(201).json({
        success: true,
        message: 'Demographics submitted successfully',
        data: {
          id: demographics.id,
          sf_id: demographics.sf_id,
          status: 'accepted',
          created_at: demographics.created_at,
        },
        requestId: req.requestId,
        processingTime,
      });
    } catch (error) {
      const processingTime = Date.now() - startTime;
      logger.error('Error submitting demographics', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        requestId: req.requestId,
        processingTime,
      });
      next(error);
    }
  },
);

/**
 * POST /api/v1/demographics/batch
 * Submit multiple demographics records
 */
router.post(
  '/batch',
  authMiddleware({ requiredScopes: ['demographics:write'] }),
  idempotencyMiddleware(48),
  validationMiddleware(BatchSubmitSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const startTime = Date.now();

    // Type guard for req.auth
    if (!req.auth) {
      logger.error('Authentication required', { requestId: req.requestId });
      res.status(401).json({
        error: 'Authentication required',
        code: 'AUTHENTICATION_REQUIRED',
        requestId: req.requestId,
      });
      return;
    }

    const authReq = req as AuthenticatedRequest;
    const { demographics, webhook_url, webhook_events, batch_options } = req.body;

    try {
      logger.info('Batch demographics submission started', {
        requestId: req.requestId,
        lawFirm: authReq.auth.lawFirm,
        batchSize: demographics.length,
      });

      const results: Array<{
        index: number;
        id?: string;
        sf_id?: string;
        status: 'accepted' | 'failed';
        created_at?: string;
        error?: string;
      }> = [];
      const now = new Date().toISOString();
      const correlationId = uuidv4();

      for (let i = 0; i < demographics.length; i++) {
        const demographicsData = demographics[i];

        try {
          const demographic: Demographics = {
            id: uuidv4(),
            partitionKey: authReq.auth.lawFirm,
            ...demographicsData,
            created_at: now,
            updated_at: now,
            created_by: authReq.auth.apiKey.created_by,
          };

          await databaseService.createDemographic(demographic);

          await fifoQueueService.addDemographicsMessage(
            authReq.auth.lawFirm,
            {
              id: demographic.id,
              action: 'process',
              data: demographic,
              batch_info: {
                correlation_id: correlationId,
                batch_size: demographics.length,
                batch_index: i,
              },
            },
            batch_options?.priority ?? 5,
          );

          results.push({
            index: i,
            id: demographic.id,
            sf_id: demographic.sf_id,
            status: 'accepted',
            created_at: demographic.created_at,
          });
        } catch (itemError) {
          logger.error('Error processing batch item', {
            error: itemError instanceof Error ? itemError.message : String(itemError),
            stack: itemError instanceof Error ? itemError.stack : undefined,
            index: i,
            requestId: req.requestId,
          });

          results.push({
            index: i,
            status: 'failed',
            error: itemError instanceof Error ? itemError.message : 'Processing failed',
          });
        }
      }

      if (webhook_url && batch_options?.notify_on_completion) {
        await fifoQueueService.addWebhookMessage(authReq.auth.lawFirm, {
          event: 'demographics.batch_completed',
          data: {
            correlation_id: correlationId,
            batch_size: demographics.length,
            successful_count: results.filter(r => r.status === 'accepted').length,
            failed_count: results.filter(r => r.status === 'failed').length,
            webhook_url,
          },
          metadata: {
            apiKeyId: authReq.auth.keyId,
            requestId: req.requestId,
          },
        });
      }

      const successCount = results.filter(r => r.status === 'accepted').length;
      const processingTime = Date.now() - startTime;

      logger.info('Batch demographics submission completed', {
        requestId: req.requestId,
        correlationId,
        batchSize: demographics.length,
        successCount,
        processingTime,
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
          processing_time: processingTime,
        },
        requestId: req.requestId,
      });
    } catch (error) {
      const processingTime = Date.now() - startTime;
      logger.error('Error in batch submission', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        requestId: req.requestId,
        processingTime,
      });
      next(error);
    }
  },
);

/**
 * GET /api/v1/demographics
 * Retrieve demographics with filtering and pagination
 */
router.get(
  '/',
  authMiddleware({ requiredScopes: ['demographics:read'] }),
  validationMiddleware(GetDemographicsQuerySchema, 'query'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const startTime = Date.now();

    // Type guard for req.auth
    if (!req.auth) {
      logger.error('Authentication required', { requestId: req.requestId });
      res.status(401).json({
        error: 'Authentication required',
        code: 'AUTHENTICATION_REQUIRED',
        requestId: req.requestId,
      });
      return;
    }

    const authReq = req as AuthenticatedRequest;

    try {
      // Use GetDemographicsQuery type for validated query parameters
      const { limit, offset, filter_claimanttype, filter_status, search } = req.query as GetDemographicsQuery;

      logger.info('Demographics retrieval started', {
        requestId: req.requestId,
        lawFirm: authReq.auth.lawFirm,
        filters: { limit, offset, filter_claimanttype, filter_status, search },
      });

      const demographics = await databaseService.getDemographicsByLawFirm(
        authReq.auth.lawFirm,
        limit ?? 50,
        offset ?? 0,
        {
          claimanttype: filter_claimanttype,
          status: filter_status,
          search,
        },
      );

      const processingTime = Date.now() - startTime;

      res.status(200).json({
        success: true,
        data: demographics,
        pagination: {
          limit: limit ?? 50,
          offset: offset ?? 0,
          count: demographics.length,
          has_more: demographics.length === (limit ?? 50),
        },
        requestId: req.requestId,
        processingTime,
      });
    } catch (error) {
      const processingTime = Date.now() - startTime;
      logger.error('Error retrieving demographics', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        requestId: req.requestId,
        processingTime,
      });
      next(error);
    }
  },
);

/**
 * GET /api/v1/demographics/:id
 * Get specific demographics record by ID
 */
router.get(
  '/:id',
  authMiddleware({ requiredScopes: ['demographics:read'] }),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const startTime = Date.now();

    // Type guard for req.auth
    if (!req.auth) {
      logger.error('Authentication required', { requestId: req.requestId });
      res.status(401).json({
        error: 'Authentication required',
        code: 'AUTHENTICATION_REQUIRED',
        requestId: req.requestId,
      });
      return;
    }

    const authReq = req as AuthenticatedRequest;

    try {
      const { id } = req.params;
      const demographic = await databaseService.getDemographicById(id, authReq.auth.lawFirm);

      if (!demographic) {
        res.status(404).json({
          success: false,
          error: 'Demographic record not found',
          code: 'DEMOGRAPHIC_NOT_FOUND',
          requestId: req.requestId,
        });
        return;
      }

      const processingTime = Date.now() - startTime;

      res.status(200).json({
        success: true,
        data: demographic,
        requestId: req.requestId,
        processingTime,
      });
    } catch (error) {
      const processingTime = Date.now() - startTime;
      logger.error('Error getting demographic by ID', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        requestId: req.requestId,
        processingTime,
      });
      next(error);
    }
  },
);

export default router;