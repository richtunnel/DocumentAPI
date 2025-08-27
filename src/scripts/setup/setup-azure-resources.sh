#!/bin/bash

# Azure Demographics API Setup Script
set -e

# Configuration
RESOURCE_GROUP="partner-api"
LOCATION="eastus"
SUBSCRIPTION_ID=$(az account show --query id -o tsv)

# Resource naming
SERVICE_BUS_NAMESPACE="bus-demographics-$(date +%s)"
STORAGE_ACCOUNT="stdemographics$(date +%s)" #edit
SQL_SERVER_NAME="ms-partner-server-$(date +%s)" #edit
SQL_DATABASE_NAME="MilestonePartnerDB"
REDIS_NAME="redis-demographics-$(date +%s)"
FUNCTION_APP_NAME="func-demographics-$(date +%s)"
APP_SERVICE_PLAN="plan-demographics-$(date +%s)"
APIM_NAME="apim-demographics-$(date +%s)"
CONTAINER_REGISTRY="acrdemographics$(date +%s)"
CONTAINER_APP_ENV="env-demographics-$(date +%s)"

echo "Starting Complete Azure Demographics API Deployment"
echo "Resource Group: $RESOURCE_GROUP"
echo "Location: $LOCATION"
echo ""

# Create Resource Group
echo "Creating resource group..."
az group create --name $RESOURCE_GROUP --location $LOCATION

# 1. CREATE SERVICE BUS WITH FIFO QUEUES
echo "Creating Service Bus with FIFO queues..."
az servicebus namespace create \
  --resource-group $RESOURCE_GROUP \
  --name $SERVICE_BUS_NAMESPACE \
  --location $LOCATION \
  --sku Premium \
  --capacity 1

# Create FIFO queues
declare -a queues=(
  "demographics-processing-fifo:true:PT5M:3:5120"
  "webhook-notifications-fifo:true:PT2M:5:1024" 
  "document-processing:false:PT5M:3:2048"
  "dead-letter-processing:false:PT10M:1:1024"
)

for queue_info in "${queues[@]}"; do
  IFS=':' read -r queue_name requires_session lock_duration max_delivery max_size <<< "$queue_info"
  
  echo "...Creating queue: $queue_name"
  
  cmd="az servicebus queue create \
    --resource-group $RESOURCE_GROUP \
    --namespace-name $SERVICE_BUS_NAMESPACE \
    --name $queue_name \
    --max-delivery-count $max_delivery \
    --lock-duration $lock_duration \
    --max-size-in-megabytes $max_size \
    --enable-batched-operations true"
  
  if [ "$requires_session" = "true" ]; then
    cmd="$cmd --requires-session true --duplicate-detection-history-time-window PT10M --enable-duplicate-detection true"
  else
    cmd="$cmd --enable-partitioning true"
  fi
  
  eval $cmd
done

# 2. CREATE STORAGE ACCOUNT WITH CONTAINERS
echo "Creating Storage Account..."
az storage account create \
  --name $STORAGE_ACCOUNT \
  --resource-group $RESOURCE_GROUP \
  --location $LOCATION \
  --sku Standard_LRS \
  --kind StorageV2 \
  --access-tier Hot

# Create containers
echo " Creating blob containers..."
az storage container create --name demographics-documents --account-name $STORAGE_ACCOUNT --auth-mode login
az storage container create --name function-releases --account-name $STORAGE_ACCOUNT --auth-mode login --public-access off

# 3. CREATE AZURE SQL SERVER AND DATABASE
echo "Creating SQL Server and Database..."
SQL_ADMIN_PASSWORD="Demographics$(date +%s)!"

az sql server create \
  --resource-group $RESOURCE_GROUP \
  --name $SQL_SERVER_NAME \
  --location $LOCATION \
  --admin-user sqladmin \
  --admin-password "$SQL_ADMIN_PASSWORD"

az sql db create \
  --resource-group $RESOURCE_GROUP \
  --server $SQL_SERVER_NAME \
  --name $SQL_DATABASE_NAME \
  --service-objective S1 \
  --backup-storage-redundancy Local

# Configure firewall
az sql server firewall-rule create \
  --resource-group $RESOURCE_GROUP \
  --server $SQL_SERVER_NAME \
  --name "AllowAzureServices" \
  --start-ip-address 0.0.0.0 \
  --end-ip-address 0.0.0.0

# 4. CREATE REDIS CACHE
echo "🔄 Creating Redis Cache..."
az redis create \
  --resource-group $RESOURCE_GROUP \
  --name $REDIS_NAME \
  --location $LOCATION \
  --sku Basic \
  --vm-size c0 \
  --enable-non-ssl-port

# 5. CREATE CONTAINER REGISTRY (for container deployments)
echo "🐳 Creating Container Registry..."
az acr create \
  --resource-group $RESOURCE_GROUP \
  --name $CONTAINER_REGISTRY \
  --sku Basic \
  --admin-enabled true

# 6. CREATE FUNCTION APP WITH CONSUMPTION PLAN
echo "⚡ Creating Azure Function App..."
az functionapp plan create \
  --resource-group $RESOURCE_GROUP \
  --name $APP_SERVICE_PLAN \
  --location $LOCATION \
  --number-of-workers 1 \
  --sku EP1 \
  --is-linux true

# Create Function App
az functionapp create \
  --resource-group $RESOURCE_GROUP \
  --plan $APP_SERVICE_PLAN \
  --name $FUNCTION_APP_NAME \
  --storage-account $STORAGE_ACCOUNT \
  --runtime node \
  --runtime-version 18 \
  --os-type Linux \
  --functions-version 4

