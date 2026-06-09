export type {
  KnowledgeLayer,
  KnowledgeEntryMeta,
  KnowledgeEntry,
  KnowledgeIndexEntry,
  KnowledgeIndex,
} from "./types"
export { KNOWLEDGE_SCHEMA_VERSION } from "./types"
export {
  createEntry,
  getEntry,
  updateEntry,
  deleteEntry,
  listEntries,
  searchEntries,
  loadIndex,
  saveIndex,
  initKnowledgeDirs,
} from "./knowledgeStore"
export { renderKnowledgeContext } from "./knowledgeContext"
export { loadRecords, loadRecordsSince, resolveDesktopRecordsPath } from "./recordsAdapter"
export type { MyZRecord, RecordsAdapterConfig, RecordsSnapshot } from "./recordsAdapter"
export { classifyRecord } from "./recordClassifier"
export type { ClassificationResult } from "./recordClassifier"
export { ingestRecords, getIngestStatus } from "./knowledgeIngest"
export type { IngestOptions, IngestResult } from "./knowledgeIngest"
export { createKnowledgeTools } from "./knowledgeTools"
