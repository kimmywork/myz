import { SYNC_PROTOCOL_VERSION_V2 } from "@myz/shared/versioning"
import type { SyncObjectStore } from "./adapters"
import {
  aesGcmDecrypt,
  aesGcmEncrypt,
  bytesToUtf8,
  hkdfSha256,
  sha256,
  splitNoncePayload,
  utf8ToBytes,
} from "./crypto"
import type { DeviceKeyPair } from "./deviceKeys"
import { assertNotRollback } from "./highWater"
import type { Roster } from "./roster"
import {
  buildShard,
  groupTombstonesByShard,
  openShard,
  recordShardId,
} from "./shards"
import {
  assertStreamReadable,
  openStreamManifest,
  sealStreamManifest,
  streamManifestPath,
  streamManifestSignaturePath,
  streamPrefix,
  type StreamManifest,
  type StreamShardEntry,
} from "./streamManifest"
import { mergeStreamRecords } from "./streamMerge"
import {
  base32Encode,
  base64ToBytes,
  bytesToBase64,
  bytesToHex,
  decodeBinaryPayload,
  encodeBinaryPayload,
  stableStringify,
} from "./utils"

export interface StreamRecordInput {
  recordId: string
  updatedAt: string
  data: unknown
}

export interface StreamRemoteRecord extends StreamRecordInput {
  recordHash: string
}

export interface StreamPackedRecord {
  recordId: string
  updatedAt: string
  recordHash: string
  prevHash: string
  keyId: string
  recordCipher: string
  recordNonce: string
}

interface StreamMeta {
  streamVersion: number
  manifestVersion: number
}

export interface StreamPullResult {
  manifest: StreamManifest | null
  records: Map<string, StreamRemoteRecord>
  tombstones: Record<string, string>
  shardHashes: Record<string, string>
  streamVersion: number | null
}

export interface StreamPushResult {
  manifest: StreamManifest
  uploads: Array<{ path: string; body: Uint8Array }>
}

export function streamShardPath(
  accountId: string,
  streamId: string,
  shardId: number,
): string {
  return `${streamPrefix(accountId, streamId)}/shards/${shardId}.bin`
}

export function streamTombstonePath(
  accountId: string,
  streamId: string,
  shardId: number,
): string {
  return `${streamPrefix(accountId, streamId)}/tombstones/${shardId}.bin`
}

export function streamMetaPath(accountId: string, streamId: string): string {
  return `${streamPrefix(accountId, streamId)}/meta/version.bin`
}

export async function hashStreamRecord(
  record: StreamRecordInput,
): Promise<string> {
  const json = stableStringify({
    recordId: record.recordId,
    updatedAt: record.updatedAt,
    data: record.data,
  })
  return bytesToHex(await sha256(utf8ToBytes(json)))
}

export async function packStreamRecord(
  streamKey: Uint8Array,
  record: StreamRecordInput,
  prevHash: string,
): Promise<StreamPackedRecord> {
  const recordKey = await hkdfSha256(
    streamKey,
    utf8ToBytes(`record:${record.recordId}|${record.updatedAt}|${prevHash}`),
    32,
  )
  const aad = utf8ToBytes(`${record.recordId}|${record.updatedAt}|${prevHash}`)
  const plain = encodeBinaryPayload({
    recordId: record.recordId,
    updatedAt: record.updatedAt,
    data: record.data,
  })
  const { nonce, ciphertext } = await aesGcmEncrypt(recordKey, plain, aad)
  return {
    recordId: record.recordId,
    updatedAt: record.updatedAt,
    recordHash: await hashStreamRecord(record),
    prevHash,
    keyId: base32Encode(await sha256(recordKey)),
    recordCipher: bytesToBase64(ciphertext),
    recordNonce: bytesToBase64(nonce),
  }
}

export async function openStreamRecord(
  streamKey: Uint8Array,
  packed: StreamPackedRecord,
): Promise<StreamRemoteRecord> {
  const recordKey = await hkdfSha256(
    streamKey,
    utf8ToBytes(
      `record:${packed.recordId}|${packed.updatedAt}|${packed.prevHash}`,
    ),
    32,
  )
  const aad = utf8ToBytes(
    `${packed.recordId}|${packed.updatedAt}|${packed.prevHash}`,
  )
  const plain = await aesGcmDecrypt(
    recordKey,
    base64ToBytes(packed.recordNonce),
    base64ToBytes(packed.recordCipher),
    aad,
  )
  const record = decodeBinaryPayload(plain) as StreamRecordInput
  const recordHash = await hashStreamRecord(record)
  if (recordHash !== packed.recordHash) {
    throw new Error("Stream record hash mismatch")
  }
  return { ...record, recordHash }
}

