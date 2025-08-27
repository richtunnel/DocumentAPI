import { BlobServiceClient, BlobSASPermissions, generateBlobSASQueryParameters, StorageSharedKeyCredential } from '@azure/storage-blob';
import { v4 as uuidv4 } from 'uuid';
import { logger } from './logger.service';

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

interface DocumentStatus {
  status: 'pending' | 'uploaded' | 'processing' | 'completed' | 'failed';
  uploaded_at?: string;
  processed_at?: string;
  file_size?: number;
  error?: string;
}

class BlobSasService {
  private blobServiceClient: BlobServiceClient;
  private storageAccount: string;
  private storageKey: string;
  private documentsContainer = 'demographics-documents';
  private documentStatusCache = new Map<string, DocumentStatus>();

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

      // Store initial status
      this.documentStatusCache.set(correlationId, {
        status: 'pending',
      });

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

  async getDocumentStatus(correlationId: string): Promise<DocumentStatus> {
    try {
      // Check cache first
      if (this.documentStatusCache.has(correlationId)) {
        return this.documentStatusCache.get(correlationId)!;
      }

      // TODO: Check database for persistent status
      // For now, return default status
      return {
        status: 'pending',
      };

    } catch (error) {
      logger.error('Error getting document status', { error, correlationId });
      throw error;
    }
  }

  async updateDocumentStatus(correlationId: string, status: DocumentStatus): Promise<void> {
    try {
      // Update cache
      this.documentStatusCache.set(correlationId, status);

      // TODO: Update database for persistent storage
      logger.info('Document status updated', {
        correlationId,
        status: status.status
      });

    } catch (error) {
      logger.error('Error updating document status', { error, correlationId });
      throw error;
    }
  }

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
    // Store in cache temporarily
    logger.info('Upload metadata stored', { correlationId, metadata });
    
    // TODO: Implement persistent storage in database
    // await databaseService.storeUploadMetadata(correlationId, metadata);
  }
}

export const blobSasService = new BlobSasService();