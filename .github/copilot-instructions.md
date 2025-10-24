# MyZ Annotator – Copilot Instructions

## Project Overview
MyZ Annotator consists of two main components:
1. **Chrome Extension** (`extension/`) - Browser extension for highlighting and annotating web pages
2. **Backend Service** (`service/`) - Node.js/Express HTTP service for user authentication and cloud synchronization

---

## Chrome Extension Architecture

### Core Structure
- Chrome MV3 extension split across `extension/src/background.js` (service worker), `extension/src/content/content.js` (content script UI/DOM), `extension/popup/*`, and `extension/dashboard/*` (options UI). State lives entirely in `chrome.storage.local` under `myz::highlights` and `myz::settings`.
- Background worker exposes a message bus (`messageHandlers[...]`) consumed by the content script, popup, and dashboard. Reuse existing handlers instead of inventing new message types when possible.
- LogSeq sync is orchestrated from `background.js` via `callLogseq`. It already handles endpoint discovery, authentication headers, incremental inserts, and UUID bookkeeping—extend that pipeline, don't bypass it.

### Patterns to Follow
- Use `readState`/`writeState` helpers when mutating highlights; they normalise storage shape and prune invalid `order` entries.
- `sortedHighlights` defines canonical ordering (newest first). Any UI that lists highlights should depend on this sort to keep behaviour consistent.
- When generating LogSeq payloads, go through `buildHighlightBlock`, `makeBlock`, and the markdown helpers (`htmlToMarkdown`, `cleanLogseqMultiline`, `normalizePreBlock`). They enforce the single-colon metadata rule and strip syntax-highlighting spans in `<pre>` blocks.
- All LogSeq RPCs must be JSON-RPC calls through `callLogseq({ endpoint, token, method, args })`; it handles response parsing and error surfacing. Service worker cannot rely on DOM APIs—never reintroduce `DOMParser` or similar.
- Toolbar logic in `content.js` keeps the floating actions pinned while scrolling; if you touch selection handling, preserve `state.toolbarRange` updates and the debounce animation frame pattern.
- Tag pickers (content modal + dashboard) share behaviour: multi-select, comma-to-create, backspace delete, dropdown filtering. Use the existing component utilities when tweaking UI logic.

### Extension Testing
- Manual testing is the primary loop: load the unpacked `extension` folder via `chrome://extensions` and reload after code changes.
- For LogSeq validation, ensure the desktop app has HTTP API + token enabled (see `knowledges/logseq-http-api.md`) and watch the service worker console for `callLogseq` logs.
- Screenshot capture uses `chrome.tabs.captureVisibleTab`; if you change it, maintain the selection-suppression logic so the highlight overlay isn't captured.

### Common Pitfalls
- Never write the `color` property into LogSeq blocks; it creates unwanted pages. Metadata should use single colon separators (`ID:`, `标签:` etc.).
- Incremental sync expects stored `logseqBlockUuid` values. If you alter highlight persistence, preserve those fields or update the sync reconciliation logic.
- Markdown export and LogSeq sync both rely on the HTML→Markdown helpers—keep them in sync to avoid divergent output.
- Background js runs as a module. Avoid introducing globals outside the existing pattern or synchronous APIs that block the event loop.

---

## Backend Service Architecture

### Core Structure (`service/`)
- **TypeScript + Express** application with strict type checking
- **Authentication**: Email/password with JWT tokens, OAuth (Google, GitHub)
- **Email Verification**: Required before sync access via Nodemailer
- **Server-Side Captcha**: Canvas-based captcha with HTTP-only cookie sessions
- **Data Storage**: PostgreSQL for user metadata, file-based storage for highlights
- **Security**: Helmet.js, CORS, rate limiting (100 req/15min), bcrypt password hashing

### Key Modules
- `src/index.ts` - Express app setup, middleware, routes
- `src/controllers/` - Business logic (auth, sync, captcha, OAuth)
- `src/routes/` - API route definitions
- `src/middleware/` - Authentication, validation (Zod schemas)
- `src/models/` - User and Sync data models
- `src/utils/` - JWT, email, storage, captcha utilities
- `src/config/` - Database config and SQL schema
- `public/` - Web UI portal (HTML, CSS, JavaScript)

### Security Patterns
- **Captcha**: Server-side generation via `canvas` library, validation before auth requests, HTTP-only cookies, one-time use, 5-minute expiration
- **JWT**: Secure tokens with configurable expiration (default 7 days)
- **Passwords**: Hashed with bcrypt before storage
- **Email Verification**: Gates sync features until verified
- **Sessions**: HTTP-only cookies prevent XSS attacks
- **Rate Limiting**: Applied to all API routes