async function verifyShardBody(
  body: Uint8Array,
  entry: StreamShardEntry,
): Promise<void> {
  const hash = bytesToHex(await sha256(body))
  if (hash !== entry.hash || body.length !== entry.size) {
    throw new Error("Stream shard integrity check failed")
  }
}

async function shardEntry(body: Uint8Array): Promise<StreamShardEntry> {
  const nonce = splitNoncePayload(body, 12).nonce
  return {
    hash: bytesToHex(await sha256(body)),
    size: body.length,
    nonce: bytesToBase64(nonce),
  }
}

async function readStreamMeta(
  store: SyncObjectStore,
  accountId: string,
  streamId: string,
): Promise<StreamMeta | null> {
  const object = await store.getObject(streamMetaPath(accountId, streamId))
  if (!object) return null
  return JSON.parse(bytesToUtf8(object.body)) as StreamMeta
}

export async function writeStreamMeta(
  store: SyncObjectStore,
  accountId: string,
  streamId: string,
  meta: StreamMeta,
): Promise<void> {
  await store.putObject(
    streamMetaPath(accountId, streamId),
    utf8ToBytes(JSON.stringify(meta)),
    { metadata: { "updated-at": new Date().toISOString() } },
  )
}

export async function pullStream(options: {
  store: SyncObjectStore
  streamKey: Uint8Array
  roster: Roster
  accountId: string
  streamId: string
  seenStreamVersion?: number | null
  knownShardHashes?: Record<string, string>
  readerVersion?: number
}): Promise<StreamPullResult> {
  const meta = await readStreamMeta(
    options.store,
    options.accountId,
    options.streamId,
  )
  if (!meta) {
    return {
      manifest: null,
      records: new Map(),
      tombstones: {},
      shardHashes: {},
      streamVersion: null,
    }
  }
  assertNotRollback(options.seenStreamVersion, meta.streamVersion)

  const manifestObject = await options.store.getObject(
    streamManifestPath(options.accountId, options.streamId, meta.manifestVersion),
  )
  const signatureObject = await options.store.getObject(
    streamManifestSignaturePath(
      options.accountId,
      options.streamId,
      meta.manifestVersion,
    ),
  )
  if (!manifestObject || !signatureObject) {
    throw new Error("Missing stream manifest or signature")
  }
  const manifest = await openStreamManifest({
    payload: manifestObject.body,
    signature: signatureObject.body,
    streamKey: options.streamKey,
    version: meta.manifestVersion,
    roster: options.roster,
  })
  assertStreamReadable(
    manifest,
    options.readerVersion ?? manifest.minReaderVersion,
  )

  const records = new Map<string, StreamRemoteRecord>()
  const tombstones: Record<string, string> = {}
  const shardHashes: Record<string, string> = {}

  for (const [shardId, entry] of Object.entries(manifest.shards)) {
    shardHashes[shardId] = entry.hash
    if (options.knownShardHashes?.[shardId] === entry.hash) continue
    const object = await options.store.getObject(
      streamShardPath(options.accountId, options.streamId, Number(shardId)),
    )
    if (!object) throw new Error(`Missing stream shard ${shardId}`)
    await verifyShardBody(object.body, entry)
    const value = await openShard<{
      records: Record<string, StreamPackedRecord>
    }>(options.streamKey, "records", Number(shardId), object.body)
    for (const packed of Object.values(value.records)) {
      const record = await openStreamRecord(options.streamKey, packed)
      records.set(record.recordId, record)
    }
  }

  for (const [shardId, entry] of Object.entries(manifest.tombstoneShards)) {
    const object = await options.store.getObject(
      streamTombstonePath(options.accountId, options.streamId, Number(shardId)),
    )
    if (!object) throw new Error(`Missing tombstone shard ${shardId}`)
    await verifyShardBody(object.body, entry)
    const value = await openShard<{ tombstones: Record<string, string> }>(
      options.streamKey,
      "tombstones",
      Number(shardId),
      object.body,
    )
    Object.assign(tombstones, value.tombstones)
  }

  return {
    manifest,
    records,
    tombstones,
    shardHashes,
    streamVersion: meta.streamVersion,
  }
}

