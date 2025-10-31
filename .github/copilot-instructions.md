# MyZ Annotator – Copilot Instructions

## Understand the Architecture First
- The extension is a Chrome MV3 extension built with Vite + `@crxjs/vite-plugin`. The UI (Popup / Dashboard) has been migrated to Vue 3 using the Composition API and JSX (`@vitejs/plugin-vue-jsx`). Core runtime pieces remain in `extension/src`:
	- Service worker (background) and helpers: `extension/src/background/` (service worker modules such as `badge.js`, `logseq.js`, `storage.js`, etc.).
	- Content script and page-level helpers: `extension/src/content/` (content script + DOM helpers + CSS).
	- UI (Vue 3 + JSX) components: `extension/src/popup/` and `extension/src/dashboard/` (components written using Vue Composition API with JSX syntax). `extension/src/shared/` contains composables and shared utilities used by UIs and content scripts.
- State still lives in `chrome.storage.local` under the existing namespaces (`myz::highlights`, `myz::settings`). Keep using the storage helpers (`readState` / `writeState`) to normalise shape and prune invalid `order` entries.
- Background service worker continues to expose a message bus (`messageHandlers[...]`) consumed by the content script and UIs. Reuse existing handlers rather than inventing new message types when possible.
- LogSeq sync is orchestrated from the background service worker (files under `extension/src/background/`) via `callLogseq`. That pipeline already handles endpoint discovery, authentication headers, incremental inserts, and UUID bookkeeping—extend it rather than bypassing it.
- The background action badge is still controlled through `messageHandlers["myz:updateBadge"]`; content scripts call it via `syncBadgeWithBackground()` when running in the top-level frame. Do not reintroduce DOM badges on the toolbar itself.

## Patterns to Follow
- Use `readState`/`writeState` helpers when mutating highlights; they normalise storage shape and prune invalid `order` entries.
- `sortedHighlights` defines canonical ordering (newest first). Any UI that lists highlights should depend on this sort to keep behaviour consistent.
- When generating LogSeq payloads, go through `buildHighlightBlock`, `makeBlock`, and the markdown helpers (`htmlToMarkdown`, `cleanLogseqMultiline`, `normalizePreBlock`). They enforce the single-colon metadata rule and strip syntax-highlighting spans in `<pre>` blocks.
- All LogSeq RPCs must be JSON-RPC calls through `callLogseq({ endpoint, token, method, args })`; it handles response parsing and error surfacing. Service worker cannot rely on DOM APIs—never reintroduce `DOMParser` or similar.
- UI components now use Vue Composition API with JSX. When editing UI components prefer composables in `extension/src/shared/` over adding logic directly into a component. Keep presentational logic separate from cross-target helpers used by background/content scripts.
- Toolbar logic in `content.js` keeps the floating actions pinned while scrolling; if you touch selection handling, preserve `state.toolbarRange` updates and the debounce animation frame pattern.
- Range serialization lives in `extension/src/shared/serializer.js`. It temporarily unwraps `.myz-highlight` wrappers (`unwrapNode`) and records element + `charOffset` paths before reapplying cached highlights. Always call `serializeRange` / `deserializeRange` instead of reimplementing DOM traversal so restored highlights keep tracking original nodes.
- `handleAnnotateClick` enforces the non-overlap rule by checking the live selection against existing `.myz-highlight` nodes and calling `showNotification("所选文本包含已有标注，无法创建新的标注")`. Keep this guard in place and update tests if behaviour changes.
- Tag pickers (content modal + dashboard) share behaviour: multi-select, comma-to-create, backspace delete, dropdown filtering. Reuse the existing composable utilities when tweaking UI logic.
- Highlight styles are enumerated via `HIGHLIGHT_STYLES`; rely on `normalizeHighlightStyle` / `describeHighlightStyle` when persisting or presenting styles. Content CSS must keep underline / wavy modes decoration-only—never change font weight or line height of the original text.
- Record `kind` distinguishes visual highlights from text-only saves. Use existing downgrade helpers instead of clearing ranges manually; only highlight records should carry `color` / `style` metadata.
- Highlight restoration relies on `highlightReapplyState` plus the `unreachableHighlights` set. If reworking apply logic, fire `markHighlightForReapply` for failures and maintain the toast notification + deadline behaviour.
- Popup/Dashboard UIs communicate with the background via the same messageHandlers; ensure serialisable payloads (no functions, DOM nodes) and guard access when running inside iframes.

