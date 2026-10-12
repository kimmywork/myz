import type { SyncObjectStore } from "../adapters"
import {
  aesGcmDecrypt,
  aesGcmEncrypt,
  bytesToUtf8,
  hkdfSha256,
  sha256,
  splitNoncePayload,
  utf8ToBytes,
} from "../crypto"
import { streamPrefix, type StreamShardEntry } from "../streamManifest"
import {
  base32Encode,
  base64ToBytes,
  bytesToBase64,
  bytesToHex,
  decodeBinaryPayload,
  encodeBinaryPayload,
  stableStringify,
} from "../utils"

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

export interface StreamMeta {
  streamVersion: number
  manifestVersion: number
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

export async function verifyShardBody(
  body: Uint8Array,
  entry: StreamShardEntry,
): Promise<void> {
  const hash = bytesToHex(await sha256(body))
  if (hash !== entry.hash || body.length !== entry.size) {
    throw new Error("Stream shard integrity check failed")
  }
}

export async function shardEntry(
  body: Uint8Array,
): Promise<StreamShardEntry> {
  const nonce = splitNoncePayload(body, 12).nonce
  return {
    hash: bytesToHex(await sha256(body)),
    size: body.length,
    nonce: bytesToBase64(nonce),
  }
}

export async function readStreamMeta(
  store: SyncObjectStore,
  accountId: string,
  streamId: string,
): Promise<StreamMeta | null> {
  const object = await store.getObject(streamMetaPath(accountId, streamId))
  if (!object) return null
  // The stream meta object is unsigned, so it is untrusted: treat it as a hint
  // pointing at the signed manifest. A malformed or tampered meta must never
  // abort or corrupt the signed-manifest flow, so parsing/validation failures
  // degrade to `null` (callers then treat the stream as absent) rather than
  // throwing or forcing a rollback.
  let parsed: unknown
  try {
    parsed = JSON.parse(bytesToUtf8(object.body))
  } catch (error) {
    console.warn("Ignoring malformed stream meta", error)
    return null
  }
  if (!isValidStreamMeta(parsed)) {
    console.warn("Ignoring invalid stream meta")
    return null
  }
  return parsed
}

function isValidStreamMeta(value: unknown): value is StreamMeta {
  if (!value || typeof value !== "object") return false
  const candidate = value as Partial<StreamMeta>
  return (
    Number.isInteger(candidate.streamVersion) &&
    (candidate.streamVersion as number) >= 0 &&
    Number.isInteger(candidate.manifestVersion) &&
    (candidate.manifestVersion as number) >= 0
  )
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
