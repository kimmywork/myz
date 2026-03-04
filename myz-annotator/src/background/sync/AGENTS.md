# myz-annotator Background Sync (E2EE)

This folder owns end-to-end encrypted sync logic and S3 REST storage.
All code here runs in the MV3 service worker (no DOM APIs).

## Non-negotiables

- Never upload plaintext user/client data. Only version and updatedAt may be plaintext in S3.
- Never upload A, B2, or C. Only sealed B1 is stored in S3.
- Verify manifest signatures before accepting remote data.
- Use WebCrypto for HKDF, AES-GCM, HMAC, and SHA-256 when possible.

## Module Boundaries

- crypto.ts: WebCrypto helpers (HKDF, AES-GCM, HMAC, SHA-256).
- keyring.ts: A -> seed -> B1/B2/C, device key wrapping, keyId derivation.
- s3Client.ts: REST calls (GET/PUT/HEAD/LIST/DELETE) with signing.
- manifest.ts: manifest build/parse, signature verify.
- chunks.ts: chunk pack/unpack, chunkId derivation, encrypt/decrypt.
- schemas/: zod schemas for sync payloads by protocol version.
- registry.ts: protocol version registry for payload/manifest/chunk schemas.
- lock.ts: lease acquisition/renewal/release.
- gc.ts: archive policy and chunk cleanup.
- syncEngine.ts: orchestration (read/merge/write, retry/backoff).
- records.ts: record collection and apply (highlights + AI conversations).
- deletions.ts: local deletion log helpers.
- scheduler.ts: alarms-driven sync scheduling.

## Data Handling

- All record IDs and payloads must remain encrypted at rest and in transit.
- Conflict policy: latest updatedAt wins, deterministic tie-breaker.
- Changes are represented as manifests + chunks only; no ad-hoc metadata files.

## References

- E2EE_SYNC_SPEC.md (design spec and invariants)
- myz-annotator/AGENTS.md (project-wide rules)
