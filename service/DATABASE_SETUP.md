# Database Setup for Testing

This document explains how to set up the PostgreSQL test database for running API tests locally.

## Quick Setup

The repository includes a setup script that automates the entire process:

```bash
cd service
./scripts/setup-test-db.sh
```

This script will:
1. Check if PostgreSQL is running
2. Create the `test_user` with password `test_password`
3. Create the `myz_test_db` database
4. Grant necessary privileges
5. Run database migrations

## Manual Setup

If you prefer to set up manually or need to customize:

### 1. Start PostgreSQL

**macOS:**
```bash
brew services start postgresql
```

**Linux:**
```bash
sudo systemctl start postgresql
```

### 2. Create Test User and Database

```bash
sudo -u postgres psql << EOF
CREATE USER test_user WITH PASSWORD 'test_password';
CREATE DATABASE myz_test_db OWNER test_user;
GRANT ALL PRIVILEGES ON DATABASE myz_test_db TO test_user;
EOF
```

### 3. Run Migrations

```bash
cd service
export DB_HOST=localhost
export DB_PORT=5432
export DB_NAME=myz_test_db
export DB_USER=test_user
export DB_PASSWORD=test_password
export JWT_SECRET=test-secret
export NODE_ENV=test

npm run build
npm run migrate
```

## Database Credentials

The test database uses these credentials (matching GitHub Actions):

- **Host:** localhost
- **Port:** 5432
- **Database:** myz_test_db
- **User:** test_user
- **Password:** test_password

These credentials are configured in `test/setup.ts` and will be automatically used by tests.

## Running Tests

Once the database is set up:

```bash
# Run all tests
npm test

# Run only API tests
npm run test:api

# Run only unit tests (no database required)
npm run test:unit
```

## Troubleshooting

### PostgreSQL not installed

**macOS:**
```bash
brew install postgresql@14
brew services start postgresql
```

**Linux:**
```bash
sudo apt-get install postgresql-14
sudo systemctl start postgresql
```

### Permission denied

If you get permission errors, you may need to configure PostgreSQL to allow local connections:

1. Edit `/etc/postgresql/14/main/pg_hba.conf` (Linux) or `/usr/local/var/postgres/pg_hba.conf` (macOS)
2. Add or modify this line:
   ```
   local   all             all                                     trust
   host    all             all             127.0.0.1/32            md5
   ```
3. Restart PostgreSQL:
   ```bash
   sudo systemctl restart postgresql  # Linux
   brew services restart postgresql    # macOS
   ```

### Database already exists

If you need to reset the test database:

```bash
sudo -u postgres psql -c "DROP DATABASE IF EXISTS myz_test_db;"
sudo -u postgres psql -c "CREATE DATABASE myz_test_db OWNER test_user;"
npm run migrate
```

## CI/CD Environment

GitHub Actions automatically sets up PostgreSQL with the same credentials using the `postgres` service in `.github/workflows/service-tests.yml`. No manual setup is needed for CI/CD.

## Test Mode Features

When `NODE_ENV=test`, the service behaves differently:

1. **Email Sending:** Disabled (logs to console instead)
2. **Captcha Validation:** Optional (for easier testing)
3. **OAuth Initialization:** Conditional (skips if credentials missing)

This allows tests to run without external dependencies like SMTP servers.
