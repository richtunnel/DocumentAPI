import { app, HttpRequest, HttpResponse, InvocationContext } from '@azure/functions';
import { v4 as uuidv4 } from 'uuid';
import { blobSasService } from '../../shared/services/blobSas.service';
import { apiKeyService } from '../../shared/services/apiKey.service';
import { rateLimiter } from '../../shared/services/rateLimiter.service';
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
  const requestId = uuidv4();
  const startTime = Date.now();

  try {
    logger.info('Generate upload URL started', { requestId });

    // Get client IP
    const clientIP = request.headers.get('x-forwarded-for') || 
                    request.headers.get('x-real-ip') || 
                    'unknown';

    // Validate API key
    const apiKeyHeader = request.headers.get('x-api-key');
    if (!apiKeyHeader) {
      return new HttpResponse({
        status: 401,
        jsonBody: { error: 'API key required', requestId }
      });
    }

    const { apiKey, isValid, error } = await apiKeyService.validateApiKey(
      apiKeyHeader,
      clientIP,
      ['files:upload', 'demographics:write']
    );

    if (!isValid) {
      return new HttpResponse({
        status: 401,
        jsonBody: { error: error || 'Invalid API key', requestId }
      });
    }

    // Check rate limits
    const rateLimitResult = await rateLimiter.checkRateLimit(apiKey, clientIP);
    if (!rateLimitResult.allowed) {
      return new HttpResponse({
        status: 429,
        headers: {
          'X-RateLimit-Limit': rateLimitResult.limit.toString(),
          'X-RateLimit-Remaining': rateLimitResult.remaining.toString(),
          'X-RateLimit-Reset': rateLimitResult.resetTime.toISOString(),
        },
        jsonBody: { 
          error: 'Rate limit exceeded', 
          resetTime: rateLimitResult.resetTime.toISOString(),
          requestId 
        }
      });
    }

    // Parse and validate request
    const body = await request.json();
    const validation = GenerateUploadUrlSchema.safeParse(body);
    
    if (!validation.success) {
      return new HttpResponse({
        status: 400,
        jsonBody: { 
          error: 'Validation failed', 
          details: validation.error.issues,
          requestId 
        }
      });
    }

    const uploadRequest = validation.data;

    // Generate SAS URL for direct upload
    const sasResponse = await blobSasService.generateUploadSasUrl({
      fileName: uploadRequest.fileName,
      contentType: uploadRequest.contentType,
      lawFirm: apiKey.law_firm,
      demographicsId: uploadRequest.demographicsId,
      documentType: uploadRequest.documentType,
      maxFileSizeMB: uploadRequest.maxFileSizeMB
    });

    const processingTime = Date.now() - startTime;
    
    logger.info('Upload URL generated successfully', {
      requestId,
      lawFirm: apiKey.law_firm,
      fileName: uploadRequest.fileName,
      correlationId: sasResponse.correlationId,
      processingTime
    });

    return new HttpResponse({
      status: 200,
      headers: {
        'X-RateLimit-Limit': rateLimitResult.limit.toString(),
        'X-RateLimit-Remaining': rateLimitResult.remaining.toString(),
        'X-RateLimit-Reset': rateLimitResult.resetTime.toISOString(),
      },
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
    });

  } catch (error) {
    const processingTime = Date.now() - startTime;
    logger.error('Error generating upload URL', { requestId, error, processingTime });
    
    return new HttpResponse({
      status: 500,
      jsonBody: { 
        error: 'Internal server error', 
        requestId,
        processingTime
      }
    });
  }
}

// Register the function
app.http('generateUploadUrl', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'documents/upload-url',
  handler: generateUploadUrl
});



