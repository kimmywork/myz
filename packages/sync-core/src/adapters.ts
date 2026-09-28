import type {
  ChunkEnvelope,
  ManifestData,
  SyncRecord,
  SyncRecordPayload,
  SyncRecordType,
} from "./types"

export interface SyncObjectInfo {
  key: string
  lastModified?: string
  etag?: string
  size?: number
}

export interface SyncGetObjectResult {
  body: Uint8Array
  etag?: string
}

export interface SyncPutOptions {
  contentType?: string
  metadata?: Record<string, string>
  ifMatch?: string
  ifNoneMatch?: string
}

export interface SyncDeleteOptions {
  ifMatch?: string
}

export interface SyncObjectStore {
  listObjects(prefix: string): Promise<SyncObjectInfo[]>
  getObject(path: string): Promise<SyncGetObjectResult | null>
  headObject?(path: string): Promise<{ etag?: string } | null>
  putObject(path: string, body: Uint8Array, options?: SyncPutOptions): Promise<void>
  deleteObject(path: string, options?: SyncDeleteOptions): Promise<void>
}

export interface SyncRemoteKeyset {
  masterKey: Uint8Array
  publicKey: Uint8Array
}

export interface SyncRemoteManifestSnapshot {
  manifest: ManifestData
  version: number
  manifestPath: string
  signaturePath: string
}

export interface SyncDatasetDescriptor {
  id: string
  description?: string
  recordTypes: SyncRecordType[]
}

export interface SyncDatasetAdapter {
  dataset: SyncDatasetDescriptor
  collectLocalRecords(): Promise<SyncRecord[]>
  applyRemoteRecord(payload: SyncRecordPayload): Promise<void>
  deleteLocalRecord(recordId: string): Promise<void>
}

export interface SyncRecordStateEntry {
  recordId: string
  recordHash: string
  updatedAt: string
}

export interface SyncDeletionEntry {
  recordId: string
  deletedAt: string
}

export interface SyncStateSnapshot {
  clientId: string
  epoch: number
  keyId: string | null
  keyUpdatedAt: string | null
  lastManifestVersion: number
  lastManifestCreatedAt: string | null
  lastSyncAt: string | null
}

export interface SyncStateStore {
  readState(): Promise<SyncStateSnapshot | null>
  writeState(state: SyncStateSnapshot): Promise<void>
  listRecordStates(): Promise<SyncRecordStateEntry[]>
  upsertRecordState(entry: SyncRecordStateEntry): Promise<void>
  removeRecordState(recordId: string): Promise<void>
  listDeletions(): Promise<SyncDeletionEntry[]>
  upsertDeletion(entry: SyncDeletionEntry): Promise<void>
  removeDeletion(recordId: string): Promise<void>
}

export interface SyncRemoteRecordBundle {
  recordId: string
  chunkEnvelope: ChunkEnvelope
  payload: SyncRecordPayload
}