# 7. CREATE API MANAGEMENT
echo "Creating API Management..."
az apim create \
  --resource-group $RESOURCE_GROUP \
  --name $APIM_NAME \
  --location $LOCATION \
  --publisher-email admin@demographics-api.com \
  --publisher-name "Demographics API Team" \
  --sku-name Developer \
  --sku-capacity 1 \
  --no-wait

# 8. CREATE CONTAINER APPS ENVIRONMENT (Alternative to Functions)
echo "Creating Container Apps Environment..."
az extension add --name containerapp --upgrade

az containerapp env create \
  --resource-group $RESOURCE_GROUP \
  --name $CONTAINER_APP_ENV \
  --location $LOCATION

# Get connection strings
echo "Retrieving connection strings..."

SERVICE_BUS_CONNECTION=$(az servicebus namespace authorization-rule keys list \
  --resource-group $RESOURCE_GROUP \
  --namespace-name $SERVICE_BUS_NAMESPACE \
  --name RootManageSharedAccessKey \
  --query primaryConnectionString -o tsv)

STORAGE_CONNECTION=$(az storage account show-connection-string \
  --name $STORAGE_ACCOUNT \
  --resource-group $RESOURCE_GROUP \
  --query connectionString -o tsv)

REDIS_CONNECTION=$(az redis list-keys \
  --resource-group $RESOURCE_GROUP \
  --name $REDIS_NAME \
  --query primaryConnectionString -o tsv)

SQL_CONNECTION="Server=tcp:${SQL_SERVER_NAME}.database.windows.net,1433;Initial Catalog=${SQL_DATABASE_NAME};Persist Security Info=False;User ID=sqladmin;Password=${SQL_ADMIN_PASSWORD};MultipleActiveResultSets=False;Encrypt=True;TrustServerCertificate=False;Connection Timeout=30;"

# Configure Function App settings
echo "Configuring Function App settings..."
az functionapp config appsettings set \
  --resource-group $RESOURCE_GROUP \
  --name $FUNCTION_APP_NAME \
  --settings \
    "SERVICE_BUS_CONNECTION_STRING=$SERVICE_BUS_CONNECTION" \
    "BLOB_STORAGE_CONNECTION_STRING=$STORAGE_CONNECTION" \
    "REDIS_CONNECTION_STRING=$REDIS_CONNECTION" \
    "DB_SERVER=${SQL_SERVER_NAME}.database.windows.net" \
    "DB_DATABASE=$SQL_DATABASE_NAME" \
    "DB_USER=sqladmin" \
    "DB_PASSWORD=$SQL_ADMIN_PASSWORD" \
    "DB_PORT=1433" \
    "JWT_SECRET=$(openssl rand -base64 32)" \
    "API_KEY_ENCRYPTION_KEY=$(openssl rand -base64 32)" \
    "WEBHOOK_SECRET=$(openssl rand -base64 32)" \
    "ENVIRONMENT=production"

# Output deployment summary
echo ""
echo "DEPLOYMENT COMPLETE!"
echo ""
echo "RESOURCE SUMMARY:"
echo "  Resource Group: $RESOURCE_GROUP"
echo "  Service Bus: $SERVICE_BUS_NAMESPACE"
echo "  Storage: $STORAGE_ACCOUNT" 
echo "  SQL Server: $SQL_SERVER_NAME"
echo "  Redis: $REDIS_NAME"
echo "  Function App: $FUNCTION_APP_NAME"
echo "  APIM: $APIM_NAME (provisioning in background)"
echo "  Container Registry: $CONTAINER_REGISTRY"
echo "  Container Environment: $CONTAINER_APP_ENV"
echo ""
echo "CONNECTION STRINGS:"
echo "  Service Bus: $SERVICE_BUS_CONNECTION"
echo "  Storage: $STORAGE_CONNECTION"
echo "  Redis: $REDIS_CONNECTION"
echo "  SQL: $SQL_CONNECTION"
echo ""
echo "NEXT STEPS:"
echo "  1. Run database migration: ./scripts/run-migration.sh"
echo "  2. Deploy function code: func azure functionapp publish $FUNCTION_APP_NAME"
echo "  3. Configure APIM policies: az apim api import..."
echo "  4. Deploy container apps (optional): az containerapp create..."
echo ""
echo "Save these connection strings in your local.settings.json and production config!"

# Save deployment info to file
cat > deployment-info.json << EOF
{
  "deployment": {
    "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
    "resourceGroup": "$RESOURCE_GROUP",
    "location": "$LOCATION"
  },
  "resources": {
    "serviceBus": "$SERVICE_BUS_NAMESPACE",
    "storage": "$STORAGE_ACCOUNT",
    "sqlServer": "$SQL_SERVER_NAME",
    "redis": "$REDIS_NAME",
    "functionApp": "$FUNCTION_APP_NAME",
    "apim": "$APIM_NAME",
    "containerRegistry": "$CONTAINER_REGISTRY",
    "containerEnvironment": "$CONTAINER_APP_ENV"
  },
  "connectionStrings": {
    "serviceBus": "$SERVICE_BUS_CONNECTION",
    "storage": "$STORAGE_CONNECTION", 
    "redis": "$REDIS_CONNECTION",
    "sql": "$SQL_CONNECTION"
  },
  "credentials": {
    "sqlPassword": "$SQL_ADMIN_PASSWORD"
  }
}
EOF

echo "Deployment info saved to: deployment-info.json"