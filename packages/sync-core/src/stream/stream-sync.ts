import type { SyncObjectStore } from "../adapters"
import type { DeviceKeyPair } from "../deviceKeys"
import type { Roster } from "../roster"
import { readStreamAcks, writeStreamAck } from "../streamAcks"
import type { StreamManifest } from "../streamManifest"
import { mergeStreamRecords } from "../streamMerge"
import { stableStringify } from "../utils"
import { pullStream } from "./stream-pull"
import { commitStreamPush } from "./stream-push"
import {
  hashStreamRecord,
  type StreamRecordInput,
  type StreamRemoteRecord,
} from "./stream-records"

/** Tombstones older than this are dropped on the next push (TTL retention). */
export const DEFAULT_TOMBSTONE_RETENTION_MS = 90 * 24 * 60 * 60 * 1000

/** Shorter retention used once every authorized device has acknowledged. */
export const DEFAULT_TOMBSTONE_MIN_RETENTION_MS = 24 * 60 * 60 * 1000

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
  tombstoneRetentionMs?: number
  tombstoneMinRetentionMs?: number
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

  // Reclaim tombstones sooner only once every authorized device has applied the
  // current version; otherwise keep the longer TTL.
  const currentVersion = pulled.manifest?.streamVersion ?? 0
  const authorized = options.roster.devices.filter((entry) => !entry.revokedAt)
  let allAcked = currentVersion > 0 && authorized.length > 0
  if (allAcked) {
    const acks = await readStreamAcks(options.store, {
      accountId: options.accountId,
      streamId: options.streamId,
      roster: options.roster,
    })
    for (const device of authorized) {
      if (device.deviceId === options.deviceId) continue
      if ((acks.get(device.deviceId) ?? -1) < currentVersion) {
        allAcked = false
        break
      }
    }
  }
  const retentionMs = allAcked
    ? (options.tombstoneMinRetentionMs ?? DEFAULT_TOMBSTONE_MIN_RETENTION_MS)
    : (options.tombstoneRetentionMs ?? DEFAULT_TOMBSTONE_RETENTION_MS)
  const cutoff = Date.now() - retentionMs
  const incomingTombstones = Object.fromEntries(
    Object.entries({
      ...options.localTombstones,
      ...pulled.tombstones,
    }).filter(([, deletedAt]) => {
      const at = Date.parse(deletedAt)
      return Number.isNaN(at) || at >= cutoff
    }),
  )
  const merge = mergeStreamRecords({
    local,
    remote: pulled.records,
    tombstones: incomingTombstones,
  })

  const remoteIndex = pulled.manifest?.recordsIndex ?? {}
  const dirty =
    merge.winners.some(
      (winner) =>
        remoteIndex[winner.recordId]?.recordHash !== winner.recordHash,
    ) ||
    merge.deleted.length > 0 ||
    stableStringify(merge.tombstones) !== stableStringify(pulled.tombstones)

  if (!dirty && pulled.manifest) {
    await writeStreamAck(options.store, {
      accountId: options.accountId,
      streamId: options.streamId,
      device: options.device,
      deviceId: options.deviceId,
      streamVersion: pulled.manifest.streamVersion,
    })
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
  await writeStreamAck(options.store, {
    accountId: options.accountId,
    streamId: options.streamId,
    device: options.device,
    deviceId: options.deviceId,
    streamVersion: manifest.streamVersion,
  })
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
