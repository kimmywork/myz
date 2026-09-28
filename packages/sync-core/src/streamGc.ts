import type { SyncObjectStore } from "./adapters"
import type { Roster } from "./roster"
import {
  streamShardPath,
  streamTombstonePath,
} from "./streamClient"
import {
  openStreamManifest,
  streamManifestPath,
  streamManifestSignaturePath,
  streamPrefix,
} from "./streamManifest"

const DEFAULT_KEEP_MANIFESTS = 30

export interface StreamGcResult {
  deletedManifests: number
  deletedShards: number
}

function parseManifestVersion(key: string): number | null {
  const match = key.match(/\/manifests\/v(\d+)\.bin$/)
  if (!match) return null
  return Number(match[1])
}

function shardIdFromKey(key: string): number | null {
  const match = key.match(/\/(?:shards|tombstones)\/(\d+)\.bin$/)
  if (!match) return null
  return Number(match[1])
}

/**
 * Per-stream GC: keep the newest `keepManifests` manifests and delete shard /
 * tombstone objects that no longer appear in any kept (verified) manifest.
 * If a kept manifest cannot be opened, GC aborts before deleting anything.
 */
export async function gcStream(options: {
  store: SyncObjectStore
  accountId: string
  streamId: string
  streamKey: Uint8Array
  roster: Roster
  keepManifests?: number
}): Promise<StreamGcResult> {
  const prefix = streamPrefix(options.accountId, options.streamId)
  const keepCount = options.keepManifests ?? DEFAULT_KEEP_MANIFESTS

  const manifestObjects = await options.store.listObjects(`${prefix}/manifests/`)
  const versions = manifestObjects
    .map((object) => ({
      key: object.key,
      version: parseManifestVersion(object.key),
    }))
    .filter((entry) => entry.version !== null)
    .sort((a, b) => (b.version as number) - (a.version as number))

  const keep = versions.slice(0, keepCount)
  const remove = versions.slice(keepCount)

  const recordRefs = new Set<number>()
  const tombstoneRefs = new Set<number>()
  for (const entry of keep) {
    if (entry.version === null) continue
    const payload = await options.store.getObject(entry.key)
    const signature = await options.store.getObject(
      entry.key.replace(/\.bin$/, ".sig"),
    )
    if (!payload || !signature) {
      throw new Error(`Missing manifest or signature for ${entry.key}`)
    }
    const manifest = await openStreamManifest({
      payload: payload.body,
      signature: signature.body,
      streamKey: options.streamKey,
      version: entry.version,
      roster: options.roster,
    })
    for (const shardId of Object.keys(manifest.shards)) {
      recordRefs.add(Number(shardId))
    }
    for (const shardId of Object.keys(manifest.tombstoneShards)) {
      tombstoneRefs.add(Number(shardId))
    }
  }

  let deletedManifests = 0
  for (const entry of remove) {
    if (!entry.key) continue
    await options.store.deleteObject(entry.key)
    await options.store.deleteObject(entry.key.replace(/\.bin$/, ".sig"))
    deletedManifests += 1
  }

  let deletedShards = 0
  const shardObjects = await options.store.listObjects(`${prefix}/shards/`)
  for (const object of shardObjects) {
    const shardId = shardIdFromKey(object.key)
    if (shardId === null || recordRefs.has(shardId)) continue
    await options.store.deleteObject(object.key)
    deletedShards += 1
  }
  const tombstoneObjects = await options.store.listObjects(
    `${prefix}/tombstones/`,
  )
  for (const object of tombstoneObjects) {
    const shardId = shardIdFromKey(object.key)
    if (shardId === null || tombstoneRefs.has(shardId)) continue
    await options.store.deleteObject(object.key)
    deletedShards += 1
  }

  return { deletedManifests, deletedShards }
}

// Re-exported for callers that only need path helpers alongside GC.
export { streamManifestPath, streamManifestSignaturePath, streamShardPath, streamTombstonePath }
