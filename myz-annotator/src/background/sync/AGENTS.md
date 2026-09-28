# myz-annotator Background Sync (Adapters)

This folder contains MV3-specific sync adapters (storage + orchestration).
Core protocol/crypto logic lives in `packages/sync-core/`.

## Responsibilities

- storage.ts: IndexedDB persistence for sync state/keysets/device key pair.
- scheduler.ts: chrome.alarms-driven scheduling.
- records.ts / deletions.ts: local record/deletion wiring.
- syncEngine.ts: orchestration + notifications (browser-only).
- keyring.ts: keyset persistence (AAD-bound) built on storage.
- credentials.ts: at-rest encryption of S3 `secretAccessKey`/`sessionToken`.
- deviceKeyring.ts: loads/creates the local Ed25519+X25519 device identity,
  private keys wrapped by the non-extractable device key (v2 protocol).
- accountKeyring.ts: creates/loads the v2 sync account (accountId + signed
  roster) on top of the device identity.
- v2/datasets.ts: `StreamDataset` adapters (highlight stream `h:<id>`).
- v2/inboxDataset.ts: inbox workflow stream (`status:` / `mark:` / `rel:`).
- v2/stateStore.ts: per-stream sync state (streamVersion/shardHashes/tombstones).
- v2/engine.ts: v2 sync orchestration (account streams + account-scoped lease);
  `syncEngine.syncNow` delegates here when an account exists, else legacy v1.

## References

- `packages/sync-core/` for protocol/crypto details.
- `myz-annotator/src/background/AGENTS.md` for background architecture overview.
