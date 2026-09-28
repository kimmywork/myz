# E2EE Device-Binding Model (Protocol v2)

This document records the **clean-break** device-bound model required by
`docs/plan/e2ee-security-hardening.md` (§3–§5) and the stream/sharded format
required by `docs/plan/e2ee-sync-evolution.md`. It is schema-first: the zod
schemas in `schemas/v2.ts` and the modules below are the source of truth.

The v2 protocol **never reuses** `SYNC_PROTOCOL_VERSION` (“1.0.0”); the new
constant is `SYNC_PROTOCOL_VERSION_V2` (“2.0.0”). Old clients cannot parse v2
objects and v2 clients never read v1 roots.

## 1. Roles and keys

```text
A (user secret) ── PBKDF2 >= 600k ──> local unlock key   (optional, no account addressing)
accountId        = random (acct_…), shared out-of-band via pairing / QR
Device Di        = Ed25519(sign) + X25519(agree), private keys wrapped by local DK
D (epoch key)    = random 32B, ECIES-wrapped to each authorized device in the roster
content keys     = HKDF(D, "myz:e2ee:v2:master") -> HKDF(_, "record:…" / "chunk-key:…" / "manifest:…")
stream key       = HKDF(master, "stream:<streamId>:master")
```

- `A` never derives `accountId` and never decrypts data; it is only used (if at
  all) for registration-request authentication. There is **no A-only recovery**:
  losing every device loses the data.
- Strict forward secrecy is not required; the goal is only that knowing `A`
  alone does not reveal `D`.
- `keyId` remains a chunk-envelope/chain field; the S3 root is `accountId`.

## 2. Modules

| Concern | Module | Notes |
| --- | --- | --- |
| Protocol schemas | `schemas/v2.ts` | roster / device request / index / sharded manifest / envelope |
| Device keys | `deviceKeys.ts` | Ed25519+X25519 keygen, ECIES wrap of D, DK wrap of private keys |
| Account data key | `dataKey.ts` | random accountId/D, master + per-stream derivation |
| Roster | `roster.ts` | signed genesis, add device, revoke + rotate, verify, advance check |
| Local unlock KDF | `kdf.ts` | PBKDF2 >= 600k (Argon2id-compatible interface) |
| Anti-rollback | `highWater.ts` | monotonic high-water marks for every stream |
| Device key persistence | `myz-annotator/src/background/sync/deviceKeyring.ts` | private keys wrapped by non-extractable DK, stored in IndexedDB |

`deviceKeyring` loads or creates the device identity; `roster.ts` holds the
pure, transport-free logic. Transport (QR / S3 device mailbox) and the clean
switch are layered on top of these primitives.

## 3. Roster

```text
roster = {
  accountId, rosterVersion (monotonic), epoch,
  devices[]: { deviceId, signPub, agreePub, addedAt, addedBy, revokedAt? },
  wrappedD[]: { deviceId, epoch, ephPub, nonce, cipher },
  signedBy, signature            // Ed25519 over stable-stringified roster
}
```

- `index.bin` (signed pointer) and each request object are signed; the security
  anchor is the **signed, monotonic `rosterVersion`**, never an unsigned object.
- Approval happens by an authorized device; roster updates use `If-Match` CAS in
  the sync lock.
- Revocation creates epoch+1 with a **new** `D'` wrapped only to the remaining
  devices; the removed device cannot read future data (read-side PCS). Write
  revocation is out of scope for pure S3 (accepted limitation).

## 4. Sharded stream format (evolution I4/I6)

```text
stream manifest (signed, per-device):
  streamId, streamVersion (monotonic), minReaderVersion, features[],
  version, baseVersion, epoch, shardCount, clientId,
  recordsIndex: recordId -> { shardId, updatedAt, recordHash },
  shards:          { shardId -> { hash, size, nonce } },
  tombstoneShards: { shardId -> { hash, size, nonce } },
  signedBy
```

- `shardId = jumpConsistentHash(recordId, shardCount)`; `shardCount` is signed
  into the manifest so clients never assume it.
- Explicit tombstones (no “absence = delete”), opaque preservation of unknown
  records, `<=` version parsing with `minReaderVersion`, and a monotonic
  `streamVersion` high-water mark are mandatory for every stream.

## 5. Status vs. remaining work

Implemented and unit-tested: protocol schemas, device keys + ECIES/DK
wrapping, random accountId/D + derivations, signed roster (create/add/
revoke+rotate/verify/advance), local unlock KDF, anti-rollback helpers, local
device-key persistence, S3 device mailbox + same-machine pairing/SAS,
account creation/open + per-device payload signing, jump-consistent sharding,
packed record/tombstone shards with opaque preservation, encrypted per-device
stream manifests, end-to-end stream pull/push, deterministic LWW merge,
per-stream GC, bounded-concurrency IO, and the app integration (v2 engine
delegated from `syncNow`, one-time legacy v1 rescue/bootstrap).

Rotation cleanup (KM7): revoking a device rotates to a new epoch `D'`, records
are re-encrypted under the new stream key and written to the same shard paths,
and per-stream GC removes shards no longer referenced by any kept manifest, so
old-epoch ciphertext does not survive as an addressable object. There is no
separate legacy-epoch dir to purge.

Still open: a device-pairing UI over the pairing/roster primitives (roster
paste works today), email/narrow-screen refinements for Inbox, and scheduled
Inbox reminders.
