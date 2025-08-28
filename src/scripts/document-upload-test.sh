# Terminal 5: Create sample PDF for demo
echo "%PDF-1.4
Demo Legal Document - Client Demographics
Generated for demo: $(date)
%EOF" > demo-document.pdf

# Step 1: Generate secure upload URL
curl -X POST http://localhost:3000/api/v1/documents/upload-url \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $DEMO_API_KEY" \
  -d '{
    "fileName": "demo-legal-doc.pdf",
    "contentType": "application/pdf",
    "documentType": "demographics_form",
    "maxFileSizeMB": 10
  }' | jq '.' | tee upload-response.json

# Extract upload URL
UPLOAD_URL=$(jq -r '.data.uploadUrl' upload-response.json)
CORRELATION_ID=$(jq -r '.data.correlationId' upload-response.json)

# Step 2: Upload document directly to blob storage
curl -X PUT "$UPLOAD_URL" \
  -H "Content-Type: application/pdf" \
  -H "x-ms-blob-type: BlockBlob" \
  --data-binary @demo-document.pdf

echo "Document uploaded with correlation ID: $CORRELATION_ID"