/** Build (but do not upload) a new signed-ready manifest and its shards. */
export async function buildStreamPush(options: {
  streamKey: Uint8Array
  accountId: string
  streamId: string
  clientId: string
  epoch: number
  records: StreamRecordInput[]
  tombstones: Record<string, string>
  baseManifest?: StreamManifest | null
  baseTombstones?: Record<string, string>
  shardCount?: number
  features?: string[]
  minReaderVersion?: number
  now?: string
}): Promise<StreamPushResult> {
  const shardCount = options.shardCount ?? options.baseManifest?.shardCount ?? 64
  const base = options.baseManifest ?? null
  const prevIndex = base?.recordsIndex ?? {}

  const hashed = await Promise.all(
    options.records.map(async (record) => ({
      record,
      recordHash: await hashStreamRecord(record),
      shardId: recordShardId(record.recordId, shardCount),
    })),
  )
  const byShard = new Map<number, typeof hashed>()
  for (const entry of hashed) {
    const group = byShard.get(entry.shardId)
    if (group) group.push(entry)
    else byShard.set(entry.shardId, [entry])
  }

  const shards: Record<string, StreamShardEntry> = {}
  const recordsIndex: StreamManifest["recordsIndex"] = {}
  const uploads: Array<{ path: string; body: Uint8Array }> = []

  for (const [shardId, entries] of byShard) {
    const changed = entries.some(
      (entry) =>
        prevIndex[entry.record.recordId]?.recordHash !== entry.recordHash,
    )
    if (!changed && base?.shards[String(shardId)]) {
      shards[String(shardId)] = base.shards[String(shardId)]
      for (const entry of entries) {
        recordsIndex[entry.record.recordId] = prevIndex[entry.record.recordId]
      }
      continue
    }
    const packed = await Promise.all(
      entries.map((entry) =>
        packStreamRecord(
          options.streamKey,
          entry.record,
          prevIndex[entry.record.recordId]?.recordHash ?? "",
        ),
      ),
    )
    const body = await buildShard(options.streamKey, "records", shardId, {
      records: Object.fromEntries(
        packed.map((record) => [record.recordId, record]),
      ),
    })
    const entry = await shardEntry(body)
    shards[String(shardId)] = entry
    for (const record of packed) {
      recordsIndex[record.recordId] = {
        shardId,
        updatedAt: record.updatedAt,
        recordHash: record.recordHash,
      }
    }
    if (base?.shards[String(shardId)]?.hash !== entry.hash) {
      uploads.push({
        path: streamShardPath(options.accountId, options.streamId, shardId),
        body,
      })
    }
  }

  const tombstoneShards: Record<string, StreamShardEntry> = {}
  if (
    base &&
    options.baseTombstones &&
    stableStringify(options.baseTombstones) === stableStringify(options.tombstones)
  ) {
    Object.assign(tombstoneShards, base.tombstoneShards)
  } else {
    for (const [shardId, value] of groupTombstonesByShard(
      options.tombstones,
      shardCount,
    )) {
      const body = await buildShard(options.streamKey, "tombstones", shardId, {
        tombstones: value,
      })
      const entry = await shardEntry(body)
      tombstoneShards[String(shardId)] = entry
      if (base?.tombstoneShards[String(shardId)]?.hash !== entry.hash) {
        uploads.push({
          path: streamTombstonePath(options.accountId, options.streamId, shardId),
          body,
        })
      }
    }
  }

  return {
    manifest: {
      protocolVersion: SYNC_PROTOCOL_VERSION_V2,
      accountId: options.accountId,
      streamId: options.streamId,
      streamVersion: (base?.streamVersion ?? 0) + 1,
      minReaderVersion:
        options.minReaderVersion ?? base?.minReaderVersion ?? 1,
      features: options.features ?? base?.features ?? [],
      version: (base?.version ?? 0) + 1,
      baseVersion: base?.version ?? 0,
      epoch: options.epoch,
      createdAt: options.now ?? new Date().toISOString(),
      clientId: options.clientId,
      shardCount,
      recordsIndex,
      shards,
      tombstoneShards,
      signedBy: base?.signedBy ?? "",
    },
    uploads,
  }
}

