# MyZ Extension Highlight Resilience

## Chrome Action Badge
- `extension/src/background.js` exposes `messageHandlers["myz:updateBadge"]`; it validates the tab id, clamps counts, and sets badge text/background (text color when supported).
- Content scripts call `syncBadgeWithBackground()` only when running in the top-level frame. Keep the `window.top === window` guard when adjusting this flow.
- Badge value is updated after restore, create, delete, or import flows by calling `updateHighlightIndicators()`.

## Unreachable Highlight Surfacing
- Content script maintains an `unreachableHighlights` Set. Any record that fails to reapply before `HIGHLIGHT_REAPPLY_TIMEOUT` is added, and cleared when a later apply succeeds.
- `buildHighlightStateSnapshot()` returns `{ count, unreachableIds, unreachableCount }`. Popups request this via `myz:getHighlightState` to flag list entries with warning styling.
- Toast notifications are triggered once per failure batch in `attemptHighlightReapply()`; keep the deadline + observer loop intact when modifying highlight application.

## JSON Import Conflict Strategies
- `messageHandlers["myz:importHighlights"]` now accepts a `strategy` of `skip`, `overwrite`, or `latest`.
- Imports normalise records (ids, ranges, timestamps, tags) via `sanitizeImportedHighlight`, dedupe by ID and selection signature, and reuse existing timestamps if missing.
- Dashboard settings page (`extension/dashboard/index.html`) exposes a file picker + dropdown and displays an import summary (`新增 / 更新 / 跳过`). Update all three touchpoints together when adjusting the import flow.
