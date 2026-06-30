import { SYNC_PROTOCOL_VERSION } from "@myz/shared/versioning"
import { z } from "zod"

export const SyncProtocolVersionV1 = SYNC_PROTOCOL_VERSION

export const SyncRecordPayloadSchemaV1 = z.object({
  protocolVersion: z.literal(SYNC_PROTOCOL_VERSION),
  recordId: z.string(),
  type: z.enum(["highlight", "ai-conversation"]),
  updatedAt: z.string(),
  data: z.unknown(),
})

export const ManifestRecordEntrySchemaV1 = z.object({
  chunkId: z.string(),
  updatedAt: z.string(),
  recordHash: z.string(),
})

export const ManifestChunkEntrySchemaV1 = z.object({
  hash: z.string(),
  size: z.number(),
  nonce: z.string(),
})

export const ManifestChainHeadSchemaV1 = z.object({
  keyId: z.string(),
  recordHash: z.string(),
  updatedAt: z.string(),
})

export const ManifestDataSchemaV1 = z.object({
  protocolVersion: z.literal(SYNC_PROTOCOL_VERSION),
  version: z.number(),
  createdAt: z.string(),
  clientId: z.string(),
  baseVersion: z.number(),
  epoch: z.number(),
  recordsIndex: z.record(z.string(), ManifestRecordEntrySchemaV1),
  chunksIndex: z.record(z.string(), ManifestChunkEntrySchemaV1),
  chainHeads: z.record(z.string(), ManifestChainHeadSchemaV1),
})

export const ChunkEnvelopeSchemaV1 = z.object({
  protocolVersion: z.literal(SYNC_PROTOCOL_VERSION),
  recordId: z.string(),
  updatedAt: z.string(),
  prevHash: z.string(),
  keyId: z.string(),
  recordCipher: z.string(),
  recordNonce: z.string(),
})

export const LockPayloadSchemaV1 = z.object({
  clientId: z.string(),
  leaseExpiresAt: z.string(),
  issuedAt: z.string(),
  signature: z.string(),
})

export type SyncRecordPayloadV1 = z.infer<typeof SyncRecordPayloadSchemaV1>
export type ManifestDataV1 = z.infer<typeof ManifestDataSchemaV1>
export type ChunkEnvelopeV1 = z.infer<typeof ChunkEnvelopeSchemaV1>
export type LockPayloadV1 = z.infer<typeof LockPayloadSchemaV1>
