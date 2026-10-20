# myz-annotator Background Sync

This folder contains MV3-specific sync adapters. Protocol/crypto/orchestration
primitives live in `packages/sync-core/`.

**Legacy v1 (keyset) sync has been removed.** There is no v1 plan/phases/state,
no chunk/manifest/rotation/gc, and no v1 keyset or record-state storage. Only the
v2 device-bound account path remains.

## Responsibilities

- storage.ts: IndexedDB (`myz_sync_db`, v3) persistence for the device key,
  device key pair, account roster, sync state, deletions (tombstones) and
  per-stream state. The v1 `record_state` store is dropped on upgrade.
- deviceKey.ts: the local non-extractable device key used to wrap the key pair,
  roster and S3 credentials.
- deviceKeyring.ts: loads/creates the Ed25519+X25519 device identity.
- accountKeyring.ts: creates/loads the v2 account (accountId + signed roster).
- credentials.ts: at-rest encryption of S3 `secretAccessKey`/`sessionToken`.
- deletions.ts: local deletion log fed to stream tombstones.
- s3Client.ts: S3 implementation of `SyncObjectStore`.
- scheduler.ts: `chrome.alarms`-driven sync scheduling.
- syncEngine.ts: `syncNow` — enabled check + account check, then v2 sync.
- v2/datasets.ts: highlight stream dataset (`h:<id>`) + opaque preservation.
- v2/inboxDataset.ts: inbox stream (`status:` / `mark:` / `rel:`).
- v2/stateStore.ts: per-stream state scoped by `accountId` (anti-rollback).
- v2/timers.ts: lease-renewal timers for the orchestrator — `chrome.alarms` via the `Scheduler` port when the cadence is ≥30s, `setInterval` otherwise.
- v2/engine.ts: thin host adapter — loads account/settings/device/clientId, calls `runAccountSync` (from `@myz/sync-core/orchestrator`), then applies host side effects (badge, sync state) and maps to `SyncResult`. Lock/GC/aggregation live in sync-core (S0 lock fix + S1 orchestrator).
- v2/bootstrap.ts: clean-break bootstrap (create account + first sync).
- v2/pairingSession.ts: same-machine pairing over transferable strings.

## References

- `packages/sync-core/` for protocol/crypto/orchestration primitives.
- `docs/plan/implemented/sync-orch.md` for the host-agnostic orchestrator design.
- `myz-annotator/src/background/AGENTS.md` for the background overview.
