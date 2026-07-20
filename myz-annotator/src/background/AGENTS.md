# myz-annotator Background Architecture

This folder contains the MV3 service worker background logic.

## Key Entry Points

- Background message handlers: `src/background/messages/`
  - `capture.js` — Screenshot and page capture handlers.
  - `highlights.js` — CRUD operations for highlights/clips/bookmarks.
  - `settings.js` — Settings read/write handlers.
  - `sync.js` — E2EE sync message handlers.
  - `handler.js` — Central message router that delegates to the above modules.

## Folder Map

### Settings (shared by background + UI)
- `myz-annotator/src/background/settings.ts`
  - Settings type definition and default values.
- `myz-annotator/src/background/settings/schemas/`
  - Zod schemas for Settings bundle/data by version.
- `myz-annotator/src/background/settings/registry.ts`
  - Registry mapping Settings schema versions to zod definitions.

### Sync
- `myz-annotator/src/background/sync/scheduler.js`
  - Periodic sync scheduling and orchestration.
- Core sync logic lives in `packages/sync-core/` (crypto/manifest/chunks/s3/lock/schemas/registry/utils).
- `myz-annotator/src/background/sync/` contains browser-specific modules (storage, records, deletions, keyring).

### Constants
- `myz-annotator/src/background/constants.js`
  - Storage keys, default values, and shared constants.
