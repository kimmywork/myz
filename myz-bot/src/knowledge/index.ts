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
export { createKnowledgeTools } from "./knowledgeTools"
