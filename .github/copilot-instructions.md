# MyZ Annotator – Copilot Instructions

## Understand the Architecture First
- Chrome MV3 extension split across `extension/src/background.js` (service worker), `extension/src/content/content.js` (content script UI/DOM), `extension/popup/*`, and `extension/dashboard/*` (options UI). State lives entirely in `chrome.storage.local` under `myz::highlights` and `myz::settings`.
- Background worker exposes a message bus (`messageHandlers[...]`) consumed by the content script, popup, and dashboard. Reuse existing handlers instead of inventing new message types when possible.
- LogSeq sync is orchestrated from `background.js` via `callLogseq`. It already handles endpoint discovery, authentication headers, incremental inserts, and UUID bookkeeping—extend that pipeline, don’t bypass it.

## Patterns to Follow
- Use `readState`/`writeState` helpers when mutating highlights; they normalise storage shape and prune invalid `order` entries.
- `sortedHighlights` defines canonical ordering (newest first). Any UI that lists highlights should depend on this sort to keep behaviour consistent.
- When generating LogSeq payloads, go through `buildHighlightBlock`, `makeBlock`, and the markdown helpers (`htmlToMarkdown`, `cleanLogseqMultiline`, `normalizePreBlock`). They enforce the single-colon metadata rule and strip syntax-highlighting spans in `<pre>` blocks.
- All LogSeq RPCs must be JSON-RPC calls through `callLogseq({ endpoint, token, method, args })`; it handles response parsing and error surfacing. Service worker cannot rely on DOM APIs—never reintroduce `DOMParser` or similar.
- Toolbar logic in `content.js` keeps the floating actions pinned while scrolling; if you touch selection handling, preserve `state.toolbarRange` updates and the debounce animation frame pattern.
- Tag pickers (content modal + dashboard) share behaviour: multi-select, comma-to-create, backspace delete, dropdown filtering. Use the existing component utilities when tweaking UI logic.

## Workflows & Testing
- Manual testing is the primary loop: load the unpacked `extension` folder via `chrome://extensions` and reload after code changes.
- For LogSeq validation, ensure the desktop app has HTTP API + token enabled (see `knowledges/logseq-http-api.md`) and watch the service worker console for `callLogseq` logs.
- Screenshot capture uses `chrome.tabs.captureVisibleTab`; if you change it, maintain the selection-suppression logic so the highlight overlay isn’t captured.

## Common Pitfalls
- Never write the `color` property into LogSeq blocks; it creates unwanted pages. Metadata should use single colon separators (`ID:`, `标签:` etc.).
- Incremental sync expects stored `logseqBlockUuid` values. If you alter highlight persistence, preserve those fields or update the sync reconciliation logic.
- Markdown export and LogSeq sync both rely on the HTML→Markdown helpers—keep them in sync to avoid divergent output.
- Background js runs as a module. Avoid introducing globals outside the existing pattern or synchronous APIs that block the event loop.

## Useful References
- `knowledges/logseq-http-api.md` summarises the expected LogSeq RPC flow and insert semantics.
- `extension/README.md` documents user-facing behaviour; keep it updated when introducing new UI or sync flows.
