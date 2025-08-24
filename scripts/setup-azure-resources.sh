#!/bin/bash

# Azure Demographics API Setup Script

set -e

# Configuration
RESOURCE_GROUP="rg-demographics-api"
LOCATION="eastus"
SERVICE_BUS_NAMESPACE="sb-demographics-$(date +%s)"
STORAGE_ACCOUNT="stdemographics$(date +%s)"
COSMOS_ACCOUNT="cosmos-demographics-$(date +%s)"

echo "Creating Azure resources for Demographics API..."

# Create Resource Group
echo "Creating resource group: $RESOURCE_GROUP"
az group create --name $RESOURCE_GROUP --location $LOCATION

# Create Service Bus Namespace and Queues
echo "Creating Service Bus namespace: $SERVICE_BUS_NAMESPACE"
az servicebus namespace create \
  --resource-group $RESOURCE_GROUP \
  --name $SERVICE_BUS_NAMESPACE \
  --location $LOCATION \
  --sku Standard

echo "Creating Service Bus queues..."
az servicebus queue create \
  --resource-group $RESOURCE_GROUP \
  --namespace-name $SERVICE_BUS_NAMESPACE \
  --name demographics-processing \
  --max-delivery-count 3 \
  --lock-duration PT5M

az servicebus queue create \
  --resource-group $RESOURCE_GROUP \
  --namespace-name $SERVICE_BUS_NAMESPACE \
  --name webhook-notifications \
  --max-delivery-count 3 \
  --lock-duration PT5M

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

# Create Cosmos DB Account and Database
echo "Creating Cosmos DB account: $COSMOS_ACCOUNT"
az cosmosdb create \
  --name $COSMOS_ACCOUNT \
  --resource-group $RESOURCE_GROUP \
  --location $LOCATION \
  --default-consistency-level Session \
  --enable-automatic-failover true

echo "Creating Cosmos DB database and container..."
az cosmosdb sql database create \
  --account-name $COSMOS_ACCOUNT \
  --resource-group $RESOURCE_GROUP \
  --name milestonepathway

az cosmosdb sql container create \
  --account-name $COSMOS_ACCOUNT \
  --resource-group $RESOURCE_GROUP \
  --database-name milestonepathway \
  --name demographics \
  --partition-key-path "/partitionKey" \
  --throughput 400

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

COSMOS_CONNECTION=$(az cosmosdb keys list \
  --name $COSMOS_ACCOUNT \
  --resource-group $RESOURCE_GROUP \
  --type connection-strings \
  --query "connectionStrings[0].connectionString" -o tsv)

# Output environment variables
echo ""
echo "=== Azure Resources Created Successfully ==="
echo ""
echo "Add these to your .env file:"
echo ""
echo "SERVICE_BUS_CONNECTION_STRING=\"$SERVICE_BUS_CONNECTION\""
echo "BLOB_STORAGE_CONNECTION_STRING=\"$STORAGE_CONNECTION\""
echo "COSMOS_CONNECTION_STRING=\"$COSMOS_CONNECTION\""
echo ""
echo "Resource Group: $RESOURCE_GROUP"
echo "Service Bus Namespace: $SERVICE_BUS_NAMESPACE"
echo "Storage Account: $STORAGE_ACCOUNT"
echo "Cosmos DB Account: $COSMOS_ACCOUNT"