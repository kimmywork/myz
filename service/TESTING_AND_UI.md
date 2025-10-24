# Web UI Portal and Testing Documentation

## Overview

This update adds a comprehensive web UI portal for user management and extensive testing infrastructure to the MyZ Annotator service.

## New Features

### 1. Web UI Portal

A complete web-based user interface for managing accounts and viewing sync status.

#### Features:
- **User Registration and Login**
  - Email/password authentication
  - Visual captcha for security
  - OAuth integration (Google, GitHub)
  - Password confirmation validation

- **User Dashboard**
  - View account information
  - Check email verification status
  - View sync statistics
  - Browse sync history (recent highlights)
  - Resend verification emails
  - Logout functionality

- **Security**
  - Canvas-based captcha generation
  - Client-side validation
  - Token-based authentication
  - Secure OAuth redirects

#### Accessing the Portal:
Navigate to `http://localhost:3000/` in your browser to access the web UI.

#### Files:
- `public/index.html` - Main HTML structure
- `public/css/style.css` - Responsive styling
- `public/js/captcha.js` - Captcha generation and validation
- `public/js/app.js` - Application logic and API integration

### 2. Captcha System

Server-side canvas-based captcha for enhanced security:
- Generates 6-character alphanumeric codes **on the server**
- Rendered with random colors, rotations, and noise
- **Validates server-side** to prevent client-side bypass
- Stores session in HTTP-only cookies
- One-time use (expires after validation or 5 minutes)
- Auto-refreshes on failed attempts

#### Integration:
- Captcha image generated via `/api/captcha/generate` endpoint
- Session stored in HTTP-only cookie
- Client fetches image and displays in canvas
- Server validates captcha on login/registration
- Refresh button requests new captcha from server

### 3. Comprehensive Testing

#### Unit Tests (`test/unit/`)
Tests for individual utility functions:
- **jwt.test.ts**: JWT token generation, verification, and decoding
- **storage.test.ts**: File storage operations for highlights

Run with:
```bash
npm run test:unit
```

#### API Tests (`test/api/`)
Integration tests for API endpoints:
- **auth.test.ts**: Authentication endpoints (register, login, profile)
- **sync.test.ts**: Synchronization endpoints (status, highlights)

Run with:
```bash
npm run test:api
```

#### E2E Tests (`test/e2e/`)
Browser-based tests using Playwright:
- **portal.test.ts**: Web UI functionality
  - Page loading and navigation
  - Tab switching
  - Captcha display and refresh
  - Form validation
  - OAuth buttons
  - Responsive design
  - Error messaging

Run with:
```bash
npm run test:e2e
```

#### Test Configuration:
- **jest.config.js**: Jest configuration for unit and API tests
- **playwright.config.ts**: Playwright configuration for E2E tests
- **test/setup.ts**: Test environment setup

#### Running All Tests:
```bash
npm test  # Runs all Jest tests with coverage
```

#### Test Coverage:
```bash
npm test  # Generates coverage report in coverage/ directory
```

## Technical Changes

### Backend Updates

#### Modified Files:
1. **src/index.ts**
   - Added static file serving for web UI
   - Modified Helmet CSP to allow inline scripts
   - Added path import for directory resolution

2. **src/controllers/oauthController.ts**
   - Updated OAuth callbacks to redirect to web UI
   - Changed success redirect to `/?token=<jwt>`
   - Changed failure redirect to `/?error=authentication_failed`

3. **package.json**
   - Added test scripts (test, test:watch, test:unit, test:api, test:e2e)
   - Added test dependencies (jest, ts-jest, supertest, @playwright/test)

4. **.gitignore**
   - Added test artifact exclusions (test-results/, playwright-report/)

### Dependencies Added

#### Testing:
- `jest` - Test framework
- `ts-jest` - TypeScript support for Jest
- `@types/jest` - TypeScript definitions
- `supertest` - HTTP assertion library
- `@types/supertest` - TypeScript definitions
- `@playwright/test` - E2E testing framework

