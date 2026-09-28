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
- s3Client.ts: REST calls (GET/PUT/HEAD/LIST/DELETE) with signing; HTTPS-only.
- manifest.ts: manifest build/parse, signature verify.
- chunks.ts: chunk pack/unpack, chunkId derivation, encrypt/decrypt.
- remote.ts: shared remote repository helpers for version/manifest/chunk reads
  (includes chunk/record/chain integrity verification).
- adapters.ts: host boundaries for object stores, datasets, and sync state.
- schemas/: zod schemas for sync payloads by protocol version (v1 legacy, v2
  device-bound).
- registry.ts: protocol version registry for payload/manifest/chunk schemas.
- lock.ts: lease acquisition/renewal (ownership-checked) and release.
- gc.ts: archive policy and chunk cleanup.
- keyset.ts: legacy (v1) secret-derived keyset.
- deviceKeys.ts: Ed25519+X25519 device keys, ECIES wrap of D, DK wrap of keys.
- signing.ts: stable-stringify Ed25519 sign/verify for JSON objects.
- dataKey.ts: random accountId/D, master + per-stream key derivation.
- roster.ts: signed device roster (genesis/add/revoke+rotate/verify/advance).
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
