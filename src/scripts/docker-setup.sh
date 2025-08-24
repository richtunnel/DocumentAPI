#!/bin/bash
set -e

echo "🐳 Setting up Docker environment for Azure Functions..."

# Build and start all services
echo "Starting all services..."
docker-compose up --build -d

# Wait for services to be ready
echo "Waiting for services to initialize..."
sleep 30

# Check service health
echo "Checking service health..."
docker-compose ps

# Show connection strings
echo ""
echo "Connection Information:"
echo "================================"
echo "SQL Server: localhost:1433"
echo "   User: sa"
echo "   Password: YourStrong@Password123"
echo "   Database: DemographicsDB"
echo ""
echo "Redis: localhost:6379"
echo "Azurite Blob: localhost:10000"
echo "Azurite Queue: localhost:10001"
echo "Azure Functions: localhost:7071"
echo ""
echo "Test URLs:"
echo "Health Check: http://localhost:7071/api/health"
echo "Create API Key: http://localhost:7071/api/admin/api-keys"
echo "Demographics: http://localhost:7071/api/demographics"

# Test database connection
echo ""
echo "Testing database connection..."
docker exec demographics-mssql /opt/mssql-tools/bin/sqlcmd \
  -S localhost -U sa -P YourStrong@Password123 \
  -Q "SELECT COUNT(*) as TableCount FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_TYPE='BASE TABLE'"

echo ""
echo "Setup completed! Your Azure Functions development environment is ready."
echo "View logs: docker-compose logs -f functions-dev"