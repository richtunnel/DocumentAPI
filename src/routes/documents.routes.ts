import { Router, Request, Response } from 'express';
import { blobSasService } from '../shared/services/blobSas.service';
import { logger } from '../shared/services/logger.service';
import { AuthenticatedRequest } from '../middleware/auth.middleware';
import { requireAuth } from '../middleware/security.middleware';
import { validationMiddleware } from '../middleware/validation.middleware';
import { z } from 'zod';


const router = Router();

const GenerateUploadUrlSchema = z.object({
  fileName: z.string().min(1).max(255),
  contentType: z.string().min(1),
  documentType: z.enum(['demographics_form', 'supporting_doc', 'legal_doc', 'medical_record', 'other']).optional(),
  demographicsId: z.string().uuid().optional(),
  maxFileSizeMB: z.number().min(0.1).max(100).default(10)
});

const BatchUploadSchema = z.object({
  documents: z.array(z.object({
    fileName: z.string().min(1).max(255),
    contentType: z.string().min(1),
    documentType: z.enum(['demographics_form', 'supporting_doc', 'legal_doc', 'medical_record', 'other']).optional(),
    demographicsId: z.string().uuid().optional(),
  })).min(1).max(50),
  maxFileSizeMB: z.number().min(0.1).max(100).default(10)
});

/**
 * POST /api/v1/documents/upload-url
 * Generate SAS URL for single document upload
 */
router.post('/upload-url',
  requireAuth(['files:upload', 'demographics:write']),
  validationMiddleware(GenerateUploadUrlSchema),
  async (req: AuthenticatedRequest, res: Response) => {
    const startTime = Date.now();
    
    try {
      logger.info('Generate upload URL started', {
        requestId: req.requestId,
        lawFirm: req.auth.lawFirm,
        keyId: req.auth.keyId
      });

      const uploadRequest = req.body;

      // Generate SAS URL for direct upload
      const sasResponse = await blobSasService.generateUploadSasUrl({
        fileName: uploadRequest.fileName,
        contentType: uploadRequest.contentType,
        lawFirm: req.auth.lawFirm,
        demographicsId: uploadRequest.demographicsId,
        documentType: uploadRequest.documentType,
        maxFileSizeMB: uploadRequest.maxFileSizeMB
      });

      const processingTime = Date.now() - startTime;
      
      logger.info('Upload URL generated successfully', {
        requestId: req.requestId,
        lawFirm: req.auth.lawFirm,
        fileName: uploadRequest.fileName,
        correlationId: sasResponse.correlationId,
        processingTime
      });

      res.status(200).json({
        success: true,
        message: 'Upload URL generated successfully',
        data: {
          uploadUrl: sasResponse.uploadUrl,
          blobName: sasResponse.blobName,
          correlationId: sasResponse.correlationId,
          expiresAt: sasResponse.expiresAt.toISOString(),
          maxFileSizeMB: uploadRequest.maxFileSizeMB
        },
        instructions: {
          method: 'PUT',
          headers: {
            'x-ms-blob-type': 'BlockBlob',
            'Content-Type': uploadRequest.contentType
          },
          note: 'Upload file directly to uploadUrl using PUT method'
        },
        requestId: req.requestId,
        processingTime
      });

    } catch (error) {
      const processingTime = Date.now() - startTime;
      logger.error('Error generating upload URL', {
        error: error instanceof Error ? error.message : String(error),
        requestId: req.requestId,
        processingTime
      });

      res.status(500).json({
        success: false,
        error: 'Failed to generate upload URL',
        code: 'UPLOAD_URL_ERROR',
        requestId: req.requestId,
        processingTime
      });
    }
  }
);

/**
 * POST /api/v1/documents/batch-upload-urls
 * Generate multiple SAS URLs for batch document upload
 */
