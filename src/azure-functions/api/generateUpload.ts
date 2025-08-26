import { app, HttpRequest, HttpResponse, InvocationContext } from '@azure/functions';
import { blobSasService } from '../../shared/services/blobSas.service';
import { authMiddleware, addRateLimitHeaders } from '../../shared/middleware/auth.middleware';
import { z } from 'zod';
import { logger } from '../monitor/winstonLogger';

const GenerateUploadUrlSchema = z.object({
  fileName: z.string().min(1).max(255),
  contentType: z.string().min(1),
  documentType: z.enum(['demographics_form', 'supporting_doc', 'legal_doc', 'medical_record', 'other']).optional(),
  demographicsId: z.string().uuid().optional(),
  maxFileSizeMB: z.number().min(0.1).max(100).default(10)
});

async function generateUploadUrl(request: HttpRequest, context: InvocationContext): Promise<HttpResponse> {
  const startTime = Date.now();

  try {
    // Use authMiddleware for authentication and rate limiting
    const authResult = await authMiddleware(request, context, {
      requiredScopes: ['files:upload', 'demographics:write']
    });

    if (!authResult.success) {
      return authResult.response;
    }

    const { auth, requestId } = authResult.data;

    logger.info('Generate upload URL started', { 
      requestId,
      lawFirm: auth.lawFirm,
      keyId: auth.keyId 
    });

    // Parse and validate request
    const body = await request.json();
    const validation = GenerateUploadUrlSchema.safeParse(body);
    
    if (!validation.success) {
      return addRateLimitHeaders(new HttpResponse({
        status: 400,
        jsonBody: { 
          error: 'Validation failed', 
          details: validation.error.issues,
          requestId 
        }
      }), context);
    }

    const uploadRequest = validation.data;

    // Generate SAS URL for direct upload
    const sasResponse = await blobSasService.generateUploadSasUrl({
      fileName: uploadRequest.fileName,
      contentType: uploadRequest.contentType,
      lawFirm: auth.lawFirm,
      demographicsId: uploadRequest.demographicsId,
      documentType: uploadRequest.documentType,
      maxFileSizeMB: uploadRequest.maxFileSizeMB
    });

    const processingTime = Date.now() - startTime;
    
    logger.info('Upload URL generated successfully', {
      requestId,
      lawFirm: auth.lawFirm,
      fileName: uploadRequest.fileName,
      correlationId: sasResponse.correlationId,
      processingTime
    });

    return addRateLimitHeaders(new HttpResponse({
      status: 200,
      jsonBody: {
        uploadUrl: sasResponse.uploadUrl,
        blobName: sasResponse.blobName,
        correlationId: sasResponse.correlationId,
        expiresAt: sasResponse.expiresAt.toISOString(),
        instructions: {
          method: 'PUT',
          headers: {
            'x-ms-blob-type': 'BlockBlob',
            'Content-Type': uploadRequest.contentType
          },
          note: 'Upload file directly to this URL. No additional headers needed.'
        },
        requestId,
        processingTime
      }
    }), context);

  } catch (error) {
    const processingTime = Date.now() - startTime;
    logger.error('Error generating upload URL', { error, processingTime });
    
    return new HttpResponse({
      status: 500,
      jsonBody: { 
        error: 'Internal server error', 
        processingTime
      }
    });
  }
}

app.http('generateUploadUrl', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'documents/upload-url',
  handler: generateUploadUrl
});

export { generateUploadUrl };