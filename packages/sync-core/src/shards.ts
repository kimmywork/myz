import {
  aesGcmDecrypt,
  aesGcmEncrypt,
  hkdfSha256,
  packNoncePayload,
  splitNoncePayload,
  utf8ToBytes,
} from "./crypto"
import { jumpConsistentHash } from "./jumpHash"
import type { SyncRecord } from "./types"
import { decodeBinaryPayload, encodeBinaryPayload } from "./utils"

export type ShardKind = "records" | "tombstones"

export interface PackedRecord {
  recordId: string
  updatedAt: string
  recordHash: string
  recordCipher: string
  recordNonce: string
}

export interface ShardPayload<T> {
  kind: ShardKind
  shardId: number
  value: T
}

export interface RecordShardValue {
  records: Record<string, PackedRecord>
}

export interface TombstoneShardValue {
  tombstones: Record<string, string>
}

export function recordShardId(recordId: string, shardCount: number): number {
  return jumpConsistentHash(recordId, shardCount)
}

function shardKeyInfo(kind: ShardKind, shardId: number): Uint8Array {
  return utf8ToBytes(`shard-key:${kind}:${shardId}`)
}

export async function buildShard<T>(
  streamKey: Uint8Array,
  kind: ShardKind,
  shardId: number,
  value: T,
): Promise<Uint8Array> {
  const key = await hkdfSha256(streamKey, shardKeyInfo(kind, shardId), 32)
  const payload: ShardPayload<T> = { kind, shardId, value }
  const { nonce, ciphertext } = await aesGcmEncrypt(
    key,
    encodeBinaryPayload(payload),
  )
  return packNoncePayload(nonce, ciphertext)
}

export async function openShard<T>(
  streamKey: Uint8Array,
  kind: ShardKind,
  shardId: number,
  body: Uint8Array,
): Promise<T> {
  const key = await hkdfSha256(streamKey, shardKeyInfo(kind, shardId), 32)
  const { nonce, ciphertext } = splitNoncePayload(body, 12)
  const plain = await aesGcmDecrypt(key, nonce, ciphertext)
  const payload = decodeBinaryPayload(plain) as ShardPayload<T>
  if (payload.kind !== kind || payload.shardId !== shardId) {
    throw new Error("Shard payload does not match its declared kind/shard")
  }
  return payload.value
}

/**
 * Merge packed records into their shards, preserving the declared `shardCount`.
 * Records are grouped by `recordShardId`.
 */
export function groupRecordsByShard(
  records: PackedRecord[],
  shardCount: number,
): Map<number, PackedRecord[]> {
  const groups = new Map<number, PackedRecord[]>()
  for (const record of records) {
    const shardId = recordShardId(record.recordId, shardCount)
    const existing = groups.get(shardId)
    if (existing) {
      existing.push(record)
    } else {
      groups.set(shardId, [record])
    }
  }
  return groups
}

export function groupTombstonesByShard(
  tombstones: Record<string, string>,
  shardCount: number,
): Map<number, Record<string, string>> {
  const groups = new Map<number, Record<string, string>>()
  for (const [recordId, deletedAt] of Object.entries(tombstones)) {
    const shardId = recordShardId(recordId, shardCount)
    const existing = groups.get(shardId)
    if (existing) {
      existing[recordId] = deletedAt
    } else {
      groups.set(shardId, { [recordId]: deletedAt })
    }
  }
  return groups
}

/** Opaque preservation: keep unknown/unmaterializable records untouched. */
export function preserveUnknownRecords<T>(
  known: Record<string, T>,
  remote: Record<string, unknown>,
): Record<string, unknown> {
  const preserved: Record<string, unknown> = {}
  for (const [recordId, value] of Object.entries(remote)) {
    if (!(recordId in known)) {
      preserved[recordId] = value
    }
  }
  return preserved
}

export function collectRecordShardIds(
  records: SyncRecord[],
  shardCount: number,
): Set<number> {
  const shards = new Set<number>()
  for (const record of records) {
    shards.add(recordShardId(record.recordId, shardCount))
  }
  return shards
}
