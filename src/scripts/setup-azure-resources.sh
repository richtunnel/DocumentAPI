#!/bin/bash

# Azure Demographics API Setup Script

set -e

# Configuration
RESOURCE_GROUP="partner-api"
LOCATION="eastus"
SERVICE_BUS_NAMESPACE="bus-to-demographics-$(date +%s)"
STORAGE_ACCOUNT="stdemographics$(date +%s)"
SQL_SERVER_NAME="sql-demographics-$(date +%s)"
SQL_DATABASE_NAME="DemographicsDB"
SQL_ADMIN_USER="sqladmin"
SQL_ADMIN_PASSWORD="Demographics123!"

echo "Creating Azure resources for Demographics API with SQL Server..."

# Create Resource Group
echo "Creating resource group: $RESOURCE_GROUP"
az group create --name $RESOURCE_GROUP --location $LOCATION

# Create Service Bus Namespace (Premium tier for FIFO and better batching)
echo "Creating Service Bus namespace: $SERVICE_BUS_NAMESPACE"
az servicebus namespace create \
  --resource-group $RESOURCE_GROUP \
  --name $SERVICE_BUS_NAMESPACE \
  --location $LOCATION \
  --sku Premium \
  --capacity 1

echo "Creating Service Bus queues with FIFO and batching..."

# Create FIFO Queue for Demographics Processing (Sessions enabled for FIFO)
az servicebus queue create \
  --resource-group $RESOURCE_GROUP \
  --namespace-name $SERVICE_BUS_NAMESPACE \
  --name demographics-processing-fifo \
  --max-delivery-count 3 \
  --lock-duration PT5M \
  --requires-session true \
  --duplicate-detection-history-time-window PT10M \
  --enable-duplicate-detection true \
  --max-size-in-megabytes 5120 \
  --enable-batched-operations true

# Create FIFO Queue for Webhook Notifications
az servicebus queue create \
  --resource-group $RESOURCE_GROUP \
  --namespace-name $SERVICE_BUS_NAMESPACE \
  --name webhook-notifications-fifo \
  --max-delivery-count 5 \
  --lock-duration PT2M \
  --requires-session true \
  --duplicate-detection-history-time-window PT1H \
  --enable-duplicate-detection true \
  --max-size-in-megabytes 1024 \
  --enable-batched-operations true

# Create Standard Queue for Document Processing (High throughput, non-FIFO)
az servicebus queue create \
  --resource-group $RESOURCE_GROUP \
  --namespace-name $SERVICE_BUS_NAMESPACE \
  --name document-processing \
  --max-delivery-count 3 \
  --lock-duration PT5M \
  --max-size-in-megabytes 2048 \
  --enable-batched-operations true \
  --enable-partitioning true

# Create Dead Letter Queue for failed messages
az servicebus queue create \
  --resource-group $RESOURCE_GROUP \
  --namespace-name $SERVICE_BUS_NAMESPACE \
  --name dead-letter-processing \
  --max-delivery-count 1 \
  --lock-duration PT10M \
  --max-size-in-megabytes 1024 \
  --enable-batched-operations true

echo "FIFO Service Bus queues created successfully!"

# Create Storage Account and Container
echo "Creating storage account: $STORAGE_ACCOUNT"
az storage account create \
  --name $STORAGE_ACCOUNT \
  --resource-group $RESOURCE_GROUP \
  --location $LOCATION \
  --sku Standard_LRS \
  --kind StorageV2

echo "Creating blob container..."
az storage container create \
  --name demographics-documents \
  --account-name $STORAGE_ACCOUNT \
  --auth-mode login

# Create SQL Server and Database
echo "Creating SQL Server: $SQL_SERVER_NAME"
az sql server create \
  --resource-group $RESOURCE_GROUP \
  --name $SQL_SERVER_NAME \
  --location $LOCATION \
  --admin-user $SQL_ADMIN_USER \
  --admin-password "$SQL_ADMIN_PASSWORD"

echo "Creating SQL Database: $SQL_DATABASE_NAME"
az sql db create \
  --resource-group $RESOURCE_GROUP \
  --server $SQL_SERVER_NAME \
  --name $SQL_DATABASE_NAME \
  --service-objective Basic \
  --backup-storage-redundancy Local

