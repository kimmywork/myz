# Repository Guidelines

## Project Structure & Module Organization
- `service/`: Nuxt 4 web service (Vue 3.5 + JSX, TypeScript). Source in `service/src`, pages under `service/src/pages/**`, layouts in `service/src/layouts/**`, shared logic in `service/src/lib/**`, assets in `service/public/`.
- `myz-annotator/`: Chrome MV3 extension bundled with Vite + `@crxjs/vite-plugin`. Background modules live in `myz-annotator/src/background/**`, content scripts and DOM helpers in `myz-annotator/src/content/**`, UI components in `myz-annotator/src/popup/**` and `myz-annotator/src/dashboard/**`, shared composables/utilities in `myz-annotator/src/shared/**`.
- `myz-danmaku/`: Chrome MV3 extension built with Vite + `@crxjs/vite-plugin` and TypeScript. Background worker in `myz-danmaku/src/background.ts`, content script and overlay styles in `myz-danmaku/src/content.ts` / `myz-danmaku/src/content.css`, popup UI in `myz-danmaku/src/popup/**`, manifest in `myz-danmaku/src/manifest.ts`.
- `vectoria/`: Client-side vector search engine library. Source in `vectoria/src`, demo UI in `vectoria/ui`, built with Vite in library mode.
- `tests/`: Root docs and URL helpers; package-specific suites live alongside each project (e.g., `myz-annotator/tests/**`, `service/tests/**`).
- `docs/` and `docs/knowledges/`: Design notes, prompts, and technical references.

## Build, Test, and Development Commands
Service (`cd service`):
- `npm run dev` — Start Nuxt dev server.
- `npm run build` / `npm run start` — Build and preview production bundle.
- `npm run lint` — ESLint across the repo.
- `npm test` / `npm run test:e2e` — Jest unit/integration; Playwright e2e (export `TESTCONTAINERS_RYUK_DISABLED=true` when running locally).
- `npm run db:migrate` / `npm run db:generate` — Drizzle migrations and types.

Extension (`cd myz-annotator`):
- `npm run dev` — Vite dev server for the myz-annotator.
- `npm run build` — Type-check (`vue-tsc`) then bundle via Vite.
- `npm run lint` / `npm run format` — ESLint and Prettier.
- `npm run test:dev` / `npm run test:playwright` — Jest unit; Playwright e2e.

Danmaku (`cd myz-danmaku`):
- `npm run dev` — Vite dev server for MyZ Danmaku.
- `npm run build` — Bundle MV3 extension to `dist/`.
- `npm run lint` / `npm run typecheck` — ESLint and TypeScript checks.
- `npm run icons` — Generate multi-size PNG icons from `assets/icons/icon-template.svg`.

Vectoria (`cd vectoria`):
- `npm run dev` — Start Vite dev server for the demo.
- `npm run build` — Build the library in library mode (outputs to `dist/`).
- `npm run build:docs` — Build the static documentation site (demo + perf test) to `docs/` for GitHub Pages.

## Coding Style & Naming Conventions
- Indentation: 2 spaces; avoid semicolons in JS; TypeScript in `service/` and selective areas of `myz-annotator/`.
- Components: PascalCase files (e.g., `HighlightCard.jsx`). Utilities/constants: kebab- or camel-case (e.g., `utils/messaging.js`).
- Linting: `service/eslint.config.mjs`, `myz-annotator/eslint.config.mjs`; Prettier used in `myz-annotator/`.

## myz-annotator Playbook

### Architecture Overview
- The myz-annotator is Chrome MV3 built with Vite + `@crxjs/vite-plugin` and Vue 3 Composition API using JSX.
- Service worker modules live in `myz-annotator/src/background/` (e.g., `badge.js`, `logseq.js`, `storage.js`).
- Content scripts and DOM helpers live in `myz-annotator/src/content/`.
- Popup and dashboard UIs live in `myz-annotator/src/popup/` and `myz-annotator/src/dashboard/`, with shared composables/utilities in `myz-annotator/src/shared/`.
- The background badge is controlled through `messageHandlers["myz:updateBadge"]`; content scripts call `syncBadgeWithBackground()` when they run in the top-level frame.

