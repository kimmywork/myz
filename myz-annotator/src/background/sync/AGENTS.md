# myz-annotator Background Sync (Adapters)

This folder contains MV3-specific sync adapters (storage + orchestration).
Core protocol/crypto logic lives in `packages/sync-core/`.

## Responsibilities

- storage.ts: IndexedDB persistence for sync state/keysets.
- scheduler.ts: chrome.alarms-driven scheduling.
- records.ts / deletions.ts: local record/deletion wiring.
- syncEngine.ts: orchestration + notifications (browser-only).
- keyring.ts: key persistence built on storage.

## References

- `packages/sync-core/` for protocol/crypto details.
- `myz-annotator/src/background/AGENTS.md` for background architecture overview.