## Usage Examples

### Web UI Portal

1. **Registration**:
   - Navigate to `http://localhost:3000/`
   - Click "注册" tab
   - Enter email and password
   - Solve the captcha
   - Click "注册" button
   - Check email for verification link

2. **Login**:
   - Navigate to `http://localhost:3000/`
   - Enter credentials
   - Solve the captcha
   - Click "登录" button
   - View dashboard

3. **OAuth Login**:
   - Click "Google 登录" or "GitHub 登录"
   - Authorize in the provider's page
   - Automatically redirected back with token

### Running Tests

```bash
# Install dependencies
npm install

# Run all tests
npm test

# Run unit tests only
npm run test:unit

# Run API tests only
npm run test:api

# Run E2E tests
npm run test:e2e

# Watch mode for development
npm run test:watch
```

### Test Output

#### Coverage Report:
```
-------------------------|---------|----------|---------|---------|-------------------
File                     | % Stmts | % Branch | % Funcs | % Lines | Uncovered Line #s
-------------------------|---------|----------|---------|---------|-------------------
All files                |   85.23 |    78.45 |   90.12 |   86.77 |
 utils/jwt.ts            |   100   |    100   |   100   |   100   |
 utils/storage.ts        |   95.65 |    87.50 |   100   |   96.15 | 45-46
-------------------------|---------|----------|---------|---------|-------------------
```

#### Playwright Report:
Test results are available in `playwright-report/index.html` after running E2E tests.

## Security Considerations

### Captcha
- **Server-side generation and validation** prevents client bypass
- Generated using Node.js `canvas` library
- Session stored in HTTP-only cookies
- One-time use prevents replay attacks
- 5-minute expiration window
- Consider adding rate limiting per IP for additional protection

### OAuth Redirects
- Redirects to web UI with token in URL parameter
- Tokens are immediately stored in localStorage
- URL is cleaned after extraction
- Consider using POST requests for production

### Test Database
- Tests use separate test database
- Configured via environment variables
- Database should be cleaned between test runs

## Development Workflow

1. **Make code changes**
2. **Run unit tests**: `npm run test:unit`
3. **Run API tests**: `npm run test:api`
4. **Build project**: `npm run build`
5. **Start server**: `npm run dev`
6. **Run E2E tests**: `npm run test:e2e`
7. **Check coverage**: Review `coverage/index.html`

## Troubleshooting

### Tests Failing
- Ensure database is running: `docker-compose up postgres`
- Check environment variables in `test/setup.ts`
- Clean test data: `npm run migrate` (for test database)

### E2E Tests Timing Out
- Increase timeout in `playwright.config.ts`
- Check server is accessible at `http://localhost:3000`
- Verify `webServer` configuration

### Captcha Not Displaying
- Check browser console for JavaScript errors
- Ensure static files are being served
- Verify CSP settings in `src/index.ts`

## Future Improvements

1. **Enhanced Captcha**
   - Integrate Google reCAPTCHA as alternative
   - Add audio captcha for accessibility
   - Implement difficulty levels
   - Add IP-based rate limiting

2. **More Tests**
   - Test email verification flow
   - Test sync conflict resolution
   - Test OAuth provider interactions
   - Performance testing
   - Captcha validation edge cases

3. **UI Enhancements**
   - Dark mode support
   - Internationalization
   - Progressive Web App features
   - Advanced sync history filtering

4. **Accessibility**
   - ARIA labels
   - Keyboard navigation
   - Screen reader support
   - High contrast mode
   - Audio captcha alternative

## Screenshots

### Login Page
![Login page with captcha]

### Register Page
![Registration form]

### Dashboard
![User dashboard with sync status]

---

For more information, see:
- [Service API Documentation](../../knowledges/service-api.md)
- [Setup Guide](./SETUP_GUIDE.md)
- [Main README](./README.md)