### Patterns to Follow
- Use `readState`/`writeState` when mutating highlights to normalise storage and prune invalid `order` entries.
- Always list highlights via `sortedHighlights` so newest-first ordering stays consistent.
- Build LogSeq payloads with `buildHighlightBlock`, `makeBlock`, `htmlToMarkdown`, `cleanLogseqMultiline`, and `normalizePreBlock` to enforce metadata format and strip `<pre>` spans correctly.
- Call LogSeq through `callLogseq({ endpoint, token, method, args })`; the helper handles JSON-RPC semantics and error surfacing.
- Keep cross-target behaviour inside composables under `myz-annotator/src/shared/` instead of duplicating logic inside individual Vue components.
- Preserve toolbar behaviour by maintaining `state.toolbarRange` updates and the requestAnimationFrame debounce pattern when working on selection handling.
- Serialise ranges with `serializeRange` and `deserializeRange` from `myz-annotator/src/shared/serializer.js` so highlight restoration keeps element and offset tracking accurate.
- `handleAnnotateClick` must continue to block overlapping highlights and trigger `showNotification("所选文本包含已有标注，无法创建新的标注")` when the guard trips.
- Reuse shared tag picker utilities so multi-select, comma-to-create, backspace delete, and dropdown filtering stay aligned across modal and dashboard.
- Persist highlight appearance via `HIGHLIGHT_STYLES` alongside `normalizeHighlightStyle` and `describeHighlightStyle`; underline and wavy modes must remain decoration-only.
- Distinguish visual highlights from text-only saves through the `kind` field and downgrade helpers rather than clearing DOM ranges directly.
- When reapplying highlights, call `markHighlightForReapply` on failures and keep the toast notifications plus deadline handling intact for `highlightReapplyState`.
- Keep popup and dashboard messaging serialisable and route through existing background `messageHandlers` rather than sending DOM nodes or functions.

#### Zen Mode
- Zen Mode lives in `myz-annotator/src/content/zen.js` with URL→selector mapping in `myz-annotator/src/content/zen-config.js` (`ZEN_SELECTOR_MAP`, first match wins).
- Toggle via messages `"myz:toggleZenMode"`, `"myz:canEnterZenMode"`, `"myz:getZenModeState"`; content sends `"myz:zenModeStateChanged"` when state flips.
- Background registers context menus `myz-zen-mode` (toggle) and `myz-zen-capture` (visible only when enabled); titles update per-tab.
- CSS is injected non-destructively: mark target and ancestors (`.myz-zen-target-keep`, `.myz-zen-ancestor-keep`) and hide others; DOM order and nodes remain unchanged so highlight paths and offsets stay valid.
- Print media styles and capture target image (via context menu) operate on the kept article element only.

### Workflows & Testing
- Manual QA loop: `npm run build` in `myz-annotator/`, load the unpacked `myz-annotator/dist` via `chrome://extensions`, and reload after background or content changes.
- For LogSeq validation, enable the desktop app's HTTP API + token (see `docs/knowledges/logseq-http-api.md`) and monitor service worker logs from `callLogseq`.
- Screenshot capture must continue to clear the selection, wait two `requestAnimationFrame` ticks, capture with `chrome.tabs.captureVisibleTab`, then restore ranges to avoid native highlight artefacts.
- Mirror the user journeys in `docs/acceptance-criteria.md` when adjusting behaviours and add or update Playwright specs under `myz-annotator/tests/` for any end-to-end changes.

### Playwright E2E Tests and CI
- Always run `npm run build` in `myz-annotator/` before executing Playwright so tests load `myz-annotator/dist`.
- The suite runs headed (`headless: false` in `tests/playwright.config.ts`); use `xvfb-run` or Playwright's Docker image on Linux CI.
- Collect HTML reports, traces, and videos as CI artifacts to debug flaky runs.
- Coverage includes toolbar selection, apply highlight, save-as-clip, inspector copy/edit/delete, dashboard list/edit/downgrade/import/export, complex DOM fixtures, screenshot capture, bulk import, and infinite scroll.
- Include Zen Mode toggle, selector mapping, and print/capture behaviours under `myz-annotator/tests/extension/`.

### Common Pitfalls
- Never write the `color` property into LogSeq blocks; metadata must use single-colon separators (e.g., `ID:`, `标签:`).
- Preserve stored `logseqBlockUuid` values when altering persistence so incremental sync remains consistent.
- Keep HTML→Markdown helpers in sync between export and LogSeq pipelines to avoid divergent output.
- The background service worker runs as a module without DOM access; avoid DOM-dependent APIs and synchronous blocking calls.
- Browser-only utilities should stay inside UI components; shared helpers must stay environment-agnostic for worker reuse.

### Useful References
- `docs/knowledges/logseq-http-api.md` for RPC expectations.
- `myz-annotator/README.md` for user-facing behaviour and build steps.
- `myz-annotator/vite.config.*` and `myz-annotator/package.json` for bundling and script conventions.
- `myz-danmaku/README.md` for danmaku behaviours, build steps, and overlay patterns.

## myz-danmaku Playbook

### Architecture Overview
- Chrome MV3 extension built with Vite + `@crxjs/vite-plugin` and TypeScript.
- Background worker (`src/background.ts`) handles IndexedDB caching, badge updates, and message routing.
- Content script (`src/content.ts`) detects YouTube video IDs, fetches comments with timecodes, and renders overlay tracks (`src/content.css`).
- Popup UI (`src/popup/**`) displays parsed danmaku entries and supports manual refresh.

### Patterns to Follow
- Use background worker to persist danmaku snapshots in IndexedDB; read via runtime messages instead of direct DB access from UI.
- Keep overlay minimal and avoid interfering with native YouTube controls; prefer appending non-invasive elements and classes.
- Synchronise entries and badge counts through message passing; degrade gracefully when API calls fail.
- Maintain MV3 worker constraints: no DOM API in background and handle asynchronous operations defensively.