# Allow Azure services to access SQL Server
echo "Configuring SQL Server firewall..."
az sql server firewall-rule create \
  --resource-group $RESOURCE_GROUP \
  --server $SQL_SERVER_NAME \
  --name "AllowAzureServices" \
  --start-ip-address 0.0.0.0 \
  --end-ip-address 0.0.0.0

# Optional: Allow your current IP to access SQL Server for management
CURRENT_IP=$(curl -s ifconfig.me)
echo "Adding your current IP ($CURRENT_IP) to SQL Server firewall..."
az sql server firewall-rule create \
  --resource-group $RESOURCE_GROUP \
  --server $SQL_SERVER_NAME \
  --name "AllowCurrentIP" \
  --start-ip-address $CURRENT_IP \
  --end-ip-address $CURRENT_IP

# Get connection strings
echo "Getting connection strings..."

SERVICE_BUS_CONNECTION=$(az servicebus namespace authorization-rule keys list \
  --resource-group $RESOURCE_GROUP \
  --namespace-name $SERVICE_BUS_NAMESPACE \
  --name RootManageSharedAccessKey \
  --query primaryConnectionString -o tsv)

STORAGE_CONNECTION=$(az storage account show-connection-string \
  --name $STORAGE_ACCOUNT \
  --resource-group $RESOURCE_GROUP \
  --query connectionString -o tsv)

# Build SQL Server connection string
SQL_CONNECTION="Server=tcp:${SQL_SERVER_NAME}.database.windows.net,1433;Initial Catalog=${SQL_DATABASE_NAME};Persist Security Info=False;User ID=${SQL_ADMIN_USER};Password=${SQL_ADMIN_PASSWORD};MultipleActiveResultSets=False;Encrypt=True;TrustServerCertificate=False;Connection Timeout=30;"

# Output environment variables
echo ""
echo "========================================="
echo "Azure Resources Created Successfully!"
echo "========================================="
echo ""
echo "Add these to your local.settings.json and .env files:"
echo ""
echo "SERVICE_BUS_CONNECTION_STRING=\"$SERVICE_BUS_CONNECTION\""
echo "BLOB_STORAGE_CONNECTION_STRING=\"$STORAGE_CONNECTION\""
echo ""
echo "SQL Server Configuration:"
echo "DB_SERVER=\"${SQL_SERVER_NAME}.database.windows.net\""
echo "DB_DATABASE=\"$SQL_DATABASE_NAME\""
echo "DB_USER=\"$SQL_ADMIN_USER\""
echo "DB_PASSWORD=\"$SQL_ADMIN_PASSWORD\""
echo "DB_PORT=\"1433\""
echo ""
echo "Or as a single connection string:"
echo "SQL_CONNECTION_STRING=\"$SQL_CONNECTION\""
echo ""
echo "Resources Created:"
echo "- Resource Group: $RESOURCE_GROUP"
echo "- Service Bus Namespace: $SERVICE_BUS_NAMESPACE"
echo "- Storage Account: $STORAGE_ACCOUNT"
echo "- SQL Server: ${SQL_SERVER_NAME}.database.windows.net"
echo "- SQL Database: $SQL_DATABASE_NAME"
echo ""
echo "Queues created:"
echo "✓ demographics-processing-fifo (FIFO, Sessions enabled)"
echo "✓ webhook-notifications-fifo (FIFO, Sessions enabled)" 
echo "✓ document-processing (Partitioned, High throughput)"
echo "✓ dead-letter-processing (Error handling)"
echo ""
echo "Next Steps:"
echo "1. Run your database schema script on the SQL Server"
echo "2. Deploy your Azure Functions"
echo "3. Configure your application with the connection strings above"
echo "4. Test the API endpoints"
echo ""
echo "To connect to SQL Server for schema setup:"
echo "sqlcmd -S ${SQL_SERVER_NAME}.database.windows.net -d $SQL_DATABASE_NAME -U $SQL_ADMIN_USER -P \"$SQL_ADMIN_PASSWORD\" -i your-schema-file.sql"