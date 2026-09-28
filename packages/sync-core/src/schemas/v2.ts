import { SYNC_PROTOCOL_VERSION_V2 } from "@myz/shared/versioning"
import { z } from "zod"

const Base64 = z.string().min(1)

export const DevicePublicKeySchemaV2 = z.object({
  deviceId: z.string().min(1),
  signPub: Base64,
  agreePub: Base64,
  addedAt: z.string(),
  addedBy: z.string().nullable(),
  revokedAt: z.string().nullable().optional(),
})

export const WrappedDataKeySchemaV2 = z.object({
  deviceId: z.string().min(1),
  epoch: z.number().int().nonnegative(),
  ephPub: Base64,
  nonce: Base64,
  cipher: Base64,
})

export const RosterSchemaV2 = z.object({
  protocolVersion: z.literal(SYNC_PROTOCOL_VERSION_V2),
  accountId: z.string().min(1),
  rosterVersion: z.number().int().nonnegative(),
  epoch: z.number().int().nonnegative(),
  createdAt: z.string(),
  devices: z.array(DevicePublicKeySchemaV2),
  wrappedD: z.array(WrappedDataKeySchemaV2),
  signedBy: z.string().min(1),
  signature: Base64,
})

export const DeviceRequestSchemaV2 = z.object({
  protocolVersion: z.literal(SYNC_PROTOCOL_VERSION_V2),
  accountId: z.string().min(1),
  requestId: z.string().min(1),
  deviceId: z.string().min(1),
  signPub: Base64,
  agreePub: Base64,
  name: z.string(),
  createdAt: z.string(),
  expiresAt: z.string(),
  signature: Base64,
})

export const DeviceIndexSchemaV2 = z.object({
  protocolVersion: z.literal(SYNC_PROTOCOL_VERSION_V2),
  accountId: z.string().min(1),
  rosterVersion: z.number().int().nonnegative(),
  latestRequestId: z.string().nullable(),
  updatedAt: z.string(),
  signedBy: z.string().min(1),
  signature: Base64,
})

export const ManifestShardEntrySchemaV2 = z.object({
  hash: z.string(),
  size: z.number(),
  nonce: z.string(),
})

export const ManifestRecordEntrySchemaV2 = z.object({
  shardId: z.number().int().nonnegative(),
  updatedAt: z.string(),
  recordHash: z.string(),
})

export const ManifestDataSchemaV2 = z.object({
  protocolVersion: z.literal(SYNC_PROTOCOL_VERSION_V2),
  streamId: z.string().min(1),
  streamVersion: z.number().int().positive(),
  minReaderVersion: z.number().int().positive(),
  features: z.array(z.string()),
  version: z.number(),
  createdAt: z.string(),
  clientId: z.string(),
  baseVersion: z.number(),
  epoch: z.number(),
  shardCount: z.number().int().positive(),
  recordsIndex: z.record(z.string(), ManifestRecordEntrySchemaV2),
  shards: z.record(z.string(), ManifestShardEntrySchemaV2),
  tombstoneShards: z.record(z.string(), ManifestShardEntrySchemaV2),
  signedBy: z.string().min(1),
})

export const ChunkEnvelopeSchemaV2 = z.object({
  protocolVersion: z.literal(SYNC_PROTOCOL_VERSION_V2),
  recordId: z.string(),
  updatedAt: z.string(),
  prevHash: z.string(),
  keyId: z.string(),
  recordCipher: z.string(),
  recordNonce: z.string(),
})

export type DevicePublicKeyV2 = z.infer<typeof DevicePublicKeySchemaV2>
export type WrappedDataKeyV2 = z.infer<typeof WrappedDataKeySchemaV2>
export type RosterV2 = z.infer<typeof RosterSchemaV2>
export type DeviceRequestV2 = z.infer<typeof DeviceRequestSchemaV2>
export type DeviceIndexV2 = z.infer<typeof DeviceIndexSchemaV2>
export type ManifestDataV2 = z.infer<typeof ManifestDataSchemaV2>
export type ChunkEnvelopeV2 = z.infer<typeof ChunkEnvelopeSchemaV2>
