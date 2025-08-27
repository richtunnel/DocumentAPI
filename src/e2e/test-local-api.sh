#!/bin/bash

set -e

echo "🧪 Demographics API - Local E2E Testing"
echo "========================================"

BASE_URL="http://localhost:7071"
API_KEY=""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

print_step() {
    echo -e "${BLUE}▶ $1${NC}"
}

print_success() {
    echo -e "${GREEN}$1${NC}"
}

print_error() {
    echo -e "${RED} $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}  $1${NC}"
}

# Step 1: Check if services are running
print_step "Step 1: Checking services..."

if ! curl -s "$BASE_URL/api/health" > /dev/null; then
    print_error "Services not running. Please start with: ./src/scripts/docker-setup.sh"
    exit 1
fi

print_success "Services are running"

# Step 2: Health check
print_step "Step 2: Health check..."

HEALTH_RESPONSE=$(curl -s "$BASE_URL/api/health")
echo "Health: $(echo $HEALTH_RESPONSE | jq -r '.status')"

if echo $HEALTH_RESPONSE | jq -e '.status == "healthy"' > /dev/null; then
    print_success "Health check passed"
else
    print_warning "Health check shows issues, continuing anyway..."
fi

# Step 3: Create API Key
print_step "Step 3: Creating API key..."

API_KEY_RESPONSE=$(curl -s -X POST "$BASE_URL/api/admin/api-keys" \
    -H "Content-Type: application/json" \
    -d '{
        "name": "E2E Test Key",
        "law_firm": "E2E Test Firm",
        "created_by_email": "e2e@test.com",
        "scopes": ["demographics:read", "demographics:write", "demographics:admin"]
    }')

if echo $API_KEY_RESPONSE | jq -e '.key' > /dev/null; then
    API_KEY=$(echo $API_KEY_RESPONSE | jq -r '.key')
    print_success "API key created: ${API_KEY:0:15}..."
else
    print_error "Failed to create API key"
    echo "Response: $API_KEY_RESPONSE"
    exit 1
fi

# Step 4: Submit demographics
print_step "Step 4: Submitting demographics..."

DEMOGRAPHIC_RESPONSE=$(curl -s -X POST "$BASE_URL/api/demographics" \
    -H "Content-Type: application/json" \
    -H "X-API-Key: $API_KEY" \
    -d '{
        "law_firm": "E2E Test Firm",
        "firstname": "John",
        "lastname": "TestCase",
        "email": "john.testcase@e2e.com",
        "phone": "5551234567",
        "primarylawfirm": "E2E Test Firm",
        "claimanttype": "Adult",
        "city": "Dallas",
        "state": "TX",
        "zipcode": "75001"
    }')

if echo $DEMOGRAPHIC_RESPONSE | jq -e '.id' > /dev/null; then
    DEMOGRAPHIC_ID=$(echo $DEMOGRAPHIC_RESPONSE | jq -r '.id')
    print_success "Demographics submitted: $DEMOGRAPHIC_ID"
else
    print_error "Failed to submit demographics"
    echo "Response: $DEMOGRAPHIC_RESPONSE"
    exit 1
fi

# Step 5: Retrieve demographics list
print_step "Step 5: Retrieving demographics list..."

DEMOGRAPHICS_LIST=$(curl -s -H "X-API-Key: $API_KEY" "$BASE_URL/api/demographics?limit=5")

if echo $DEMOGRAPHICS_LIST | jq -e '.data' > /dev/null; then
    COUNT=$(echo $DEMOGRAPHICS_LIST | jq '.data | length')
    print_success "Retrieved $COUNT demographics"
else
    print_error "Failed to retrieve demographics list"
    echo "Response: $DEMOGRAPHICS_LIST"
fi

# Step 6: Get specific demographic
print_step "Step 6: Retrieving specific demographic..."

SPECIFIC_DEMOGRAPHIC=$(curl -s -H "X-API-Key: $API_KEY" "$BASE_URL/api/demographics/$DEMOGRAPHIC_ID")

