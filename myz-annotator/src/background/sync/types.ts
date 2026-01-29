export type SyncRecordType = "highlight" | "ai-conversation";

export interface SyncRecordPayload {
  recordId: string;
  type: SyncRecordType;
  updatedAt: string;
  data: any;
}

export interface SyncRecord {
  recordId: string;
  type: SyncRecordType;
  updatedAt: string;
  data: any;
  recordHash: string;
}

export interface ManifestRecordEntry {
  chunkId: string;
  updatedAt: string;
  recordHash: string;
}

export interface ManifestChunkEntry {
  hash: string;
  size: number;
  nonce: string;
}

export interface ManifestChainHead {
  keyId: string;
  recordHash: string;
  updatedAt: string;
}

export interface ManifestData {
  version: number;
  createdAt: string;
  clientId: string;
  baseVersion: number;
  epoch: number;
  recordsIndex: Record<string, ManifestRecordEntry>;
  chunksIndex: Record<string, ManifestChunkEntry>;
  chainHeads: Record<string, ManifestChainHead>;
}

export interface ChunkEnvelope {
  recordId: string;
  updatedAt: string;
  prevHash: string;
  keyId: string;
  recordCipher: string;
  recordNonce: string;
}

export interface LockPayload {
  clientId: string;
  leaseExpiresAt: string;
  issuedAt: string;
  signature: string;
}
