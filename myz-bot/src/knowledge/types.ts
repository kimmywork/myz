export type KnowledgeLayer = "concepts" | "structure" | "behavior" | "ops"

export interface KnowledgeEntryMeta {
  id: string
  layer: KnowledgeLayer
  title: string
  tags: string[]
  sourceRecordIds: string[]
  sourceUrls: string[]
  createdAt: string
  updatedAt: string
  confidence: number
  accessCount: number
  expiresAt?: string
  relatedEntryIds: string[]
  pinned?: boolean
  promotedTo?: string
  archived?: boolean
}

export interface KnowledgeEntry {
  meta: KnowledgeEntryMeta
  body: string
}

export interface KnowledgeIndexEntry {
  id: string
  layer: KnowledgeLayer
  title: string
  tags: string[]
  filePath: string
  updatedAt: string
  confidence: number
  accessCount: number
  sourceRecordIds: string[]
  expiresAt?: string
  pinned?: boolean
  archived?: boolean
}

export interface KnowledgeIndex {
  schemaVersion: string
  entries: KnowledgeIndexEntry[]
  lastIngestedRecordId?: string
  lastIngestedAt?: string
}

export const KNOWLEDGE_SCHEMA_VERSION = "1.0.0"
