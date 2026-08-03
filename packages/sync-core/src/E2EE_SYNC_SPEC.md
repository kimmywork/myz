# E2EE Sync Spec (S3 REST, MV3)

This document describes the end-to-end encrypted (E2EE) incremental sync design for MyZ Annotator.
All encryption, sharding, and signing happen locally. S3 stores only ciphertext and minimal plaintext
metadata (version number and updatedAt).

## Goals and Constraints

- E2EE for highlights and related records.
- S3 REST only (no SDK assumptions).
- Plaintext in S3 is limited to: manifest version number and updatedAt metadata.
- No key recovery. If the user forgets the key, cloud data is unreadable.
- No repeated input of A after initial setup; keys are stored locally, encrypted at rest.
- Multiple clients can sync concurrently; conflicts keep the latest record.
- All cryptographic material A, B2, C stays local; only B1 is stored in sealed form in S3.
- keyId = base32(SHA256(B1)).

## Key Derivation (A -> B1/B2/C)

1) Input: user secret A (not stored).
2) salt: fixed ASCII salt (e.g., "myz:e2ee:pbkdf2:v1") to keep derivation deterministic.
3) seed = PBKDF2-HMAC-SHA256(A, salt, iterations=100000) -> 32 bytes.
4) B1/B2 = Ed25519 keypair derived deterministically from seed.
5) C = HKDF-SHA256(seed, info="myz:e2ee:master", length=32).
6) Clear A from memory after derivation.

## Local Key Storage (No Re-enter A)

- Generate a device key DK using WebCrypto: AES-GCM 256, extractable=false.
- Store DK in IndexedDB (CryptoKey is structured-cloneable in Chrome).
- Wrap (encrypt) B2 and C with DK and store the ciphertext in local storage.
- If local storage is cleared, data cannot be recovered (expected).

## Crypto Primitives (WebCrypto first)

- KDF: PBKDF2-HMAC-SHA256 via WebCrypto, iterations=100000.
- HKDF: WebCrypto HKDF (SHA-256).
- Symmetric: AES-GCM-256 (WebCrypto).
- Hash: SHA-256 (WebCrypto).
- HMAC: HMAC-SHA-256 (WebCrypto) for chunk IDs.
- Signature: Ed25519 via @noble/ed25519 if WebCrypto Ed25519 is unavailable.

## Sealed Public Key (B1) in S3

- B1 fingerprint: fpr = SHA-256(B1).
- sealedB1 = AES-GCM( key = HKDF(C, info="myz:seal"), fpr ).
- Store sealedB1 in S3 at: /<keyId>/meta/keyseal.bin.
- Clients decrypt sealedB1 to validate key consistency (detect key rotation).

## Data Model

### Record
- A single logical object (highlight, conversation message, metadata, etc).
- Each record update is encrypted with a chain-derived key.

Chain key per record:
- K = HKDF(C, info="record:<recordId>|<updatedAt>|<prevHash>")

Record payload encryption:
- recordCipher = AES-GCM(K, nonce, plaintextRecord)
- AAD: recordId, updatedAt, prevHash

### Chunk (Encrypted Shard)
- A chunk bundles multiple record envelopes and is encrypted as a whole.
- chunkKey = HKDF(C, info="chunk-key:<chunkId>")
- chunkId = base32(HMAC-SHA-256(C, chunkPlaintext))
- chunkCipher = AES-GCM(chunkKey, nonce, chunkPlaintext)

chunkPlaintext layout (binary):
- records[]: { recordId, updatedAt, prevHash, keyId, recordCipher, recordNonce }

### Manifest (Encrypted)
- Manifest is encrypted and signed.
- Object key holds only version number.

manifestPlaintext:
- version (integer)
- createdAt (ms)
- clientId (random, local)
- baseVersion (previous manifest version)
- epoch (key rotation counter)
- recordsIndex: recordId -> { chunkId, updatedAt, recordHash }
- chunksIndex: chunkId -> { hash, size, nonce }
- chainHeads: recordId -> { keyId, recordHash, updatedAt }

manifestCipher = AES-GCM(Km, nonce, manifestPlaintext)
- Km = HKDF(C, info="manifest:<version>")

manifestSig = Ed25519.sign(B2, SHA-256(manifestPlaintext))

## S3 Object Layout

/<keyId>/meta/keyseal.bin
/<keyId>/meta/version.bin
/<keyId>/manifests/v0000000001.bin
/<keyId>/manifests/v0000000001.sig
/<keyId>/chunks/<chunkId>.bin
/<keyId>/lock/lease.bin
/<keyId>/rotation.notice

Plaintext allowed:
- version number in manifest object key
- version number stored in meta/version.bin
- updatedAt in object metadata (x-amz-meta-updated-at)

No user/client data appears in object keys or metadata.

## Sync Flow (Incremental)

1) Read /meta/version.bin to get latest version (fallback to list if missing).
2) Download manifest + signature.
3) Decrypt manifest with C; verify signature with B1.
4) Compare local index vs remote; fetch missing chunks.
5) Decrypt chunks; apply records.
6) Merge conflicts per record by updatedAt (latest wins).

Write flow:
1) Acquire lock.
2) Fetch latest manifest; merge into local state.
3) Preserve local pending records (tracked by record-state diffs) so they are not dropped by
   remote deletions; apply remote updates only when newer than local.
4) Create new chunks for new/updated records.
5) Upload chunks.
6) Write new manifest version (version+1) and signature.
7) Update /meta/version.bin with the latest version.
7) Release lock.

## Conflict Rules (Latest Wins)

- For each recordId, keep the record with the highest updatedAt.
- If updatedAt is equal, choose the record with the higher recordHash to ensure determinism.
- Losing record updates become orphaned and will be cleaned by archive GC.
- Deletions are represented by record absence in the latest manifest (hard delete).
- Track pending local edits by comparing record-state hashes; keep them even if remote
  manifests are newer so local unsynced data is not dropped.

## Locking (Multi-client)

- Lock object stored at /<keyId>/lock/lease.bin
- lockPayload (encrypted): { clientId, leaseExpiresAt, nonce, signature }
- signature = Ed25519.sign(B2, SHA-256(lockPayloadPlaintext))

Acquire:
- Read lock; if expired or invalid signature, attempt to overwrite.
- Use If-Match / If-None-Match to avoid races.

Lease:
- Default 30s, renew periodically while writing.
- On failure, switch to read-only sync and retry later.

## Archiving and GC

- Keep last N manifests (default N=30).
- Build active chunk set from the last N manifests.
- Delete chunks not referenced by active manifests after a grace period.
- All deletion requires lock ownership.
- Keep a local-only deletion log (recordId + deletedAt) to reconcile local merges.

## Key Rotation

- New A => new B1/B2/C => new keyId, epoch+1.
- Re-encrypt all local data; upload to new keyId.
- Write /<oldKeyId>/rotation.notice (encrypted) to signal other clients.
- Clients that cannot decrypt keyseal or see rotation.notice must ask for new key.
- If the key is missing or invalid, purge local sync metadata and any cached encrypted blobs.

## Local Integration Notes

- Source data: highlights from background storage.
- Sync engine runs in MV3 background with idle/interval triggers.
- All network IO uses REST via fetch with S3 signature or user-provided credentials.

## Open Questions / TODO
