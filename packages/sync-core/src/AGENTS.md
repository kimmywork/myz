# @myz/sync-core (E2EE Core)

This package contains the reusable, environment-agnostic sync core:
crypto, protocol schemas, manifest/chunk handling, remote repository helpers,
adapter interfaces, and object-store client logic.

## Non-negotiables

- Never upload plaintext user/client data. Only version and updatedAt may be plaintext in S3.
- Never upload A, B2, or C. Only sealed B1 is stored in S3.
- Verify manifest signatures before accepting remote data.
- Use WebCrypto for HKDF, AES-GCM, HMAC, and SHA-256 when possible.

## Module Boundaries (Core)

- crypto.ts: WebCrypto helpers (HKDF, AES-GCM, HMAC, SHA-256, PBKDF2).
- utils.ts: hex/standard-base64 encoders plus `bytesToBase64Url` for
  copy/paste-friendly transferable strings; `base64ToBytes` accepts both
  standard and URL-safe alphabets (whitespace/padding tolerant) and throws
  descriptive errors on truncated/invalid input instead of a raw DOMException;
  deflate/JSON binary payload codecs.
- s3Client.ts: REST calls (GET/PUT/HEAD/LIST/DELETE) with signing; HTTPS-only.
- manifest.ts: manifest build/parse, signature verify.
- chunks.ts: chunk pack/unpack, chunkId derivation, encrypt/decrypt.
- remote.ts: shared remote repository helpers for version/manifest/chunk reads
  (includes chunk/record/chain integrity verification).
- adapters.ts: host boundaries for object stores, datasets, and sync state.
- schemas/: zod schemas for sync payloads by protocol version (v1 legacy, v2
  device-bound).
- lock.ts: lease acquisition/renewal (ownership-checked) and release. Cross-device verification resolves the signer's public key from the account roster (S0); `LockPayload` carries `deviceId`. Un-decodable / revoked-signer locks are treated as not-held (fail-open, matching pre-S0 behaviour).
- gc.ts: archive policy and chunk cleanup.
- keyset.ts: legacy (v1) secret-derived keyset.
- deviceKeys.ts: Ed25519+X25519 device keys, ECIES wrap of D, DK wrap of keys.
- signing.ts: stable-stringify Ed25519 sign/verify for JSON objects.
- dataKey.ts: random accountId/D, master + per-stream key derivation.
- roster.ts: signed device roster (genesis/add/revoke+rotate/verify/advance).
  `addDeviceToRoster` is idempotent for an already-active device (re-approval
  retry returns the roster unchanged) and rejects re-adding a revoked device.
- account.ts: create/open a sync account (random accountId + D + roster) and
  per-device payload sign/verify.
- jumpHash.ts: FNV-1a seeded jump consistent hash for shard mapping.
- shards.ts: packed shard encrypt/open, record/tombstone grouping, opaque
  preservation of unknown records.
- streamManifest.ts: v2 per-device-signed sharded stream manifest
  (seal/open, high-water advance, reader-version gate, stream paths).
- streamClient.ts: end-to-end single-stream pull/push (record packing, shard
  reuse on unchanged shards, tombstones, signed manifest commit, stream meta)
  plus `syncStream` (pull + LWW merge + conditional push).
- streamMerge.ts: deterministic LWW merge (updatedAt, tie by recordHash) with
  explicit tombstones and pending-local retention.
- accountSync.ts: sync all account datasets (per-stream isolation) over the
  stream client with a pluggable dataset + per-stream state store.
- orchestrator.ts: host-agnostic account sync orchestrator (`runAccountSync`):
  lock lifecycle + renewal, `syncAccountStreams`, post-upload GC, result
  aggregation (`synced`/`locked`/`partial`/`error`), `lockLost`, and
  unconditional ownership-checked release. No host side effects; timers are
  injected (`timers` omitted = no renewal).
- concurrency.ts: bounded-concurrency map helper.
- streamGc.ts: per-stream GC (prune old manifests, delete unreferenced
  record/tombstone shards).
- deviceEnrollment.ts: S3 device mailbox (request/index publish+verify, roster
  publish/load, approve request).
- pairing.ts: same-machine X25519 pairing offer/response and 6-digit SAS.
- kdf.ts: local unlock KDF (PBKDF2 >= 600k).
- highWater.ts: monotonic anti-rollback marks.
- E2EE_DEVICE_BINDING_V2.md: the v2 device-binding model.

## Browser Adapters (in myz-annotator)

The following remain in `myz-annotator/src/background/sync/`:
- storage.ts (IndexedDB)
- scheduler.ts (chrome.alarms)
- records.ts / deletions.ts (local state wiring)
- syncEngine.ts (orchestration + notifications)
- keyring.ts (key persistence on top of storage)

Desktop-specific state stores or future knowledge-base datasets must plug in via
`adapters.ts`; do not copy manifest/version/chunk repository logic back into app code.

## Data Handling

- All record IDs and payloads must remain encrypted at rest and in transit.
- Conflict policy: latest updatedAt wins, deterministic tie-breaker.
- Changes are represented as manifests + chunks only; no ad-hoc metadata files.

## References

- E2EE_SYNC_SPEC.md (design spec and invariants)
- myz-annotator/AGENTS.md (project-wide rules)
- `docs/plan/implemented/sync-orch.md` — host-agnostic orchestrator (`runAccountSync`); S0 cross-device lock fix lives in `lock.ts`.
