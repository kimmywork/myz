# Repository Guidelines

## Project Structure & Module Organization
- `service/`: Next.js web service (TypeScript). Source in `service/src`, routes under `service/src/app/**` (`page.tsx`, `route.ts`). Assets in `service/public/`.
- `extension/`: Browser extension (currently React JSX, migrating to Vue). Source in `extension/src`, UI in `extension/src/dashboard/**`, content scripts in `extension/src/content/**`, assets in `extension/assets/`.
- `tests/`: Root docs and URLs for test contexts; project-specific tests live under each package.
- `docs/` and `docs/knowledges/`: Design notes, prompts, and technical references.

## Build, Test, and Development Commands
Service (`cd service`):
- `npm run dev` — Start Next.js dev server.
- `npm run build` / `npm start` — Build and run production.
- `npm run lint` — ESLint across the repo.
- `npm test` / `npm run test:e2e` — Jest unit/integration; Playwright e2e.
- `npm run db:migrate` / `npm run db:generate` — Drizzle migrations and types.

Extension (`cd extension`):
- `npm run dev` — Vite dev server for the extension.
- `npm run build` — Type-check (`vue-tsc`) then bundle via Vite.
- `npm run lint` / `npm run format` — ESLint and Prettier.
- `npm run test:dev` / `npm run test:playwright` — Jest unit; Playwright e2e.

## Coding Style & Naming Conventions
- Indentation: 2 spaces; avoid semicolons in JS; TypeScript in `service/` and selective areas of `extension/`.
- Components: PascalCase files (e.g., `HighlightCard.jsx`). Utilities/constants: kebab- or camel-case (e.g., `utils/messaging.js`).
- Linting: `service/eslint.config.mjs`, `extension/eslint.config.mjs`; Prettier used in `extension/`.

## Testing Guidelines
- Frameworks: Jest (`*.test.ts`/`*.spec.js`) and Playwright (`tests/e2e/**`).
- Service tests: `service/__tests__/` and `service/tests/e2e/**`.
- Extension tests: `extension/tests/extension/**` plus fixtures under `extension/tests/fixtures/**`.
- Aim for meaningful coverage on auth, sync, and UI flows; run e2e before merging.

## Commit & Pull Request Guidelines
- Commits: Present tense, concise scope (e.g., "refactor: auth session"), reference issues/PRs (e.g., `#5`).
- PRs: Clear description, linked issues, test plan, screenshots for UI changes, and notes on migrations when touching `service/drizzle/**`.

## Security & Configuration Tips
- Keep secrets in `.env` (service reads via `src/lib/env.ts`). Do not commit `.env`.
- Configure Postgres for Drizzle; manage schema via `service/src/db/schema.ts` and migrations under `service/drizzle/migrations/`.