## Workflows & Testing
- Manual testing remains the primary loop: generate a build and load the unpacked `dist/` (or equivalent output) via `chrome://extensions` and reload after code changes to background/content scripts. UI components can be previewed faster during development with Vite's dev server and JSX HMR.
- For LogSeq validation, ensure the desktop app has HTTP API + token enabled (see `knowledges/logseq-http-api.md`) and watch the service worker console for `callLogseq` logs.
- Screenshot capture uses `chrome.tabs.captureVisibleTab`; the sequence still clears selection ranges, waits two `requestAnimationFrame` ticks, captures, then restores ranges—preserve this sequencing to avoid capturing native highlights.
- When expanding scope or changing behaviours, mirror the user journeys in `docs/acceptance-criteria.md` and add or update Playwright specs under `extension/tests/` alongside code changes.
- The extension CI workflow (`.github/workflows/extension-ci.yml`) builds via `npm run build` then runs the headed Playwright suite with report uploads. Keep the workflow green when adjusting scripts or dependencies.

### Playwright E2E tests and CI

- We maintain an end-to-end test suite under `extension/tests/` using Playwright Test. These tests launch a headed Chromium with a temporary user data directory and load the built extension from `extension/dist`.
- Key flows covered: toolbar selection, apply highlight, save-as-clip (保存文字), inspector copy/edit/delete, dashboard list/edit/downgrade/import/export, complex DOM fixture highlights and export, screenshot capture (download verification), bulk import and infinite-scroll.

CI workflow expectations:

- Before running Playwright tests, build the extension (`npm run build`) so the tests load `extension/dist`.
	- IMPORTANT: Always run `npm run build` in the `extension/` folder before running Playwright tests locally or in CI. Make this a required step in any test workflow so Playwright loads the built `extension/dist` output (failure to build first is a common cause of test timeouts/failures).
- Tests must run in headed mode (Playwright `headless: false` set in `tests/playwright.config.ts`). On Linux CI runners use `xvfb-run` or Playwright's Docker image to provide a virtual display.
- Collect artifacts on CI: HTML report (`playwright-report`), traces and videos when available. The CI workflow should upload these artifacts on success or failure to help triage flaky failures.

If you add or change any content script, toolbar, modal behavior or background message handlers, add or update a Playwright test that covers the end-to-end flow (selection → toolbar → modal → background save → dashboard record). 

## Common Pitfalls
- Never write the `color` property into LogSeq blocks; it creates unwanted pages. Metadata should use single colon separators (`ID:`, `标签:` etc.).
- Incremental sync expects stored `logseqBlockUuid` values. If you alter highlight persistence, preserve those fields or update the sync reconciliation logic.
- Markdown export and LogSeq sync both rely on the HTML→Markdown helpers—keep them in sync to avoid divergent output.
- Background service worker runs as a module. Avoid introducing globals outside the existing pattern or synchronous APIs that block the event loop. Also keep in mind service workers lack DOM access—do not introduce DOM-dependent code into background modules.
- UI (Vue/JSX) components may include browser-only APIs; ensure helper functions that are shared with service worker are environment-agnostic or split into browser-only vs worker-safe helpers.

## Useful References
- `knowledges/logseq-http-api.md` summarises the expected LogSeq RPC flow and insert semantics.
- `extension/README.md` documents user-facing behaviour; keep it updated when introducing new UI or sync flows.
- `package.json` scripts in `extension/` (`dev`, `build`) and `vite.config.*` (with `@crxjs/vite-plugin`) describe the local dev / build workflow—prefer to follow those scripts rather than inventing new commands.

## MyZ Sync Service – Copilot Instructions
- Located in `service/` and built with Next.js App Router + Drizzle (PostgreSQL). Respect the split between API routes under `src/app/api/**` and the management portal under `src/app/**`. Avoid adding pages that bypass existing auth/session helpers.
- Server state: user metadata and sync history live in Postgres (`users`, `sync_states`, `sync_records`); raw highlight payloads live on disk via `src/lib/storage.ts`. Keep payload writes idempotent and JSON-based to preserve the future end-to-end encryption plan.
- Reuse helpers: authentication goes through `requireAuthenticatedUser`, sessions via `lib/auth/session.ts`, captcha through `lib/captcha.ts`, and sync utilities in `lib/sync.ts`. Extend these modules instead of duplicating logic.
- Tests: Jest integration tests use Testcontainers (requires Docker) and live under `service/__tests__`. Playwright smoke tests in `service/tests/e2e` also start a disposable PostgreSQL container via Testcontainers and run with `NEXT_PUBLIC_DISABLE_AUTO_REDIRECT=1` to keep login flows stable.
- Environment: see `service/src/lib/env.ts` for required variables. Local dev typically sets `DATABASE_URL`, `STORAGE_ROOT`, and `CAPTCHA_MODE`. CI and Playwright rely on the same schema, so avoid introducing ad-hoc env checks.
- Documentation: keep `knowledges/service-api.md` aligned with any API changes and update `service/README.md` when setup steps move.
