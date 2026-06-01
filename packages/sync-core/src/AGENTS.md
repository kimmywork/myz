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

- crypto.ts: WebCrypto helpers (HKDF, AES-GCM, HMAC, SHA-256).
- s3Client.ts: REST calls (GET/PUT/HEAD/LIST/DELETE) with signing.
- manifest.ts: manifest build/parse, signature verify.
- chunks.ts: chunk pack/unpack, chunkId derivation, encrypt/decrypt.
- remote.ts: shared remote repository helpers for version/manifest/chunk reads.
- adapters.ts: host boundaries for object stores, datasets, and sync state.
- schemas/: zod schemas for sync payloads by protocol version.
- registry.ts: protocol version registry for payload/manifest/chunk schemas.
- lock.ts: lease acquisition/renewal/release.
- gc.ts: archive policy and chunk cleanup.

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
