# myz-annotator Background Architecture

This folder contains the MV3 service worker background logic.

## Key Entry Points

- Background message handlers: `src/background/messages/`
  - `capture.ts` — Screenshot and page capture handlers.
  - `highlights.ts` — CRUD operations for highlights/clips/bookmarks.
  - `settings.ts` — Settings read/write handlers.
  - `search.ts` — Search handlers (`chrome.search.query`).
  - `sync.ts` — E2EE sync message handlers.
  - `inbox.ts` — Inbox workflow status/mark/relation handlers.
  - `handler.ts` — Central message router that delegates to the above modules.

### Inbox (shared by background + UI)
- `myz-annotator/src/background/inbox/actions.ts`
  - Local `inbox_state` (IndexedDB) actions for `status:` / `mark:` / `rel:`
    records; explicit `kept` writes `handledAt`.
- `myz-annotator/src/background/inbox/queue.ts`
  - Queue/review read model (`buildQueue`) and the pending badge
    (`refreshInboxBadge`).

## Folder Map

### Settings (shared by background + UI)
- `myz-annotator/src/background/settings.ts`
  - Settings type definition and default values.
- `myz-annotator/src/background/settings/schemas/`
  - Zod schemas for Settings bundle/data by version.
- `myz-annotator/src/background/settings/registry.ts`
  - Registry mapping Settings schema versions to zod definitions.

### Sync
- `myz-annotator/src/background/sync/scheduler.ts`
  - Periodic sync scheduling and orchestration.
- Core sync logic lives in `packages/sync-core/` (crypto/manifest/chunks/s3/lock/schemas/registry/utils).
- `myz-annotator/src/background/sync/` contains browser-specific modules (storage, records, deletions, keyring).

### Constants
- `myz-annotator/src/background/constants.ts`
  - Storage keys, default values, and shared constants.
