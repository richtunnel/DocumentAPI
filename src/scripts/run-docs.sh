### **Monitor Setup**

# Terminal 1: Watch queue status
watch -n 5 'curl -s http://localhost:7071/api/monitor/queues | jq'

# Terminal: Watch worker stats  
watch -n 10 'curl -s http://localhost:7071/api/monitor/workers | jq'

# Terminal 3: Function logs
docker-compose logs -f functions-dev


### Generate Test Load**

# Create test API key first
curl -X POST http://localhost:7071/api/admin/api-keys \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Load Test Key",
    "law_firm": "Test Load Firm", 
    "created_by_email": "test@loadtest.com",
    "scopes": ["demographics:write"]
  }' | jq '.key'

# Use the returned API key for load testing
API_KEY="your_returned_api_key_here"

# Generate 50 demographics submissions
for i in {1..50}; do
  curl -X POST http://localhost:7071/api/demographics \
    -H "Content-Type: application/json" \
    -H "X-API-Key: $API_KEY" \
    -d "{
      \"law_firm\": \"Load Test Firm\",
      \"firstname\": \"Test$i\", 
      \"lastname\": \"User$i\",
      \"email\": \"test$i@example.com\",
      \"phone\": \"555000000$i\",
      \"primarylawfirm\": \"Load Test Firm\",
      \"claimanttype\": \"Adult\"
    }" &
done
wait

echo "Submitted 50 demographics - watch the queues and workers!"
