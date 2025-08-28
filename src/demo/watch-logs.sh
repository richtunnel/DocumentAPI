#!/bin/bash

echo "Demographics API - Live Log Monitoring"

# Open multiple log streams
echo "Watching API logs, Queue processing, and Database activity..."

# API logs in color
docker-compose logs -f api | while read line; do
  echo -e "\033[32m[API]\033[0m $line"
done &

# Worker logs
docker-compose logs -f worker | while read line; do
  echo -e "\033[34m[WORKER]\033[0m $line"
done &

# Database queries (if available)
docker-compose logs -f mssql | while read line; do
  echo -e "\033[35m[DB]\033[0m $line"
done &

wait