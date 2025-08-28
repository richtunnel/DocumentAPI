#!/bin/bash
set -e

echo "Setting up Demographics API Demo Environment"

# Clean start
docker-compose down -v

echo "Starting services..."
docker-compose up -d

echo "Waiting for SQL Server to start..."
# Wait for SQL Server specifically
until docker-compose exec -T mssql /opt/mssql-tools/bin/sqlcmd -S localhost -U sa -P "GreenSun83**" -Q "SELECT 1" > /dev/null 2>&1; do
  echo "  Still waiting for SQL Server..."
  sleep 10
done

echo "SQL Server is ready! Initializing database..."
docker-compose exec -T mssql /opt/mssql-tools/bin/sqlcmd -S localhost -U sa -P "GreenSun83**" -i /init-database.sql

echo "Verifying database setup..."
docker-compose exec -T mssql /opt/mssql-tools/bin/sqlcmd -S localhost -U sa -P "GreenSun83**" -d PartnersDB -Q "SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_TYPE='BASE TABLE'"

echo "Demo environment ready!"
echo "API: http://localhost:3000"