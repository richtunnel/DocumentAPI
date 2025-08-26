import { app, InvocationContext } from '@azure/functions';
import { fifoQueueService } from '../../shared/services/fifoQueue.service';
import { blobSasService } from '../../shared/services/blobSas.service';
import { logger } from '../monitor/winstonLogger';

async function processUploadedDocument(blob: unknown, context: InvocationContext): Promise<void> {
  const startTime = Date.now();
  const documentId = context.invocationId;

  try {
    // Extract blob information from trigger metadata
    const blobName = context.triggerMetadata?.name as string;
    const blobUri = context.triggerMetadata?.uri as string;
    const containerName = 'demographics-documents';

    logger.info('Document uploaded - blob trigger activated', {
      documentId,
      blobName,
      blobUri,
      blobSize: context.triggerMetadata?.length
    });

    // Validate the uploaded document
    const validation = await blobSasService.validateUploadedDocument(blobName, 50); // 50MB limit

    if (!validation.isValid) {
      logger.error('Document validation failed', {
        documentId,
        blobName,
        error: validation.error,
        fileSize: validation.fileSize
      });

      // Queue for error handling/notification
      await fifoQueueService.addWebhookMessage('system', {
        event: 'document.validation_failed',
        blobName,
        error: validation.error,
        fileSize: validation.fileSize,
        timestamp: new Date().toISOString()
      });

      return;
    }

    // Extract metadata from blob name (lawfirm/date/correlationId_filename)
    const pathParts = blobName.split('/');
    const lawFirm = pathParts[0]?.replace(/_/g, ' ');
    const fileName = pathParts[pathParts.length - 1];
    const correlationId = fileName?.split('_')[0];

    // Queue document processing (non-FIFO, high throughput)
    await fifoQueueService.addDocumentMessage({
      blobName,
      blobUri,
      containerName,
      lawFirm,
      correlationId,
      fileName,
      fileSize: validation.fileSize,
      contentType: context.triggerMetadata?.contentType,
      uploadedAt: new Date().toISOString()
    });

    // Queue webhook notification (FIFO per law firm)
    await fifoQueueService.addWebhookMessage(lawFirm, {
      event: 'document.uploaded',
      data: {
        blobName,
        correlationId,
        lawFirm,
        fileName,
        fileSize: validation.fileSize,
        status: 'uploaded',
        uploadedAt: new Date().toISOString()
      }
    });

    const processingTime = Date.now() - startTime;
    
    logger.info('Document processed successfully by blob trigger', {
      documentId,
      blobName,
      correlationId,
      lawFirm,
      fileSize: validation.fileSize,
      processingTime
    });

  } catch (error) {
    const processingTime = Date.now() - startTime;
    logger.error('Error in blob trigger processing', {
      documentId,
      error,
      processingTime,
      blobName: context.triggerMetadata?.name
    });

    // Don't throw error to prevent infinite retries
    // Log error and potentially send to dead letter queue
  }
}

// Register blob trigger
app.storageBlob('processUploadedDocument', {
  path: 'demographics-documents/{name}',
  connection: 'BLOB_STORAGE_CONNECTION_STRING',
  handler: processUploadedDocument
});

export { processUploadedDocument };