### Workflows & Testing
- Manual QA loop: `npm run build` in `myz-danmaku/`, load `myz-danmaku/dist` via `chrome://extensions` and test on YouTube watch pages.
- Verify overlay rendering, popup list, and badge updates; validate IndexedDB restores on revisit.

### Common Pitfalls
- Avoid blocking the YouTube player's event loop; schedule overlay updates efficiently.
- Ensure timecode parsing is robust to various formats; ignore comments without valid timestamps.
- Respect MV3 lifecycle: reinitialise listeners on worker restart; do not rely on long-lived globals.

## Vectoria Playbook

### Architecture Overview
- Client-side vector search engine using HNSW (Hierarchical Navigable Small World) algorithm and IndexedDB for persistence.
- Supports local embeddings via `@huggingface/transformers` (ONNX/WASM) and remote embeddings (OpenAI).
- Built as a standalone library with a demo UI for testing and performance benchmarking.
- The demo UI runs the `Vectoria` instance inside a Service Worker (`ui/sw.ts`) to keep the main thread responsive.

### Patterns to Follow
- Use `Vectoria` class as the main entry point.
- Configuration is persisted in `localStorage` for the demo UI (`vectoria_local_config`, `vectoria_openai_config`).
- The demo UI (`ui/main.ts`, `ui/perf-test.ts`) communicates with the core library via a `IndexerClient` wrapper.
- `ui/sw.ts` handles the `Vectoria` instance and message passing.

### Workflows & Testing
- `npm run dev` to run the local demo.
- `npm run build:docs` to generate the static site for deployment.
- Use `perf-test.html` to benchmark indexing and search performance with different models and batch sizes.

### Common Pitfalls
- Large models (e.g., >500MB) may require significant download time and memory; handle loading states gracefully.
- Ensure `optimizeDeps.exclude` in `vite.config.ts` includes `@huggingface/transformers` to avoid bundling issues with WASM.
- The `docs/` folder is the build artifact for GitHub Pages; do not edit files in `docs/` directly.

## MyZ Sync Service Playbook

### Architecture & Layout
- Nuxt 4.2 on Nitro with Vue 3.5 + JSX; routes live in `src/pages/**`, shared modules in `src/lib/**`, and layouts in `src/layouts/**`.

### Styling
- Tailwind and PostCSS source from `src/assets/globals.pcss`; keep `@tailwind` directives there and let Nuxt's pipeline expand utilities.

### Server State & Auth
- User metadata and sync state live in Postgres tables `users`, `sync_states`, `sync_records`; highlight payloads persist on disk via `src/lib/storage.ts`.
- Reuse `requireAuthenticatedUser`, `lib/auth/session.ts`, captcha helpers in `lib/captcha.ts`, and sync utilities in `lib/sync.ts` instead of duplicating flows.
- Components should call `useRequestFetch()` or `useFetch()`; `$fetch` is not injected for JSX files.

### Email Verification Flow
- `/verify-email` renders server-side with `definePageMeta({ ssr: true })` and requires users to submit both token and email to `/api/auth/verify-email`; only matching pairs succeed, preventing token guessing and double-render state drift.

### Testing
- Jest integration tests live in `service/__tests__/` and rely on Testcontainers, so Docker must be available.
- Playwright smoke tests live in `service/tests/e2e`; run them with Docker, `NUXT_PUBLIC_DISABLE_AUTO_REDIRECT=1`, and `TESTCONTAINERS_RYUK_DISABLED=true` to match CI.

### Environment
- Minimum variables: `DATABASE_URL`, `STORAGE_ROOT`, `CAPTCHA_MODE`; see `src/lib/env.ts` for the full matrix.
- Tailwind, Nuxt, and Drizzle require Node.js 20+ and PostgreSQL connectivity; apply migrations with `npm run db:migrate` and generate SQL with `npm run db:generate`.

### Documentation
- Keep `docs/knowledges/service-api.md` and `service/README.md` aligned with API or authentication changes.

## Testing Guidelines
- Frameworks: Jest (`*.test.ts`/`*.spec.js`) and Playwright (`tests/e2e/**`).
- Service tests: `service/__tests__/` and `service/tests/e2e/**` (email verification flow is SSR and requires token + email inputs; keep coverage in sync).
- myz-annotator tests: `myz-annotator/tests/extension/**` plus fixtures under `myz-annotator/tests/fixtures/**`.
- Aim for meaningful coverage on auth, sync, and UI flows; run e2e before merging.

## Commit & Pull Request Guidelines
- Commits: Present tense, concise scope (e.g., "refactor: auth session"), reference issues/PRs (e.g., `#5`).
- PRs: Provide clear descriptions, linked issues, test plans, screenshots for UI changes, and highlight migrations when touching `service/drizzle/**`.

## Security & Configuration Tips
- Keep secrets in `.env` (service reads via `src/lib/env.ts`). Do not commit `.env`.
- Configure Postgres for Drizzle; manage schema via `service/src/db/schema.ts` and migrations under `service/drizzle/migrations/`.
