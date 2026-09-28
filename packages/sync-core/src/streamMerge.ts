import type { StreamRemoteRecord } from "./streamClient"

export interface StreamMergeResult {
  winners: StreamRemoteRecord[]
  remoteWinners: StreamRemoteRecord[]
  deleted: string[]
  tombstones: Record<string, string>
}

function compare(
  a: StreamRemoteRecord,
  b: StreamRemoteRecord,
): number {
  const timeA = Date.parse(a.updatedAt)
  const timeB = Date.parse(b.updatedAt)
  if (timeA !== timeB) return timeA - timeB
  if (a.recordHash === b.recordHash) return 0
  return a.recordHash < b.recordHash ? -1 : 1
}

/**
 * Deterministic latest-write-wins merge for a stream:
 * - higher `updatedAt` wins; equal `updatedAt` -> higher `recordHash`;
 * - a tombstone newer than the winning record deletes it;
 * - local records absent remotely are kept (pending upload).
 */
export function mergeStreamRecords(options: {
  local: StreamRemoteRecord[]
  remote: Map<string, StreamRemoteRecord>
  tombstones: Record<string, string>
}): StreamMergeResult {
  const localMap = new Map(
    options.local.map((record) => [record.recordId, record]),
  )
  const ids = new Set<string>([
    ...localMap.keys(),
    ...options.remote.keys(),
  ])

  const winners: StreamRemoteRecord[] = []
  const remoteWinners: StreamRemoteRecord[] = []
  const deleted: string[] = []

  for (const recordId of ids) {
    const local = localMap.get(recordId)
    const remote = options.remote.get(recordId)
    const latest =
      !local && remote
        ? remote
        : !remote && local
          ? local
          : compare(remote!, local!) > 0
            ? remote!
            : local!
    const tombstone = options.tombstones[recordId]
    if (
      tombstone &&
      Date.parse(tombstone) > Date.parse(latest.updatedAt)
    ) {
      deleted.push(recordId)
      continue
    }
    winners.push(latest)
    if (latest === remote) remoteWinners.push(remote)
  }

  const deletedSet = new Set(deleted)
  const tombstones: Record<string, string> = {}
  for (const [recordId, deletedAt] of Object.entries(options.tombstones)) {
    if (deletedSet.has(recordId) || !ids.has(recordId)) {
      tombstones[recordId] = deletedAt
    }
  }

  return { winners, remoteWinners, deleted, tombstones }
}