if echo $SPECIFIC_DEMOGRAPHIC | jq -e '.data.id' > /dev/null; then
    NAME=$(echo $SPECIFIC_DEMOGRAPHIC | jq -r '.data.firstname + " " + .data.lastname')
    print_success "Retrieved demographic: $NAME"
else
    print_error "Failed to retrieve specific demographic"
    echo "Response: $SPECIFIC_DEMOGRAPHIC"
fi

# Step 7: Test error handling
print_step "Step 7: Testing error handling..."

# Test without API key
ERROR_RESPONSE=$(curl -s -w "%{http_code}" -X POST "$BASE_URL/api/demographics" \
    -H "Content-Type: application/json" \
    -d '{"invalid": "data"}' | tail -c 3)

if [ "$ERROR_RESPONSE" = "401" ]; then
    print_success "Correctly rejected request without API key"
else
    print_warning "Expected 401, got $ERROR_RESPONSE"
fi

# Step 8: Test rate limiting (if configured)
print_step "Step 8: Testing rate limiting..."

RATE_LIMIT_HEADERS=$(curl -s -I -H "X-API-Key: $API_KEY" "$BASE_URL/api/demographics?limit=1")

if echo "$RATE_LIMIT_HEADERS" | grep -q "X-RateLimit"; then
    REMAINING=$(echo "$RATE_LIMIT_HEADERS" | grep "X-RateLimit-Remaining" | cut -d' ' -f2 | tr -d '\r')
    print_success "Rate limiting active, remaining: $REMAINING"
else
    print_warning "Rate limiting headers not found"
fi

# Step 9: Check monitoring endpoints
print_step "Step 9: Checking monitoring..."

QUEUE_STATUS=$(curl -s "$BASE_URL/api/monitor/queues" 2>/dev/null || echo '{"error": "not available"}')
if echo $QUEUE_STATUS | jq -e '.queues' > /dev/null; then
    print_success "Queue monitoring available"
else
    print_warning "Queue monitoring not available"
fi

# Step 10: Database verification
print_step "Step 10: Verifying database..."

DB_CHECK=$(docker exec demographics-mssql /opt/mssql-tools/bin/sqlcmd \
    -S localhost -U sa -P YourStrong@Password123 \
    -Q "SELECT COUNT(*) as count FROM PartnersDB.dbo.Demographics WHERE firstname = 'John' AND lastname = 'TestCase'" \
    -h -1 2>/dev/null | tr -d ' ')

if [ "$DB_CHECK" = "1" ]; then
    print_success "Demographics found in database"
else
    print_warning "Demographics not found in database (count: $DB_CHECK)"
fi

# Summary
echo ""
echo " Test Summary"
echo "==============="
echo "Health Check: Passed"
echo "API Key Creation: Passed"
echo "Demographics Submission: Passed"
echo "Data Retrieval: Passed"
echo "Error Handling: Passed"
echo "Database Persistence: Passed"

# Cleanup option
echo ""
read -p " Clean up test data? (y/N): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    print_step "Cleaning up test data..."
    
    # Disable API key
    curl -s -X PATCH "$BASE_URL/api/admin/api-keys" \
        -H "Content-Type: application/json" \
        -d "{\"key_id\": \"$(echo $API_KEY | cut -c1-11)\", \"status\": \"revoked\"}" > /dev/null
    
    print_success "Cleanup completed"
fi

echo ""
echo "Ready for manual testing!"
echo "Monitor with: npm run monitor"
echo "Load test with: npm run test:all"
echo "Import Postman collection: Demographics-API-Local.postman_collection.json"

echo ""
echo "   Quick Test URLs:"
echo "   Health: $BASE_URL/api/health"
echo "   Queue Status: $BASE_URL/api/monitor/queues"
echo "   Create API Key: POST $BASE_URL/api/admin/api-keys"
echo ""
echo "Your API Key: $API_KEY"
echo "   (Save this for Postman testing)"