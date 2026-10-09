import type { SyncObjectStore } from "../adapters"
import { mapConcurrent } from "../concurrency"
import { assertNotRollback } from "../highWater"
import type { Roster } from "../roster"
import { openShard } from "../shards"
import {
  assertStreamReadable,
  openStreamManifest,
  streamManifestPath,
  streamManifestSignaturePath,
  type StreamManifest,
  type StreamShardEntry,
} from "../streamManifest"
import {
  openStreamRecord,
  readStreamMeta,
  streamShardPath,
  streamTombstonePath,
  verifyShardBody,
  type StreamPackedRecord,
  type StreamRemoteRecord,
} from "./stream-records"

const IO_CONCURRENCY = 6

export interface StreamPullResult {
  manifest: StreamManifest | null
  records: Map<string, StreamRemoteRecord>
  tombstones: Record<string, string>
  shardHashes: Record<string, string>
  streamVersion: number | null
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
    streamManifestPath(
      options.accountId,
      options.streamId,
      meta.manifestVersion,
    ),
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

  const shardTargets: Array<[string, StreamShardEntry]> = []
  for (const [shardId, entry] of Object.entries(manifest.shards)) {
    shardHashes[shardId] = entry.hash
    if (options.knownShardHashes?.[shardId] === entry.hash) continue
    shardTargets.push([shardId, entry])
  }
  const shardBodies = await mapConcurrent(
    shardTargets,
    IO_CONCURRENCY,
    async ([shardId, entry]) => {
      const object = await options.store.getObject(
        streamShardPath(options.accountId, options.streamId, Number(shardId)),
      )
      if (!object) throw new Error(`Missing stream shard ${shardId}`)
      await verifyShardBody(object.body, entry)
      return { shardId, body: object.body }
    },
  )
  for (const { shardId, body } of shardBodies) {
    const value = await openShard<{
      records: Record<string, StreamPackedRecord>
    }>(options.streamKey, "records", Number(shardId), body)
    for (const packed of Object.values(value.records)) {
      const record = await openStreamRecord(options.streamKey, packed)
      records.set(record.recordId, record)
    }
  }

  const tombstoneTargets = Object.entries(manifest.tombstoneShards)
  const tombstoneBodies = await mapConcurrent(
    tombstoneTargets,
    IO_CONCURRENCY,
    async ([shardId, entry]) => {
      const object = await options.store.getObject(
        streamTombstonePath(
          options.accountId,
          options.streamId,
          Number(shardId),
        ),
      )
      if (!object) throw new Error(`Missing tombstone shard ${shardId}`)
      await verifyShardBody(object.body, entry)
      return { shardId, body: object.body }
    },
  )
  for (const { shardId, body } of tombstoneBodies) {
    const value = await openShard<{ tombstones: Record<string, string> }>(
      options.streamKey,
      "tombstones",
      Number(shardId),
      body,
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