### API Structure
- `POST /api/auth/register` - User registration (requires captcha)
- `POST /api/auth/login` - User login (requires captcha)
- `GET /api/auth/verify-email` - Email verification
- `GET /api/auth/profile` - Get user info (authenticated)
- `GET /api/captcha/generate` - Generate captcha image
- `POST /api/sync/highlights` - Incremental sync (requires verified email)
- `GET /api/sync/status` - Get sync status
- OAuth routes: `/api/auth/google`, `/api/auth/github`

### Testing Requirements
**CRITICAL**: Before pushing any changes to `service/`, you MUST run all tests and ensure they pass:

```bash
cd service
npm run lint      # ESLint checks
npm run build     # TypeScript compilation
npm run test:unit # Unit tests (JWT, storage, captcha)
npm run test:api  # API integration tests
npm run test:e2e  # Playwright browser tests
npm test          # All tests with coverage
```

**Testing Infrastructure:**
- `test/unit/` - Unit tests for utilities (JWT, storage, captcha)
- `test/api/` - Integration tests using supertest
- `test/e2e/` - Browser tests using Playwright
- `jest.config.js` - Jest configuration with coverage
- `playwright.config.ts` - Playwright E2E configuration
- **GitHub Actions**: All tests run automatically on PRs and pushes to main/master

### Service Development Workflow
1. Make code changes in `service/src/`
2. Run `npm run lint` to check code style
3. Run `npm run build` to verify TypeScript compilation
4. Run `npm run test:unit` for quick feedback
5. Run `npm run test:api` for API validation
6. Run `npm run test:e2e` for full UI testing (requires server running)
7. Review coverage report in `coverage/` directory
8. Only commit if all tests pass

### Web UI Portal
- Located in `public/` directory
- Single-page application with login/register forms
- Server-side captcha integration
- User dashboard with sync statistics
- OAuth buttons for Google/GitHub
- Responsive design for mobile/desktop

### Database Schema
- `users` table: id, email, password_hash, email_verified, auth_provider, verification_token, created_at, updated_at
- `sync_metadata` table: user_id, last_sync_at, highlights_count
- `highlights_metadata` table: id, user_id, highlight_id, file_path, deleted, created_at, updated_at
- `sessions` table: id, user_id, token, expires_at

### Common Pitfalls
- Never bypass server-side captcha validation
- Always validate input with Zod schemas
- Don't store sensitive data in client-side storage
- Ensure email verification before allowing sync
- Use `authenticate` middleware for protected routes
- Use `requireVerifiedEmail` for sync routes
- Always use `credentials: 'include'` in frontend fetch calls for cookie support
- Don't commit `.env` files or secrets

---

## CI/CD and Automation

### GitHub Actions Workflow
- **Workflow File**: `.github/workflows/service-tests.yml`
- **Triggers**: Pull requests and pushes to main/master branches
- **Services**: PostgreSQL test database
- **Steps**: Lint → Build → Unit Tests → API Tests → E2E Tests
- **Artifacts**: Test coverage reports, Playwright test results
- **Requirements**: All tests must pass before merging

### Before Committing Service Changes
Run this checklist:
```bash
cd service
npm run lint && npm run build && npm test
```
If any step fails, fix the issues before committing.

---

## Documentation

### Key Documentation Files
- `knowledges/service-api.md` - Complete API reference (Chinese)
- `knowledges/extension-service-integration.md` - Integration guide
- `service/TESTING_AND_UI.md` - Testing and UI portal guide
- `service/SETUP_GUIDE.md` - Setup instructions
- `service/SUMMARY.md` - Architecture overview
- `extension/README.md` - Extension user guide
- `knowledges/logseq-http-api.md` - LogSeq RPC flow

### When to Update Docs
- API changes → Update `service-api.md`
- New features → Update relevant README files
- Architecture changes → Update `SUMMARY.md` and this file
- UI changes → Update `TESTING_AND_UI.md`
- Integration changes → Update `extension-service-integration.md`

---

## Development Rules

### Code Quality
1. **TypeScript**: Strict mode, no implicit any
2. **Linting**: ESLint must pass without errors
3. **Testing**: Maintain >80% code coverage
4. **Security**: Follow OWASP best practices
5. **Documentation**: Update docs with code changes

### Git Workflow
1. Create feature branch from main
2. Make focused, atomic commits
3. Run all tests before pushing
4. Create pull request
5. Wait for CI/CD checks to pass
6. Review and merge

### Pull Request Requirements
- All tests must pass (unit, API, E2E)
- Linting must pass
- TypeScript must compile without errors
- Code coverage maintained or improved
- Documentation updated if needed
- No security vulnerabilities introduced

---

## Useful References
- `knowledges/logseq-http-api.md` - LogSeq RPC flow and insert semantics
- `extension/README.md` - User-facing extension behavior
- `service/TESTING_AND_UI.md` - Service testing and UI guide
- `service/SETUP_GUIDE.md` - Service setup and configuration
- `.github/workflows/service-tests.yml` - CI/CD pipeline configuration
