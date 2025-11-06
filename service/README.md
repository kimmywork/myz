## MyZ Sync Service

This package hosts the HTTP service that powers the MyZ Annotator browser extension. It provides user registration, email verification, session management, captcha protection, OAuth logins, and an incremental sync API backed by PostgreSQL plus file-based payload storage. The Nuxt 4.2 application also exposes a small management portal for end users.

### Tech Stack

- Nuxt 4.2 (Vue 3.5 with JSX + Composition API, running on Nitro)
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

Tailwind styles are sourced from `src/assets/globals.pcss` and expanded via the Nuxt + PostCSS pipeline. If you add new utility layers, keep the `@tailwind` directives in that file.

### Email Verification Flow

Visiting `/verify-email` now renders server-side and requires users to submit both the token (from the query string) and their email address. The verification request posts to `/api/auth/verify-email` with `{ token, email }`; only matching pairs succeed. This prevents token guessing from disclosing email addresses and avoids the double-render race that previously caused mismatched states. When updating this flow, keep `definePageMeta({ ssr: true })` in place so the initial render stays deterministic.

### Testing

- **Integration suite:** `npm test` (pulls a disposable PostgreSQL container).
- **Watch mode:** `npm run test:watch`.
- **Playwright smoke tests:** `npx playwright install --with-deps` once, then `npm run test:e2e` (requires Docker; a disposable PostgreSQL container is launched automatically). Set `TESTCONTAINERS_RYUK_DISABLED=true` when running e2e locally to match the CI environment.

The Playwright configuration boots the Nuxt dev server with auto-redirects disabled and relies on network interception to avoid mutating the real database.

### Development Notes

- Use `useRequestFetch()` or `useFetch()` from Nuxt composables instead of the legacy `$fetch`; the latter is not injected in JSX components.
- Prefer `navigateTo` for client-side redirects after login so that session establishment happens before rerouting.

### Linting

```bash
npm run lint
```

### Storage Layout

Per-user snapshots live at `${STORAGE_ROOT}/{userId}/latest.json`. Incremental change sets are written under `${STORAGE_ROOT}/{userId}/versions/{version}.json`. The sync APIs rely on this layout—avoid manual edits unless you intend to reset a user’s data.

### Captcha

The built-in captcha generates simple math challenges stored in the `captcha_challenges` table. For automation or staging scenarios you can set `CAPTCHA_MODE=test-bypass` with `CAPTCHA_BYPASS_TOKEN` to accept a known answer.
