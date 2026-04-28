# @myz/sync-core

Environment-agnostic E2EE sync core for the MyZ suite.

This package provides reusable primitives for:
- protocol types and version registry
- manifest and chunk encryption/decryption
- manifest signing/verification
- S3 REST client (AWS SigV4)
- lock and GC helpers

For security and protocol details, see `src/E2EE_SYNC_SPEC.md`.

## Status

`@myz/sync-core` is not published to npm yet.

The public repository for this package will be:

```bash
git@github.com:myz-suite/sync.git
```

So for now, consume it via `git clone` or `git submodule`.

## Install (Submodule, Recommended)

In your app repository:

```bash
# from your app repo root
git submodule add git@github.com:myz-suite/sync.git vendor/sync
git submodule update --init --recursive
```

Then reference local packages in your app `package.json` (adjust paths as needed):

```json
{
  "dependencies": {
    "@myz/sync-core": "file:vendor/sync/packages/sync-core",
    "@myz/shared": "file:vendor/sync/packages/shared",
    "@myz/ai-core": "file:vendor/sync/packages/ai-core"
  }
}
```

Install dependencies:

```bash
npm install
```

Notes:
- `@myz/sync-core` depends on `@myz/shared` and `@myz/ai-core`.
- This package currently exports TypeScript source files, so your build tool must transpile TS from dependencies.

## Install (Clone)

If you do not use submodule:

```bash
# from your app repo root
mkdir -p vendor
git clone git@github.com:myz-suite/sync.git vendor/sync
npm install
```

Use the same `file:` dependencies as above.

## Public API

Current root entry exports:
- `@myz/sync-core` -> `types` and schema `registry`

Most operational helpers are available via subpath imports:
- `@myz/sync-core/manifest`
- `@myz/sync-core/chunks`
- `@myz/sync-core/s3Client`
- `@myz/sync-core/lock`
- `@myz/sync-core/gc`
- `@myz/sync-core/crypto`
- `@myz/sync-core/rotation`
- `@myz/sync-core/settings`
- `@myz/sync-core/schemas`

## Quick Start

### 1) Validate protocol payloads with registry

```ts
import {
  SyncRecordPayloadRegistry,
  SyncManifestRegistry,
} from "@myz/sync-core"

const recordPayloadSchema =
  SyncRecordPayloadRegistry.versions[SyncRecordPayloadRegistry.latestVersion]
const manifestSchema =
  SyncManifestRegistry.versions[SyncManifestRegistry.latestVersion]

const parsedRecordPayload = recordPayloadSchema.parse(inputRecordPayload)
const parsedManifest = manifestSchema.parse(inputManifest)
```

### 2) Build encrypted chunks

```ts
import { buildChunkForRecord } from "@myz/sync-core/chunks"
import type { SyncRecord } from "@myz/sync-core"

const record: SyncRecord = {
  recordId: "r_123",
  type: "highlight",
  updatedAt: new Date().toISOString(),
  data: myRecordData,
  recordHash: "prev-computed-record-hash",
}

const built = await buildChunkForRecord(record, masterKey, prevHash)
// built.chunkId, built.chunkCipher, built.chunkNonce
```

### 3) Encrypt + sign manifest

```ts
import {
  encryptManifest,
  signManifest,
  verifyManifest,
} from "@myz/sync-core/manifest"
import type { ManifestData } from "@myz/sync-core"
import { SYNC_PROTOCOL_VERSION } from "@myz/shared/versioning"

const manifest: ManifestData = {
  protocolVersion: SYNC_PROTOCOL_VERSION,
  version: 1,
  createdAt: new Date().toISOString(),
  clientId,
  baseVersion: 0,
  epoch: 1,
  recordsIndex: {},
  chunksIndex: {},
  chainHeads: {},
}

const { payload, plainBytes } = await encryptManifest(manifest, masterKey)
const signature = await signManifest(plainBytes, privateKey)
const ok = await verifyManifest(plainBytes, signature, publicKey)
```

### 4) Upload/download via S3 client

```ts
import { S3Client } from "@myz/sync-core/s3Client"
import type { SyncS3Settings } from "@myz/sync-core/settings"

const s3Settings: SyncS3Settings = {
  endpoint: "https://s3.us-east-1.amazonaws.com",
  region: "us-east-1",
  bucket: "my-bucket",
  accessKeyId: process.env.S3_ACCESS_KEY_ID!,
  secretAccessKey: process.env.S3_SECRET_ACCESS_KEY!,
  prefix: "myz-sync",
}

const s3 = new S3Client(s3Settings)
await s3.putObject("k1/meta/version.bin", new Uint8Array([0, 0, 0, 1]))
const remote = await s3.getObject("k1/meta/version.bin")
```

## Runtime Requirements

- Web Crypto API (`crypto.subtle`) available
- `fetch` available
- ESM + TypeScript toolchain

Typical environments:
- browser extension service worker
- modern browser
- Node.js runtime with Web Crypto + fetch support

## Security Notes

- Never upload sync secret, private key, or master key.
- Always verify manifest signature before applying remote state.
- Use high-entropy user secrets.
- S3 object metadata (count/size/timestamps/access pattern) is still observable.

## Development

Inside this package directory:

```bash
npm install
```

This package does not define standalone npm scripts yet.
