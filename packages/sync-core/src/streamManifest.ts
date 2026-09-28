import { SYNC_PROTOCOL_VERSION_V2 } from "@myz/shared/versioning"
import {
  aesGcmDecrypt,
  aesGcmEncrypt,
  hkdfSha256,
  packNoncePayload,
  splitNoncePayload,
  utf8ToBytes,
} from "./crypto"
import type { DeviceKeyPair } from "./deviceKeys"
import { assertNotRollback } from "./highWater"
import { signManifest, verifyManifest } from "./manifest"
import type { Roster } from "./roster"
import { base64ToBytes, decodeBinaryPayload, encodeBinaryPayload } from "./utils"

export interface StreamShardEntry {
  hash: string
  size: number
  nonce: string
}

export interface StreamRecordEntry {
  shardId: number
  updatedAt: string
  recordHash: string
}

export interface StreamManifest {
  protocolVersion: typeof SYNC_PROTOCOL_VERSION_V2
  accountId: string
  streamId: string
  streamVersion: number
  minReaderVersion: number
  features: string[]
  version: number
  baseVersion: number
  epoch: number
  createdAt: string
  clientId: string
  shardCount: number
  recordsIndex: Record<string, StreamRecordEntry>
  shards: Record<string, StreamShardEntry>
  tombstoneShards: Record<string, StreamShardEntry>
  signedBy: string
}

export function streamPrefix(accountId: string, streamId: string): string {
  return `${accountId}/streams/${streamId}`
}

export function formatStreamManifestVersion(version: number): string {
  return `v${String(version).padStart(10, "0")}`
}

export function streamManifestPath(
  accountId: string,
  streamId: string,
  version: number,
): string {
  return `${streamPrefix(accountId, streamId)}/manifests/${formatStreamManifestVersion(version)}.bin`
}

export function streamManifestSignaturePath(
  accountId: string,
  streamId: string,
  version: number,
): string {
  return streamManifestPath(accountId, streamId, version).replace(
    /\.bin$/,
    ".sig",
  )
}

export async function sealStreamManifest(options: {
  manifest: StreamManifest
  streamKey: Uint8Array
  device: DeviceKeyPair
}): Promise<{ payload: Uint8Array; signature: Uint8Array }> {
  const plainBytes = encodeBinaryPayload(options.manifest)
  const key = await hkdfSha256(
    options.streamKey,
    utf8ToBytes(`manifest:${options.manifest.version}`),
    32,
  )
  const { nonce, ciphertext } = await aesGcmEncrypt(key, plainBytes)
  const signature = await signManifest(
    plainBytes,
    options.device.signPrivateKey,
  )
  return { payload: packNoncePayload(nonce, ciphertext), signature }
}

/**
 * Decrypt and verify a stream manifest: the signature must be by an
 * authorized (non-revoked) roster device.
 */
export async function openStreamManifest(options: {
  payload: Uint8Array
  signature: Uint8Array
  streamKey: Uint8Array
  version: number
  roster: Roster
}): Promise<StreamManifest> {
  const key = await hkdfSha256(
    options.streamKey,
    utf8ToBytes(`manifest:${options.version}`),
    32,
  )
  const { nonce, ciphertext } = splitNoncePayload(options.payload, 12)
  const plainBytes = await aesGcmDecrypt(key, nonce, ciphertext)
  const manifest = decodeBinaryPayload(plainBytes) as StreamManifest
  if (manifest.protocolVersion !== SYNC_PROTOCOL_VERSION_V2) {
    throw new Error("Unsupported stream manifest protocol version")
  }
  const signer = options.roster.devices.find(
    (device) => device.deviceId === manifest.signedBy && !device.revokedAt,
  )
  if (!signer) {
    throw new Error("Stream manifest signed by an unauthorized device")
  }
  const valid = await verifyManifest(
    plainBytes,
    options.signature,
    base64ToBytes(signer.signPub),
  )
  if (!valid) {
    throw new Error("Invalid stream manifest signature")
  }
  return manifest
}

/** Reject a manifest older than the highest streamVersion already observed. */
export function assertStreamAdvance(
  seenStreamVersion: number | null | undefined,
  manifest: StreamManifest,
): void {
  assertNotRollback(seenStreamVersion, manifest.streamVersion)
}

export function assertStreamReadable(
  manifest: StreamManifest,
  readerVersion: number,
): void {
  if (manifest.minReaderVersion > readerVersion) {
    throw new Error(
      `Stream requires reader version >= ${manifest.minReaderVersion}`,
    )
  }
}
