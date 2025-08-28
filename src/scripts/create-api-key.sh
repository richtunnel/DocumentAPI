# Terminal 4: Create API key for demo
curl -X POST http://localhost:3000/api/v1/admin/api-keys \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Demo API Key",
    "law_firm": "Demo Law Firm",
    "created_by_email": "demo@company.com",
    "scopes": ["demographics:read", "demographics:write", "demographics:admin", "files:upload"],
    "rate_limits": {
      "requests_per_minute": 1000,
      "requests_per_hour": 10000,
      "requests_per_day": 100000,
      "burst_limit": 500
    }
  }' | jq '.'

# Save the returned API key
export DEMO_API_KEY="ak_your_returned_key_here"