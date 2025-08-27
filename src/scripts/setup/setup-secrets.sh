#!/bin/bash

# setup-secrets.sh - Create secure secrets for the application

set -e

echo "Setting up secure secrets for Demographics API..."

# Create secrets directory
mkdir -p secrets config

# Generate secure random secrets
echo "Generating database password..."
openssl rand -base64 32 | tr -d "=+/" | cut -c1-25 > secrets/db_password.txt

echo "Generating JWT secret..."
openssl rand -base64 64 > secrets/jwt_secret.txt

echo "Generating API encryption key..."
openssl rand -base64 32 > secrets/api_encryption_key.txt

echo "Generating webhook secret..."
openssl rand -base64 32 > secrets/webhook_secret.txt

# Set secure permissions
chmod 600 secrets/*.txt

# Create Redis configuration
cat > config/redis.conf << 'EOF'
# Redis secure configuration
bind 0.0.0.0
port 6379
# Disable dangerous commands
rename-command FLUSHDB ""
rename-command FLUSHALL ""
rename-command DEBUG ""
rename-command CONFIG ""
# Memory and performance
maxmemory 256mb
maxmemory-policy allkeys-lru
# Logging
loglevel notice
# Security
protected-mode yes
# Persistence for development
save 900 1
save 300 10
save 60 10000
EOF

# Create Prometheus configuration
cat > config/prometheus.yml << 'EOF'
global:
  scrape_interval: 15s
  evaluation_interval: 15s

scrape_configs:
  - job_name: 'demographics-api'
    static_configs:
      - targets: ['api:3000']
    metrics_path: '/metrics'
    scrape_interval: 30s
    scrape_timeout: 10s

  - job_name: 'redis'
    static_configs:
      - targets: ['redis:6379']
    scrape_interval: 30s
EOF

# Create environment file template
cat > .env.template << 'EOF'
# Environment Configuration Template
# Copy to .env and fill in your values

NODE_ENV=development
LOG_LEVEL=info

# External Services (fill these in)
SERVICE_BUS_CONNECTION_STRING=your_service_bus_connection_string
BLOB_STORAGE_CONNECTION_STRING=your_blob_storage_connection_string

# Optional: Override default ports
# API_PORT=3000
# REDIS_PORT=6379
# MSSQL_PORT=1433
EOF

# Create .env file if it doesn't exist
if [ ! -f .env ]; then
    cp .env.template .env
    echo "Created .env file from template. Please fill in the external service connection strings."
fi

# Create .gitignore entries for secrets
cat >> .gitignore << 'EOF'

# Secrets and environment
secrets/
.env
config/redis.conf
config/prometheus.yml
logs/
EOF

echo "Secrets setup completed!"
echo ""
echo "Generated files:"
echo "  - secrets/db_password.txt (database password)"
echo "  - secrets/jwt_secret.txt (JWT signing key)"
echo "  - secrets/api_encryption_key.txt (API key encryption)"
echo "  - secrets/webhook_secret.txt (webhook signatures)"
echo "  - config/redis.conf (Redis configuration)"
echo "  - config/prometheus.yml (Prometheus configuration)"
echo "  - .env.template (environment template)"
echo ""
echo "Next steps:"
echo "1. Fill in the .env file with your external service connection strings"
echo "2. Review and adjust the Redis configuration if needed"
echo "3. Run: docker-compose up --build"