/** Sign, upload changed shards and the manifest, then advance stream meta. */
export async function commitStreamPush(options: {
  store: SyncObjectStore
  streamKey: Uint8Array
  device: DeviceKeyPair
  deviceId: string
  accountId: string
  streamId: string
  clientId: string
  epoch: number
  records: StreamRecordInput[]
  tombstones: Record<string, string>
  baseManifest?: StreamManifest | null
  baseTombstones?: Record<string, string>
  shardCount?: number
  features?: string[]
  minReaderVersion?: number
  now?: string
}): Promise<StreamManifest> {
  const built = await buildStreamPush({
    streamKey: options.streamKey,
    accountId: options.accountId,
    streamId: options.streamId,
    clientId: options.clientId,
    epoch: options.epoch,
    records: options.records,
    tombstones: options.tombstones,
    baseManifest: options.baseManifest,
    baseTombstones: options.baseTombstones,
    shardCount: options.shardCount,
    features: options.features,
    minReaderVersion: options.minReaderVersion,
    now: options.now,
  })
  const manifest: StreamManifest = {
    ...built.manifest,
    signedBy: options.deviceId,
  }
  const { payload, signature } = await sealStreamManifest({
    manifest,
    streamKey: options.streamKey,
    device: options.device,
  })
  for (const upload of built.uploads) {
    await options.store.putObject(upload.path, upload.body, {
      metadata: { "updated-at": manifest.createdAt },
    })
  }
  await options.store.putObject(
    streamManifestPath(options.accountId, options.streamId, manifest.version),
    payload,
    { metadata: { "updated-at": manifest.createdAt } },
  )
  await options.store.putObject(
    streamManifestSignaturePath(
      options.accountId,
      options.streamId,
      manifest.version,
    ),
    signature,
    { metadata: { "updated-at": manifest.createdAt } },
  )
  await writeStreamMeta(options.store, options.accountId, options.streamId, {
    streamVersion: manifest.streamVersion,
    manifestVersion: manifest.version,
  })
  return manifest
}

export interface StreamSyncOutcome {
  applied: StreamRemoteRecord[]
  deleted: string[]
  manifest: StreamManifest | null
  tombstones: Record<string, string>
  streamVersion: number
  shardHashes: Record<string, string>
  uploaded: boolean
}

/**
 * One full stream sync: pull, deterministic merge, and push only when the
 * local side introduced changes.
 */
export async function syncStream(options: {
  store: SyncObjectStore
  streamKey: Uint8Array
  roster: Roster
  device: DeviceKeyPair
  deviceId: string
  accountId: string
  streamId: string
  clientId: string
  epoch: number
  local: StreamRecordInput[]
  localTombstones: Record<string, string>
  seenStreamVersion?: number | null
  knownShardHashes?: Record<string, string>
  shardCount?: number
}): Promise<StreamSyncOutcome> {
  const pulled = await pullStream({
    store: options.store,
    streamKey: options.streamKey,
    roster: options.roster,
    accountId: options.accountId,
    streamId: options.streamId,
    seenStreamVersion: options.seenStreamVersion,
    knownShardHashes: options.knownShardHashes,
  })

  const local = await Promise.all(
    options.local.map(async (record) => ({
      ...record,
      recordHash: await hashStreamRecord(record),
    })),
  )
  const merge = mergeStreamRecords({
    local,
    remote: pulled.records,
    tombstones: { ...options.localTombstones, ...pulled.tombstones },
  })

  const remoteIndex = pulled.manifest?.recordsIndex ?? {}
  const dirty =
    merge.winners.some(
      (winner) => remoteIndex[winner.recordId]?.recordHash !== winner.recordHash,
    ) ||
    merge.deleted.length > 0 ||
    stableStringify(merge.tombstones) !== stableStringify(pulled.tombstones)

  if (!dirty && pulled.manifest) {
    return {
      applied: merge.remoteWinners,
      deleted: merge.deleted,
      manifest: pulled.manifest,
      tombstones: merge.tombstones,
      streamVersion: pulled.manifest.streamVersion,
      shardHashes: pulled.shardHashes,
      uploaded: false,
    }
  }

  const manifest = await commitStreamPush({
    store: options.store,
    streamKey: options.streamKey,
    device: options.device,
    deviceId: options.deviceId,
    accountId: options.accountId,
    streamId: options.streamId,
    clientId: options.clientId,
    epoch: options.epoch,
    records: merge.winners,
    tombstones: merge.tombstones,
    baseManifest: pulled.manifest,
    baseTombstones: pulled.tombstones,
    shardCount: options.shardCount,
  })

  const shardHashes: Record<string, string> = {}
  for (const [shardId, entry] of Object.entries(manifest.shards)) {
    shardHashes[shardId] = entry.hash
  }
  return {
    applied: merge.remoteWinners,
    deleted: merge.deleted,
    manifest,
    tombstones: merge.tombstones,
    streamVersion: manifest.streamVersion,
    shardHashes,
    uploaded: true,
  }
}
