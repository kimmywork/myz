#!/bin/bash

# Setup script for PostgreSQL test database
# This script creates the test database and user for local testing

set -e

echo "Setting up test database..."

# Database configuration (matches GitHub Actions)
DB_NAME="myz_test_db"
DB_USER="test_user"
DB_PASSWORD="test_password"

# Check if PostgreSQL is running
if ! pg_isready -q; then
  echo "Error: PostgreSQL is not running. Please start PostgreSQL first."
  echo "  macOS: brew services start postgresql"
  echo "  Linux: sudo systemctl start postgresql"
  exit 1
fi

echo "PostgreSQL is running ✓"

# Create test user if it doesn't exist
echo "Creating test user..."
psql -U postgres -tc "SELECT 1 FROM pg_user WHERE usename = '$DB_USER'" | grep -q 1 || \
  psql -U postgres -c "CREATE USER $DB_USER WITH PASSWORD '$DB_PASSWORD';"

# Drop test database if it exists and create new one
echo "Creating test database..."
psql -U postgres -c "DROP DATABASE IF EXISTS $DB_NAME;"
psql -U postgres -c "CREATE DATABASE $DB_NAME OWNER $DB_USER;"

# Grant privileges
echo "Granting privileges..."
psql -U postgres -c "GRANT ALL PRIVILEGES ON DATABASE $DB_NAME TO $DB_USER;"

# Run migrations
echo "Running database migrations..."
cd "$(dirname "$0")/.."
export DB_HOST=localhost
export DB_PORT=5432
export DB_NAME=$DB_NAME
export DB_USER=$DB_USER
export DB_PASSWORD=$DB_PASSWORD
export JWT_SECRET=test-secret

npm run build
node dist/scripts/migrate.js

echo ""
echo "✓ Test database setup complete!"
echo ""
echo "Database credentials:"
echo "  Host:     localhost"
echo "  Port:     5432"
echo "  Database: $DB_NAME"
echo "  User:     $DB_USER"
echo "  Password: $DB_PASSWORD"
echo ""
echo "You can now run API tests with: npm run test:api"