router.post('/batch-upload-urls',
  requireAuth(['files:upload', 'demographics:write']),
  validationMiddleware(BatchUploadSchema),
  async (req: AuthenticatedRequest, res: Response) => {
    const startTime = Date.now();
    
    try {
      const { documents, maxFileSizeMB } = req.body;
      const correlationId = require('uuid').v4();
      
      logger.info('Batch upload URLs generation started', {
        requestId: req.requestId,
        lawFirm: req.auth.lawFirm,
        documentCount: documents.length,
        correlationId
      });

      const uploadUrls = [];
      const errors = [];

      // Generate SAS URLs for each document
      for (let i = 0; i < documents.length; i++) {
        const document = documents[i];
        
        try {
          const sasResponse = await blobSasService.generateUploadSasUrl({
            fileName: document.fileName,
            contentType: document.contentType,
            lawFirm: req.auth.lawFirm,
            demographicsId: document.demographicsId,
            documentType: document.documentType,
            maxFileSizeMB
          });

          uploadUrls.push({
            index: i,
            fileName: document.fileName,
            uploadUrl: sasResponse.uploadUrl,
            blobName: sasResponse.blobName,
            correlationId: sasResponse.correlationId,
            expiresAt: sasResponse.expiresAt.toISOString(),
            status: 'ready'
          });

        } catch (docError) {
          logger.error('Error generating upload URL for document', {
            error: docError,
            index: i,
            fileName: document.fileName,
            requestId: req.requestId
          });

          errors.push({
            index: i,
            fileName: document.fileName,
            error: docError instanceof Error ? docError.message : 'URL generation failed',
            status: 'failed'
          });
        }
      }

      const processingTime = Date.now() - startTime;
      const successCount = uploadUrls.length;

      logger.info('Batch upload URLs generated', {
        requestId: req.requestId,
        correlationId,
        successCount,
        errorCount: errors.length,
        processingTime
      });

      res.status(200).json({
        success: true,
        message: `Generated ${successCount} upload URLs out of ${documents.length} requested`,
        data: {
          upload_urls: uploadUrls,
          errors: errors,
          batch_correlation_id: correlationId,
          success_count: successCount,
          error_count: errors.length,
          total_count: documents.length
        },
        instructions: {
          method: 'PUT',
          note: 'Upload each file to its respective uploadUrl using PUT method with appropriate Content-Type header'
        },
        requestId: req.requestId,
        processingTime
      });

    } catch (error) {
      const processingTime = Date.now() - startTime;
      logger.error('Error in batch upload URL generation', {
        error: error instanceof Error ? error.message : String(error),
        requestId: req.requestId,
        processingTime
      });

      res.status(500).json({
        success: false,
        error: 'Failed to generate batch upload URLs',
        code: 'BATCH_UPLOAD_ERROR',
        requestId: req.requestId,
        processingTime
      });
    }
  }
);

/**
 * GET /api/v1/documents/:correlationId/status
 * Get document processing status by correlation ID
 */
router.get('/:correlationId/status',
  requireAuth(['demographics:read']),
  async (req: AuthenticatedRequest, res: Response) => {
    const startTime = Date.now();
    
    try {
      const { correlationId } = req.params;

      logger.info('Document status check started', {
        requestId: req.requestId,
        correlationId,
        lawFirm: req.auth.lawFirm
      });

      // Check document processing status (implement in service)
      const status = await blobSasService.getDocumentStatus(correlationId);

      const processingTime = Date.now() - startTime;

      res.status(200).json({
        success: true,
        data: {
          correlation_id: correlationId,
          ...status
        },
        requestId: req.requestId,
        processingTime
      });

    } catch (error) {
      const processingTime = Date.now() - startTime;
      logger.error('Error checking document status', {
        error: error instanceof Error ? error.message : String(error),
        requestId: req.requestId,
        processingTime
      });

      res.status(500).json({
        success: false,
        error: 'Failed to check document status',
        code: 'STATUS_CHECK_ERROR',
        requestId: req.requestId,
        processingTime
      });
    }
  }
);

export default router;