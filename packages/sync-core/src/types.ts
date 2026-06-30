import type { Message, ConversationInfo } from "@myz/ai-core/types"
import type { MyZRecord } from "@myz/shared/types"

export type SyncRecordType = "highlight" | "ai-conversation"

export interface SyncConversationBundle {
  conversation: ConversationInfo
  messages: Message[]
}

export type SyncRecordData = MyZRecord | SyncConversationBundle

export interface SyncRecordPayload {
  protocolVersion: string
  recordId: string
  type: SyncRecordType
  updatedAt: string
  data: SyncRecordData
}

export interface SyncRecord {
  recordId: string
  type: SyncRecordType
  updatedAt: string
  data: SyncRecordData
  recordHash: string
}

export interface ManifestRecordEntry {
  chunkId: string
  updatedAt: string
  recordHash: string
}

export interface ManifestChunkEntry {
  hash: string
  size: number
  nonce: string
}

export interface ManifestChainHead {
  keyId: string
  recordHash: string
  updatedAt: string
}

export interface ManifestData {
  protocolVersion: string
  version: number
  createdAt: string
  clientId: string
  baseVersion: number
  epoch: number
  recordsIndex: Record<string, ManifestRecordEntry>
  chunksIndex: Record<string, ManifestChunkEntry>
  chainHeads: Record<string, ManifestChainHead>
}

export interface ChunkEnvelope {
  protocolVersion: string
  recordId: string
  updatedAt: string
  prevHash: string
  keyId: string
  recordCipher: string
  recordNonce: string
}

export interface LockPayload {
  clientId: string
  leaseExpiresAt: string
  issuedAt: string
  signature: string
}
