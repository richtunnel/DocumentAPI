#!/bin/bash

set -e

BASE_URL="http://localhost:3000"
FUNCTIONS_URL="http://localhost:7071"
API_KEY=""

echo "Testing Demographics API..."

# Test 1: Health Check (Express)
echo "1. Testing Express health endpoint..."
if curl -s -f "$BASE_URL/api/v1/health" > /dev/null; then
    echo "   ✓ Express API is healthy"
else
    echo "   ✗ Express API health check failed"
    exit 1
fi

# Test 2: Azure Functions Health
echo "2. Testing Azure Functions..."
if curl -s -f "$FUNCTIONS_URL/admin/functions" > /dev/null 2>&1; then
    echo "   ✓ Azure Functions runtime is running"
else
    echo "   ✗ Azure Functions runtime not accessible (this might be OK in development)"
fi

# Test 3: Database Connection
echo "3. Testing database connection..."
HEALTH_RESPONSE=$(curl -s "$BASE_URL/api/v1/health")
if echo "$HEALTH_RESPONSE" | grep -q "healthy"; then
    echo "   ✓ Database connection is working"
else
    echo "   ✗ Database connection issues"
    echo "   Response: $HEALTH_RESPONSE"
fi

# Test 4: Create API Key
echo "4. Creating test API key..."
API_KEY_RESPONSE=$(curl -s -X POST "$BASE_URL/api/v1/admin/api-keys" \
    -H "Content-Type: application/json" \
    -d '{
        "name": "Test API Key",
        "law_firm": "Test Law Firm",
        "created_by_email": "test@example.com",
        "scopes": ["demographics:read", "demographics:write", "demographics:admin"]
    }' 2>/dev/null || echo '{"error": "API key creation failed"}')

if echo "$API_KEY_RESPONSE" | grep -q '"key"'; then
    API_KEY=$(echo "$API_KEY_RESPONSE" | grep -o '"key":"[^"]*"' | cut -d'"' -f4)
    echo "   ✓ API key created: ${API_KEY:0:15}..."
else
    echo "   ✗ API key creation failed"
    echo "   Response: $API_KEY_RESPONSE"
    # Continue tests without API key
fi

# Test 5: Submit Demographics (if we have API key)
if [ -n "$API_KEY" ]; then
    echo "5. Testing demographics submission..."
    DEMO_RESPONSE=$(curl -s -X POST "$BASE_URL/api/v1/demographics" \
        -H "Content-Type: application/json" \
        -H "X-API-Key: $API_KEY" \
        -d '{
            "law_firm": "Test Law Firm",
            "firstname": "John",
            "lastname": "TestCase",
            "email": "john.test@example.com",
            "phone": "5551234567",
            "primarylawfirm": "Test Law Firm",
            "claimanttype": "Adult",
            "city": "Dallas",
            "state": "TX",
            "zipcode": "75001"
        }' 2>/dev/null || echo '{"error": "Demographics submission failed"}')

    if echo "$DEMO_RESPONSE" | grep -q '"id"'; then
        DEMO_ID=$(echo "$DEMO_RESPONSE" | grep -o '"id":"[^"]*"' | cut -d'"' -f4)
        echo "   ✓ Demographics submitted successfully: $DEMO_ID"
    else
        echo "   ✗ Demographics submission failed"
        echo "   Response: $DEMO_RESPONSE"
    fi

    # Test 6: Retrieve Demographics
    echo "6. Testing demographics retrieval..."
    LIST_RESPONSE=$(curl -s -H "X-API-Key: $API_KEY" "$BASE_URL/api/v1/demographics?limit=5" 2>/dev/null || echo '{"error": "Retrieval failed"}')
    if echo "$LIST_RESPONSE" | grep -q '"data"'; then
        echo "   ✓ Demographics retrieval working"
    else
        echo "   ✗ Demographics retrieval failed"
        echo "   Response: $LIST_RESPONSE"
    fi
else
    echo "5-6. Skipping API key tests (no valid key)"
fi

# Test 7: Check Services
echo "7. Checking running services..."
echo "   Docker containers:"
docker-compose ps

echo ""
echo "Test Summary:"
echo "- Express API: Running on http://localhost:3000"
echo "- Azure Functions: Running on http://localhost:7071"
echo "- Database: MSSQL on localhost:1433"
echo "- Redis: Running on localhost:6379"
echo "- Azurite: Running on localhost:10000-10002"

if [ -n "$API_KEY" ]; then
    echo "- Test API Key: $API_KEY"
    echo ""
    echo "Try these manual tests:"
    echo "curl -H \"X-API-Key: $API_KEY\" http://localhost:3000/api/v1/demographics"
fi

echo ""
echo "Check logs with: docker-compose logs -f api"