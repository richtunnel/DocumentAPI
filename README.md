# Demographics API - Express with Queue Processing

A production-ready Demographics API built with Express.js, implementing the **Claim Check Pattern**, **Queue Processing**, and **Webhook Notifications** for processing claimant demographic data at scale.

## 🏗️ Architecture Overview

### Key Patterns Implemented:

1. **📋 Claim Check Pattern**: Large documents are stored in Azure Blob Storage, with only references stored in the database
2. **🔄 Async Queue Processing**: All operations go through Azure Service Bus queues for reliable processing
3. **🪝 Webhook Notifications**: Configurable webhooks with retry logic and cron-based processing
4. **👥 Multi-Worker Architecture**: Separate workers for data processing and webhook delivery

### Flow:
1. **API receives request** → Returns `202 Accepted` with correlation ID
2. **Documents uploaded to Blob Storage** → Paths stored as references
3. **Message queued** → Azure Service Bus queue for processing
4. **Worker processes message** → Creates/updates database record
5. **Webhook queued** → Notifications sent to configured endpoints
6. **Cron job** → Checks for pending webhooks every 5 minutes

## 🚀 Features

- **REST API Endpoints**:
  - `POST /external/v1/demographics/submit` - Submit new records with documents
  - `PUT /external/v1/demographics/update` - Update existing records
  - `GET /external/v1/demographics/retrieve` - Query records with filters
  - `GET /external/v1/demographics/:sf_id` - Get specific record

- **Enterprise-Grade Processing**:
  - Batch processing up to 100 records per request
  - Document upload handling with claim check pattern
  - Queue-based async processing with retry logic
  - Webhook notifications with exponential backoff
  - Comprehensive error handling and logging

- **Security & Reliability**:
  - JWT authentication with role-based permissions
  - Rate limiting and CORS protection
  - Input validation with Zod schemas including `.passthrough()`
  - Automatic retry mechanisms
  - Dead letter queue handling

## 🛠️ Tech Stack

- **API Framework**: Express.js with TypeScript
- **Queue System**: Azure Service Bus
- **Document Storage**: Azure Blob Storage (Claim Check Pattern)
- **Database**: SQL Server
- **Validation**: Zod with passthrough support
- **Authentication**: JWT tokens
- **Logging**: Winston
- **Scheduling**: Node-cron for webhook processing

## 📦 Installation & Setup

### Prerequisites
- Node.js 18+
- Azure subscription
- Azure CLI

### 1. Clone and Install
```bash
git clone <repo-url>
cd demographics-api
npm install
```

### 2. Setup Azure Resources
```bash
chmod +x scripts/setup-azure-resources.sh
./scripts/setup-azure-resources.sh
```

### 3. Configure Environment
```bash
cp .env.example .env
# Add the connection strings from the setup script
```

### 4. Build and Run

**Development:**
```bash
npm run dev          # Start API server with hot reload
npm run worker       # Start demographics worker
npm run webhook-processor # Start webhook processor
```

**Production with Docker:**
```bash
docker-compose up -d
```

## 🔄 Queue Processing Architecture

### Demographics Worker
- Processes CREATE/UPDATE operations from Service Bus queue
- Handles document claim check pattern
- Updates database with processing status
- Queues webhook notifications

### Webhook Processor
- Processes webhook delivery queue
- Implements retry logic with exponential backoff
- Runs cron job every 5 minutes for delayed notifications
- Handles dead letter queue for failed deliveries

## 📊 API Usage Examples

### Submit Demographics with Documents
```bash
curl -X POST https://api.milestonepathway.com/external/v1/demographics/submit \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: multipart/form-data" \
  -F 'demographics=[{"firstname":"John","lastname":"Doe","claimanttype":"Adult"}]' \
  -F 'webhook_url=https://your-app.com/webhooks/demographics' \
  -F 'webhook_events=["created","processed"]' \
  -F 'documents=@document1.pdf' \
  -F 'documents=@document2.pdf'
```

**Response (202 Accepted):**
```json
{
  "success": true,
  "message": "Accepted 1 of 1 records for processing",
  "data": [{
    "id": "123e4567-e89b-12d3-a456-426614174000",
    "sf_id": "SF123456",
    "correlation_id": "abc123-def456",
    "status": "accepted",
    "document_count": 2
  }],
  "correlation_id": "abc123-def456"
}
```

### Retrieve Records with Filters
```bash
curl -X GET "https://api.milestonepathway.com/external/v1/demographics/retrieve?filter_claimanttype=Adult&limit=50" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### Get Specific Record
```bash
curl -X GET https://api.milestonepathway.com/external/v1/demographics/SF123456 \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

## 🪝 Webhook Configuration

Webhooks are sent for the following events:
- `created` - When record is initially created
- `updated` - When record is updated
- `processed` - When record processing is completed (sent 5 minutes after completion)
- `failed` - When record processing fails

**Webhook Payload Example:**
```json
{
  "event": "processed",
  "demographic_id": "123e4567-e89b-12d3-a456-426614174000",
  "sf_id": "SF123456",
  "status": "completed",
  "timestamp": "2024-01-15T10:30:00Z",
  "data": { /* full demographic record */ },
  "metadata": {
    "correlation_id": "abc123-def456",
    "law_firm": "Smith & Associates",
    "timestamp": "2024-01-15T10:30:00Z"
  }
}
```

## 🔧 Configuration

Key environment variables:

```bash
# Queue Processing
MAX_CONCURRENT_CALLS=5              # Worker concurrency
WEBHOOK_PROCESSING_INTERVAL="*/5 * * * *"  # Cron schedule
WEBHOOK_RETRY_ATTEMPTS=3            # Max webhook retries

# Document Storage
DOCUMENTS_CONTAINER_NAME=demographics-documents

# Database
DATABASE_NAME=Partnersdb
APP_CONTAINER_NAME=demographics
```

## 📝 Data Model

The API supports all 200+ fields from your specification with:
- **Strict validation** using Zod schemas
- **Passthrough support** for additional fields via `.passthrough()`
- **UUID generation** for sf_id if not provided
- **Document path references** for claim check pattern
- **Processing status tracking** (pending → processing → completed/failed)

## 🔒 Security

- **JWT Authentication** with configurable permissions
- **Rate limiting** (100 requests per 15 minutes per IP)
- **Input validation** and sanitization
- **CORS protection** with configurable origins
- **Helmet.js** for security headers

## 📊 Monitoring & Logging

- **Winston logging** with structured JSON logs
- **Request/response logging**
- **Error tracking** with stack traces
- **Processing metrics** and correlation IDs
- **Health check endpoint** at `/health`

## 🚀 Deployment

The application is containerized and ready for deployment to:
- **Azure Container Apps**
- **Azure Kubernetes Service (AKS)**
- **Docker Swarm**
- **Any container orchestration platform**

**Scaling considerations:**
- Run multiple API instances behind a load balancer
- Scale workers independently based on queue depth
- Use Azure Service Bus partitioning for high throughput
- Implement circuit breakers for external webhook calls

This architecture provides enterprise-grade reliability, scalability, and maintainability while implementing the exact patterns you described in your notes!// package.json