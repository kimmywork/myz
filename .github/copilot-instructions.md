# MyZ Annotator – Copilot Instructions

## Understand the Architecture First
- Chrome MV3 extension split across `extension/src/background.js` (service worker), `extension/src/content/content.js` (content script UI/DOM), `extension/popup/*`, and `extension/dashboard/*` (options UI). State lives entirely in `chrome.storage.local` under `myz::highlights` and `myz::settings`.
- Background worker exposes a message bus (`messageHandlers[...]`) consumed by the content script, popup, and dashboard. Reuse existing handlers instead of inventing new message types when possible.
- LogSeq sync is orchestrated from `background.js` via `callLogseq`. It already handles endpoint discovery, authentication headers, incremental inserts, and UUID bookkeeping—extend that pipeline, don’t bypass it.
- The background action badge is controlled exclusively through `messageHandlers["myz:updateBadge"]`; content scripts call it via `syncBadgeWithBackground()` when they are the top-level frame. Do not reintroduce DOM badges on the toolbar itself.

## Patterns to Follow
- Use `readState`/`writeState` helpers when mutating highlights; they normalise storage shape and prune invalid `order` entries.
- `sortedHighlights` defines canonical ordering (newest first). Any UI that lists highlights should depend on this sort to keep behaviour consistent.
- When generating LogSeq payloads, go through `buildHighlightBlock`, `makeBlock`, and the markdown helpers (`htmlToMarkdown`, `cleanLogseqMultiline`, `normalizePreBlock`). They enforce the single-colon metadata rule and strip syntax-highlighting spans in `<pre>` blocks.
- All LogSeq RPCs must be JSON-RPC calls through `callLogseq({ endpoint, token, method, args })`; it handles response parsing and error surfacing. Service worker cannot rely on DOM APIs—never reintroduce `DOMParser` or similar.
- Toolbar logic in `content.js` keeps the floating actions pinned while scrolling; if you touch selection handling, preserve `state.toolbarRange` updates and the debounce animation frame pattern.
- Tag pickers (content modal + dashboard) share behaviour: multi-select, comma-to-create, backspace delete, dropdown filtering. Use the existing component utilities when tweaking UI logic.
- Highlight restoration relies on `highlightReapplyState` plus the `unreachableHighlights` set. If reworking apply logic, fire `markHighlightForReapply` for failures and maintain the toast notification + deadline behaviour.
- Popup pulls unreachable metadata through `myz:getHighlightState`; ensure any new state you expose is serialisable and guarded against frames without access.

## Workflows & Testing
- Manual testing is the primary loop: load the unpacked `extension` folder via `chrome://extensions` and reload after code changes.
- For LogSeq validation, ensure the desktop app has HTTP API + token enabled (see `knowledges/logseq-http-api.md`) and watch the service worker console for `callLogseq` logs.
- Screenshot capture uses `chrome.tabs.captureVisibleTab`; we now clear the selection ranges, wait for two `requestAnimationFrame` ticks, capture, then restore the stored ranges. Preserve this sequencing to avoid capturing native highlights.

## Common Pitfalls
- Never write the `color` property into LogSeq blocks; it creates unwanted pages. Metadata should use single colon separators (`ID:`, `标签:` etc.).
- Incremental sync expects stored `logseqBlockUuid` values. If you alter highlight persistence, preserve those fields or update the sync reconciliation logic.
- Markdown export and LogSeq sync both rely on the HTML→Markdown helpers—keep them in sync to avoid divergent output.
- Background js runs as a module. Avoid introducing globals outside the existing pattern or synchronous APIs that block the event loop.

## Useful References
- `knowledges/logseq-http-api.md` summarises the expected LogSeq RPC flow and insert semantics.
- `extension/README.md` documents user-facing behaviour; keep it updated when introducing new UI or sync flows.

## MyZ Sync Service – Copilot Instructions
- Located in `service/` and built with Next.js App Router + Drizzle (PostgreSQL). Respect the split between API routes under `src/app/api/**` and the management portal under `src/app/**`. Avoid adding pages that bypass existing auth/session helpers.
- Server state: user metadata and sync history live in Postgres (`users`, `sync_states`, `sync_records`); raw highlight payloads live on disk via `src/lib/storage.ts`. Keep payload writes idempotent and JSON-based to preserve the future end-to-end encryption plan.
- Reuse helpers: authentication goes through `requireAuthenticatedUser`, sessions via `lib/auth/session.ts`, captcha through `lib/captcha.ts`, and sync utilities in `lib/sync.ts`. Extend these modules instead of duplicating logic.
- Tests: Jest integration tests use Testcontainers (requires Docker) and live under `service/__tests__`. Playwright smoke tests in `service/tests/e2e` also start a disposable PostgreSQL container via Testcontainers and run with `NEXT_PUBLIC_DISABLE_AUTO_REDIRECT=1` to keep login flows stable.
- Environment: see `service/src/lib/env.ts` for required variables. Local dev typically sets `DATABASE_URL`, `STORAGE_ROOT`, and `CAPTCHA_MODE`. CI and Playwright rely on the same schema, so avoid introducing ad-hoc env checks.
- Documentation: keep `knowledges/service-api.md` aligned with any API changes and update `service/README.md` when setup steps move.
