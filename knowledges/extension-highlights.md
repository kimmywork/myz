# MyZ Extension Highlight Resilience

## Chrome Action Badge
- The background service worker (files under `extension/src/background/`) exposes `messageHandlers["myz:updateBadge"]`; it validates the tab id, clamps counts, and sets badge text/background (text color when supported).
- Content scripts call `syncBadgeWithBackground()` only when running in the top-level frame. Keep the `window.top === window` guard when adjusting this flow.
- Badge value is updated after restore, create, delete, or import flows by calling `updateHighlightIndicators()`.

## Unreachable Highlight Surfacing
- Content script maintains an `unreachableHighlights` Set. Any record that fails to reapply before `HIGHLIGHT_REAPPLY_TIMEOUT` is added, and cleared when a later apply succeeds.
- `buildHighlightStateSnapshot()` returns `{ count, unreachableIds, unreachableCount }`. UIs (Popup / Dashboard) request this via `myz:getHighlightState` to flag list entries with warning styling — in the migrated code the UIs live under `extension/src/popup/` and `extension/src/dashboard/` and use Vue composables to surface the state.
- Toast notifications are triggered once per failure batch in `attemptHighlightReapply()`; keep the deadline + observer loop intact when modifying highlight application.

## Highlight Styles & Storage
- `HIGHLIGHT_STYLES` currently exposes `paint`, `underline`, and `wavy`. Both content + background modules share the same helper (`normalizeHighlightStyle`) to guarantee persistence consistency.
- CSS classes (`.myz-highlight--underline`, `.myz-highlight--wavy`) must only add underline decorations. Avoid applying `font-weight`, `line-height`, or other typography overrides that would leak into site content.
- Style picker components in the Popup/Dashboard are implemented as Vue JSX components; their options derive from `HIGHLIGHT_STYLE_OPTIONS`. Update icons/labels there to keep popup, dashboard, and inspector previews aligned.
- Only highlight records store `color` / `style`; text-only saves (`kind: "clip"`) should set these fields to `null` so LogSeq sync and exports skip them.

## JSON Import Conflict Strategies
- `messageHandlers["myz:importHighlights"]` accepts a `strategy` of `skip`, `overwrite`, or `latest`.
- Imports normalise records (ids, ranges, timestamps, tags) via `sanitizeImportedHighlight`, dedupe by ID and selection signature, and reuse existing timestamps if missing.
- Dashboard UI (now under `extension/src/dashboard/`) exposes a file picker + dropdown and displays an import summary (`新增 / 更新 / 跳过`). When adjusting the import flow, update the background handler, the dashboard composable, and the popup entry point together.
