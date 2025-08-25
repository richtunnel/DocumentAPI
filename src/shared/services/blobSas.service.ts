// src/shared/services/blobSas.service.ts
import { BlobServiceClient, BlobSASPermissions, generateBlobSASQueryParameters, StorageSharedKeyCredential } from '@azure/storage-blob';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../../azure-functions/monitor/winstonLogger';

interface SasUrlResponse {
  uploadUrl: string;
  blobName: string;
  expiresAt: Date;
  containerName: string;
  correlationId: string;
}

interface DocumentUploadRequest {
  fileName: string;
  contentType: string;
  lawFirm: string;
  demographicsId?: string;
  documentType?: string;
  maxFileSizeMB?: number;
}

class BlobSasService {
  private blobServiceClient: BlobServiceClient;
  private storageAccount: string;
  private storageKey: string;
  private documentsContainer = 'demographics-documents';

  constructor() {
    const connectionString = process.env.BLOB_STORAGE_CONNECTION_STRING!;
    this.blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
    
    // Extract account name and key from connection string for SAS generation
    const matches = connectionString.match(/AccountName=([^;]+).*AccountKey=([^;]+)/);
    if (!matches) {
      throw new Error('Invalid blob storage connection string');
    }
    this.storageAccount = matches[1];
    this.storageKey = matches[2];
  }

  /**
   * Generate SAS URL for direct client upload to blob storage
   */
  async generateUploadSasUrl(request: DocumentUploadRequest): Promise<SasUrlResponse> {
    try {
      const correlationId = uuidv4();
      const sanitizedFileName = this.sanitizeFileName(request.fileName);
      const blobName = this.generateBlobName(request.lawFirm, sanitizedFileName, correlationId);
      
      // Create container client
      const containerClient = this.blobServiceClient.getContainerClient(this.documentsContainer);
      await containerClient.createIfNotExists();

      // Set expiration time (24 hours from now)
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + 24);

      // Create SAS token
      const blobSasPermissions = new BlobSASPermissions();
      blobSasPermissions.write = true;
      blobSasPermissions.create = true;

      const sharedKeyCredential = new StorageSharedKeyCredential(
        this.storageAccount,
        this.storageKey
      );

      const sasToken = generateBlobSASQueryParameters({
        containerName: this.documentsContainer,
        blobName: blobName,
        permissions: blobSasPermissions,
        expiresOn: expiresAt,
        contentType: request.contentType,
      }, sharedKeyCredential);

      const uploadUrl = `https://${this.storageAccount}.blob.core.windows.net/${this.documentsContainer}/${blobName}?${sasToken}`;

      // Store metadata for blob trigger processing
      await this.storeUploadMetadata(correlationId, {
        lawFirm: request.lawFirm,
        demographicsId: request.demographicsId,
        documentType: request.documentType,
        originalFileName: request.fileName,
        contentType: request.contentType,
        blobName,
        uploadUrl,
        expiresAt: expiresAt.toISOString(),
        status: 'pending_upload'
      });

      logger.info('SAS URL generated for document upload', {
        correlationId,
        lawFirm: request.lawFirm,
        fileName: sanitizedFileName,
        blobName,
        expiresAt
      });

      return {
        uploadUrl,
        blobName,
        expiresAt,
        containerName: this.documentsContainer,
        correlationId
      };

    } catch (error) {
      logger.error('Error generating SAS URL', { error, request });
      throw error;
    }
  }

  /**
   * Validate uploaded document
   */
  async validateUploadedDocument(blobName: string, maxSizeMB: number = 10): Promise<{
    isValid: boolean;
    fileSize?: number;
    error?: string;
  }> {
    try {
      const blobClient = this.blobServiceClient
        .getContainerClient(this.documentsContainer)
        .getBlobClient(blobName);

      const properties = await blobClient.getProperties();
      const fileSizeMB = (properties.contentLength || 0) / (1024 * 1024);

      if (fileSizeMB > maxSizeMB) {
        return {
          isValid: false,
          fileSize: fileSizeMB,
          error: `File size ${fileSizeMB.toFixed(2)}MB exceeds limit of ${maxSizeMB}MB`
        };
      }

      // Additional validations can be added here
      // - Virus scanning
      // - Content type verification
      // - File format validation

      return {
        isValid: true,
        fileSize: fileSizeMB
      };

    } catch (error) {
      logger.error('Error validating uploaded document', { error, blobName });
      return {
        isValid: false,
        error: error instanceof Error ? error.message : 'Validation failed'
      };
    }
  }

  /**
   * Get download URL with limited-time access
   */
  async generateDownloadSasUrl(blobName: string, validForHours: number = 1): Promise<string> {
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + validForHours);

    const blobSasPermissions = new BlobSASPermissions();
    blobSasPermissions.read = true;

    const sharedKeyCredential = new StorageSharedKeyCredential(
      this.storageAccount,
      this.storageKey
    );

    const sasToken = generateBlobSASQueryParameters({
      containerName: this.documentsContainer,
      blobName: blobName,
      permissions: blobSasPermissions,
      expiresOn: expiresAt,
    }, sharedKeyCredential);

    return `https://${this.storageAccount}.blob.core.windows.net/${this.documentsContainer}/${blobName}?${sasToken}`;
  }

  private sanitizeFileName(fileName: string): string {
    // Remove special characters and spaces
    return fileName
      .replace(/[^a-zA-Z0-9.-]/g, '_')
      .replace(/_{2,}/g, '_')
      .toLowerCase();
  }

  private generateBlobName(lawFirm: string, fileName: string, correlationId: string): string {
    const timestamp = new Date().toISOString().split('T')[0];
    const sanitizedLawFirm = lawFirm.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
    return `${sanitizedLawFirm}/${timestamp}/${correlationId}_${fileName}`;
  }

  private async storeUploadMetadata(correlationId: string, metadata: any): Promise<void> {
    // Store in database or cache for blob trigger processing
    // This metadata will be used by the blob trigger to process the uploaded file
    
    // You can implement this using your database service
    // await databaseService.storeUploadMetadata(correlationId, metadata);
    
    // For now, log the metadata (implement proper storage)
    logger.info('Upload metadata stored', { correlationId, metadata });
  }
}

export const blobSasService = new BlobSasService();