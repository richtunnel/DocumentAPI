#!/bin/bash
set -e

echo "🧹 Cleaning up Docker environment..."

# Stop all services
docker-compose down

# Remove volumes (optional - removes all data)
read -p "Remove all data volumes? (y/N): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    docker-compose down -v
    echo "All volumes removed."
fi

# Clean up unused images
docker image prune -f

echo "✅ Cleanup completed!"


## Quick Start Commands

# Make scripts executable
chmod +x scripts/docker-*.sh

# Setup everything
./scripts/docker-setup.sh

# Run tests
./scripts/docker-test.sh

# View logs
docker-compose logs -f functions-dev

# Cleanup
./scripts/docker-cleanup.sh


## Development Workflow

# 1. Start development environment
docker-compose up --build -d

# 2. Watch logs during development
docker-compose logs -f functions-dev

# 3. Test your functions
curl http://localhost:7071/api/health

# 4. Debug with VS Code
# Add this to .vscode/launch.json:
{
  "name": "Attach to Docker Functions",
  "type": "node",
  "request": "attach",
  "port": 9229,
  "address": "localhost",
  "localRoot": "${workspaceFolder}/src",
  "remoteRoot": "/home/site/wwwroot/src",
  "protocol": "inspector"
}
