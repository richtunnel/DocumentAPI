
#!/bin/bash
set -e

echo "Running comprehensive tests..."

# Test 1: Health Check
echo "Testing health endpoint..."
curl -f http://localhost:7071/api/health || echo "Health check failed"

# Test 2: Database Connection
echo "Testing database connection..."
docker exec demographics-mssql /opt/mssql-tools/bin/sqlcmd \
  -S localhost -U sa -P YourStrong@Password123 \
  -Q "SELECT 1 as HealthCheck" -h -1

# Test 3: Redis Connection
echo "Testing Redis connection..."
docker exec demographics-redis redis-cli ping

# Test 4: Create test API key
echo "Creating test API key..."
curl -X POST http://localhost:7071/api/admin/api-keys \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Docker Test Key",
    "law_firm": "Test Firm Docker",
    "created_by_email": "test@docker.local",
    "scopes": ["demographics:read", "demographics:write"]
  }'

echo ""
echo "All tests completed!"
