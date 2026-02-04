# E2EE Sync (Public Review)

This folder implements end-to-end encrypted (E2EE) sync for MyZ Annotator.
The code is designed to be safe to open-source and is intended for public audit.
No user secrets or plaintext user data are ever uploaded to S3.

## Crypto Summary

- Secret input: user-provided sync key (A).
- Key derivation: Argon2id (m=64MB, t=3, p=1) produces a 32-byte seed.
- Asymmetric keys: Ed25519 keypair (B1 public, B2 private) from the seed.
- Symmetric key: master key (C) derived from the seed via HKDF-SHA256.
- Record encryption: AES-GCM with per-record derived keys (chain includes prevHash).
- Manifest encryption: AES-GCM with HKDF-derived key per manifest version.
- Integrity: Ed25519 signature over manifest plaintext; HMAC for chunk IDs.

Never upload A, B2, or C. Only a sealed fingerprint of B1 is stored in S3.

## Storage Layout (S3)

/<keyId>/meta/keyseal.bin
/<keyId>/meta/version.bin
/<keyId>/manifests/v0000000001.bin
/<keyId>/manifests/v0000000001.sig
/<keyId>/chunks/<chunkId>.bin
/<keyId>/lock/lease.bin
/<keyId>/rotation.notice

Plaintext in S3 is limited to:
- Version number in object keys and meta/version.bin
- updatedAt in object metadata (x-amz-meta-updated-at)

## Sync Flow (High Level)

1) Read /meta/version.bin to find latest manifest version (fallback to list if missing).
2) Download manifest + signature and verify with B1.
3) Decrypt manifest with C; compare with local record state.
4) Fetch only missing/updated chunks; apply updates locally.
5) If local changes exist, acquire lock, write new chunks, and upload new manifest.
6) Update /meta/version.bin to the new version, release lock.
7) GC old manifests and unreferenced chunks (keep last N manifests).

## Public Review / Disclosure Notes

This implementation can be reviewed publicly. The design does not rely on obscurity.
Publishing the algorithm and protocol does not expose user data; secrets remain local.
The main residual risk is implementation bugs or weak user-chosen secrets, which
public review helps uncover.

## Metadata Side Channels & Strong Secret Advice

- S3 still reveals coarse metadata (object count, sizes, update timestamps, access patterns).
  This may leak activity level or sync frequency, but not plaintext content.
- Use a long, high-entropy sync secret (e.g., 4+ random words or 16+ random chars).
  Weak secrets are vulnerable to offline guessing if the attacker gets the ciphertext.

For full details, see [E2EE_SYNC_SPEC.md](./E2EE_SYNC_SPEC.md) in this folder.
