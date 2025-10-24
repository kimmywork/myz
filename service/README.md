## MyZ Sync Service

This package hosts the HTTP service that powers the MyZ Annotator browser extension. It provides user registration, email verification, session management, captcha protection, OAuth logins, and an incremental sync API backed by PostgreSQL plus file-based payload storage. The Next.js App Router also exposes a small management portal for end users.

### Tech Stack

- Next.js App Router (Node runtime)
- Drizzle ORM with PostgreSQL
- File snapshot storage under `STORAGE_ROOT`
- Zod validation, bcrypt for passwords, and custom math captcha
- Jest + Testcontainers for API integration tests
- Playwright for portal smoke tests

### Prerequisites

- Node.js 20+
- Docker (required for the Jest integration suite via Testcontainers)
- A PostgreSQL database (local or managed)

### Environment Variables

Create a `.env.local` next to this README with the minimum configuration:

```bash
DATABASE_URL=postgres://user:password@localhost:5432/myz
STORAGE_ROOT=./storage
CAPTCHA_MODE=builtin
```

Optional variables include `CAPTCHA_BYPASS_TOKEN`, `GOOGLE_OAUTH_*`, `GITHUB_OAUTH_*`, SMTP credentials, and `ALLOWED_ORIGINS`. See `src/lib/env.ts` for the full list.

### Database Migrations

```bash
npm install
npm run db:migrate
```

The schema lives under `drizzle/migrations`. To generate new SQL from schema changes use `npm run db:generate`.

### Local Development

```bash
npm install
npm run dev
```

The portal is available at `http://localhost:3000`. Registering or logging in from the UI exercises the same APIs consumed by the browser extension.

### Testing

- **Integration suite:** `npm test` (pulls a disposable PostgreSQL container).
- **Watch mode:** `npm run test:watch`.
- **Playwright smoke tests:** `npx playwright install --with-deps` once, then `npm run test:e2e` (requires Docker; a disposable PostgreSQL container is launched automatically).

The Playwright configuration boots the Next.js dev server with auto-redirects disabled and relies on network interception to avoid mutating the real database.

### Linting

```bash
npm run lint
```

### Storage Layout

Per-user snapshots live at `${STORAGE_ROOT}/{userId}/latest.json`. Incremental change sets are written under `${STORAGE_ROOT}/{userId}/versions/{version}.json`. The sync APIs rely on this layout—avoid manual edits unless you intend to reset a user’s data.

### Captcha

The built-in captcha generates simple math challenges stored in the `captcha_challenges` table. For automation or staging scenarios you can set `CAPTCHA_MODE=test-bypass` with `CAPTCHA_BYPASS_TOKEN` to accept a known answer.
