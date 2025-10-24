# GitHub Actions Workflows

## Service Tests Workflow

**File**: `.github/workflows/service-tests.yml`

This workflow automatically runs all tests for the backend service on every pull request and push to main/master branches.

### What It Does

1. **Setup Environment**
   - Checks out the code
   - Sets up Node.js 18
   - Starts PostgreSQL test database
   - Installs npm dependencies
   - Installs Playwright browsers

2. **Quality Checks**
   - Runs ESLint to check code style
   - Compiles TypeScript to verify no type errors

3. **Test Execution**
   - Unit tests (JWT, storage, captcha utilities)
   - API integration tests (auth, sync endpoints)
   - E2E browser tests (complete UI flows)

4. **Artifacts**
   - Uploads test coverage to Codecov
   - Saves Playwright test reports (available for 30 days)

### Triggers

- **Pull Requests**: Any PR targeting main or master branch with service changes
- **Pushes**: Direct pushes to main or master branch with service changes

### Required Secrets

None required for basic functionality. Optional:
- `CODECOV_TOKEN` - For private repo coverage uploads

### Test Database

The workflow uses a PostgreSQL 14 container with:
- Database: `myz_test_db`
- User: `test_user`
- Password: `test_password`
- Port: 5432

### Environment Variables

All tests run with:
- `NODE_ENV=test`
- `JWT_SECRET=test-secret-key-for-ci`
- Database credentials configured for test container

### Viewing Results

1. Go to the **Actions** tab in GitHub
2. Click on the workflow run
3. View individual step logs
4. Download Playwright reports from artifacts

### Local Testing

Before pushing, run the same checks locally:

```bash
cd service
npm run lint
npm run build
npm run test:unit
npm run test:api
npm run test:e2e
```

Or run all at once:

```bash
cd service
npm run lint && npm run build && npm test
```

### Troubleshooting

**Tests fail on CI but pass locally:**
- Check database connection settings
- Ensure all dependencies are in package.json
- Verify Node.js version matches (18)

**E2E tests timeout:**
- Increase timeout in playwright.config.ts
- Check if server starts correctly
- Review Playwright report artifacts

**Coverage not uploaded:**
- Check if CODECOV_TOKEN is set (for private repos)
- Verify codecov action version is up to date
