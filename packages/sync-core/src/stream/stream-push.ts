import { SYNC_PROTOCOL_VERSION_V2 } from "@myz/shared/versioning"
import type { SyncObjectStore } from "../adapters"
import { mapConcurrent } from "../concurrency"
import type { DeviceKeyPair } from "../deviceKeys"
import {
  buildShard,
  groupTombstonesByShard,
  recordShardId,
} from "../shards"
import {
  sealStreamManifest,
  streamManifestPath,
  streamManifestSignaturePath,
  type StreamManifest,
  type StreamShardEntry,
} from "../streamManifest"
import { stableStringify } from "../utils"
import {
  hashStreamRecord,
  packStreamRecord,
  shardEntry,
  streamShardPath,
  streamTombstonePath,
  writeStreamMeta,
  type StreamRecordInput,
} from "./stream-records"

const IO_CONCURRENCY = 6

export interface StreamPushResult {
  manifest: StreamManifest
  uploads: Array<{ path: string; body: Uint8Array }>
}

/** Options shared by {@link buildStreamPush} and {@link commitStreamPush}. */
export interface StreamPushOptions {
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
}

/** Build (but do not upload) a new signed-ready manifest and its shards. */
export async function buildStreamPush(
  options: StreamPushOptions,
): Promise<StreamPushResult> {
  const shardCount =
    options.shardCount ?? options.baseManifest?.shardCount ?? 64
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
    stableStringify(options.baseTombstones) ===
      stableStringify(options.tombstones)
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
          path: streamTombstonePath(
            options.accountId,
            options.streamId,
            shardId,
          ),
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
export async function commitStreamPush(
  options: StreamPushOptions & {
    store: SyncObjectStore
    device: DeviceKeyPair
    deviceId: string
  },
): Promise<StreamManifest> {
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
  await mapConcurrent(built.uploads, IO_CONCURRENCY, (upload) =>
    options.store.putObject(upload.path, upload.body, {
      metadata: { "updated-at": manifest.createdAt },
    }),
  )
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
