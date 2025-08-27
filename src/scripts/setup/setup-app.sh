#!/bin/bash

set -e

echo "Setting up Demographics API..."

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "Docker is not running. Please start Docker first."
    exit 1
fi

# Create logs directory
mkdir -p logs

# Create .env file if it doesn't exist
if [ ! -f .env ]; then
    cat > .env << 'EOF'
NODE_ENV=development
SERVICE_BUS_CONNECTION_STRING=DefaultEndpointsProtocol=http;AccountName=devstoreaccount1;AccountKey=Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw==;QueueEndpoint=http://azurite:10001/devstoreaccount1;
EOF
    echo "Created .env file with default settings"
fi

echo "Building and starting services..."
docker-compose down
docker-compose build --no-cache
docker-compose up -d

echo "Waiting for services to start..."
sleep 30

# Wait for MSSQL to be ready
echo "Waiting for MSSQL to be ready..."
max_attempts=30
attempt=1
while [ $attempt -le $max_attempts ]; do
    if docker exec demographics-api_mssql_1 /opt/mssql-tools/bin/sqlcmd -S localhost -U sa -P YourStrong@Password123 -Q "SELECT 1" > /dev/null 2>&1; then
        echo "MSSQL is ready!"
        break
    fi
    echo "Attempt $attempt/$max_attempts - waiting for MSSQL..."
    sleep 5
    ((attempt++))
done

if [ $attempt -gt $max_attempts ]; then
    echo "MSSQL failed to start"
    exit 1
fi

# Initialize database
echo "Initializing database..."
docker exec demographics-api_mssql_1 /opt/mssql-tools/bin/sqlcmd -S localhost -U sa -P YourStrong@Password123 -i /docker-entrypoint-initdb.d/init-database.sql

# Wait for API to be ready
echo "Waiting for API to be ready..."
max_attempts=30
attempt=1
while [ $attempt -le $max_attempts ]; do
    if curl -s -f "http://localhost:3000/api/v1/health" > /dev/null 2>&1; then
        echo "API is ready!"
        break
    fi
    echo "Attempt $attempt/$max_attempts - waiting for API..."
    sleep 5
    ((attempt++))
done

if [ $attempt -gt $max_attempts ]; then
    echo "API failed to start"
    docker-compose logs api
    exit 1
fi

echo ""
echo "SUCCESS! Your Demographics API is running:"
echo "- Express API: http://localhost:3000"
echo "- Azure Functions: http://localhost:7071"
echo "- Health Check: http://localhost:3000/api/v1/health"
echo "- Database: localhost:1433 (sa/YourStrong@Password123)"
echo ""
echo "Check logs: docker-compose logs -f api"
echo "Stop services: docker-compose down"