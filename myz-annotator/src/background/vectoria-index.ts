import { HybridSearchEngine, OpenAIEmbedder, VectorStore } from "@myz/vectoria"
import { normalizeBaseUrl } from "./ai/runtime/openaiCompatible.js"
import type {
  AIProviderSetting,
  Settings,
  VectorSettings,
} from "./settings.js"
import { MyZRecord } from "@/shared/types.ts"
import { isRecord, isStringArray } from "@/shared/typeUtils"

const DOC_MAP_KEY = "myz::vectoriaDocMap"
const DB_NAME = "myz-vectoria"
const STORE_NAME = "myz-vectoria-store"
const DEFAULT_MAX_CHARS = 500
const MAX_ADD_DOCS_PER_BATCH = 64
const MAX_ADD_CHARS_PER_BATCH = 20_000

let engineInstance: HybridSearchEngine | null = null
let engineInitPromise: Promise<HybridSearchEngine> | null = null

interface VectorSearchRuntimeState {
  enabled: boolean;
  target: VectorSettings["target"];
  lastTest: VectorSettings["lastTest"];
  providers: AIProviderSetting[];
  signature: string;
}

export interface VectoriaDocument {
  text: string;
  metadata: VectoriaMetadata;
}

export type VectoriaSearchResult = VectoriaDocument & {
  id: string;
  score: number;
};

export interface VectoriaMetadata {
  recordId: string;
  kind: string;
  url: string;
  host: string;
  title: string;
  tags: string[];
  createdAt: string;
  section: string;
  chunkIndex: number;
  chunkCount: number;
}
const vectorSearchState: VectorSearchRuntimeState = {
  enabled: false,
  target: null,
  lastTest: null,
  providers: [],
  signature: "",
};

function resolveEmbedderConfig(): {
  baseUrl: string;
  apiKey: string;
  model: string;
} | null {
  if (!vectorSearchState.enabled) return null;
  if (!vectorSearchState.target) return null;
  if (!vectorSearchState.lastTest?.ok) return null;
  if (
    vectorSearchState.lastTest.providerId !==
      vectorSearchState.target.providerId ||
    vectorSearchState.lastTest.modelId !== vectorSearchState.target.modelId
  ) {
    return null;
  }

  const provider = vectorSearchState.providers.find(
    (p) => p.id === vectorSearchState.target?.providerId,
  );
  const model = provider?.models?.find(
    (m) => m.id === vectorSearchState.target?.modelId,
  );

  const baseUrl = provider?.baseUrl || "";
  const apiKey = provider?.apiKey || "";
  const modelName = model?.model || "";
  if (!baseUrl || !apiKey || !modelName) {
    return null;
  }

  return { baseUrl, apiKey, model: modelName };
}

export function applyVectorSearchSettings(
  settings: Pick<Settings, "aiProviders" | "vectorSearch">,
) {
  vectorSearchState.enabled = Boolean(settings?.vectorSearch?.enabled);
  vectorSearchState.target = settings?.vectorSearch?.target || null;
  vectorSearchState.lastTest = settings?.vectorSearch?.lastTest || null;
  vectorSearchState.providers = Array.isArray(settings?.aiProviders)
    ? settings.aiProviders
    : [];

  const config = resolveEmbedderConfig();
  const signature = config
    ? JSON.stringify({
        enabled: vectorSearchState.enabled,
        providerId: vectorSearchState.target?.providerId,
        modelId: vectorSearchState.target?.modelId,
        baseUrl: normalizeBaseUrl(config.baseUrl),
        model: config.model,
        hasKey: config.apiKey ? 1 : 0,
      })
    : "";

  if (signature !== vectorSearchState.signature) {
    engineInstance = null
    engineInitPromise = null
  }
  vectorSearchState.signature = signature
}

async function ensureEngine(): Promise<HybridSearchEngine | undefined> {
  const config = resolveEmbedderConfig()
  if (!config) return undefined
  if (engineInstance) return engineInstance
  if (engineInitPromise) return engineInitPromise

  engineInitPromise = (async () => {
    const embedder = new OpenAIEmbedder({
      apiKey: config.apiKey,
      endpoint: normalizeBaseUrl(config.baseUrl),
      modelName: config.model,
    })
    const db = new VectorStore(DB_NAME, STORE_NAME)
    const engine = new HybridSearchEngine(db, embedder)
    await engine.init()
    engineInstance = engine
    return engineInstance
  })().catch((error) => {
    engineInstance = null
    throw error
  })

  try {
    return await engineInitPromise
  } finally {
    engineInitPromise = null
  }
}

export async function getEngine(): Promise<HybridSearchEngine | undefined> {
  return ensureEngine()
}

type DocMap = Record<string, string[]>;

async function readDocMap(): Promise<DocMap> {
  const { [DOC_MAP_KEY]: stored } = await chrome.storage.local.get(DOC_MAP_KEY);
  if (!isRecord(stored)) return {};
  const map: DocMap = {};
  Object.entries(stored).forEach(([key, value]) => {
    if (isStringArray(value)) {
      map[key] = value;
    }
  });
  return map;
}

async function writeDocMap(map: DocMap) {
  await chrome.storage.local.set({ [DOC_MAP_KEY]: map });
}

async function clearDocMap() {
  await writeDocMap({});
}

function splitSentences(text: string): string[] {
  const normalized = (text || "").replace(/\s+/g, " ").trim();
  if (!normalized) return [];
  const parts = normalized
    .split(/(?<=[。！？!?；;．\.])\s+|\n+/)
    .map((p) => p.trim())
    .filter(Boolean);
  return parts.length ? parts : [normalized];
}

function chunkText(text: string, maxChars?: number): string[] {
  const limit = Math.max(
    1,
    typeof maxChars === "number" && maxChars > 0 ? maxChars : DEFAULT_MAX_CHARS,
  );
  const sentences = splitSentences(text);
  if (!sentences.length) return [];

  const chunks = [];
  let current = "";
  sentences.forEach((sentence) => {
    const unit = sentence.trim();
    if (!unit) return;
    if (!current) {
      current = unit;
    } else if ((current + " " + unit).length <= limit) {
      current = `${current} ${unit}`.trim();
    } else {
      chunks.push(current);
      current = unit;
    }

    // Handle extremely long single sentence
    while (current.length > limit) {
      chunks.push(current.slice(0, limit));
      current = current.slice(limit);
    }
  });
  if (current) {
    chunks.push(current);
  }
  return chunks;
}

function extractHost(url: string): string {
  try {
    return new URL(url).hostname || "";
  } catch {
    return "";
  }
}

function buildDocumentsFromRecord(record: MyZRecord): VectoriaDocument[] {
  if (!record || !record.id) return [];
  const sections = [];
  const baseMeta: Partial<VectoriaMetadata> = {
    recordId: record.id,
    kind: record.kind || "highlight",
    url: record.url || "",
    host: record.hostname || extractHost(record.url || ""),
    title: record.title || "",
    tags: Array.isArray(record.tags) ? record.tags : [],
    createdAt: record.createdAt || record.updatedAt || new Date().toISOString(),
  };

  if (typeof record.text === "string" && record.text.trim()) {
    sections.push({ text: record.text, section: "text" });
  }
  if (typeof record.note === "string" && record.note.trim()) {
    sections.push({ text: record.note, section: "note" });
  }
  if (!sections.length) return [];

  const docs: VectoriaDocument[] = [];
  sections.forEach((section) => {
    const chunks = chunkText(section.text, DEFAULT_MAX_CHARS);
    chunks.forEach((chunk, idx) => {
      docs.push({
        text: chunk,
        metadata: {
          ...baseMeta,
          section: section.section,
          chunkIndex: idx,
          chunkCount: chunks.length,
        } as VectoriaMetadata,
      });
    });
  });
  return docs;
}

function batchDocumentsForAdd(docs: VectoriaDocument[]): VectoriaDocument[][] {
  const batches: VectoriaDocument[][] = [];
  let current: VectoriaDocument[] = [];
  let currentChars = 0;

  for (const doc of docs) {
    const textLen = typeof doc.text === "string" ? doc.text.length : 0;
    const wouldExceedCount = current.length >= MAX_ADD_DOCS_PER_BATCH;
    const wouldExceedChars =
      current.length > 0 && currentChars + textLen > MAX_ADD_CHARS_PER_BATCH;

    if (wouldExceedCount || wouldExceedChars) {
      batches.push(current);
      current = [];
      currentChars = 0;
    }

    current.push(doc);
    currentChars += textLen;
  }

  if (current.length) {
    batches.push(current);
  }
  return batches;
}

async function deleteDocsByIds(docIds: string[] = []) {
  if (!docIds.length) return
  const engine = await getEngine()
  if (!engine) return
  for (const id of docIds) {
    try {
      await engine.removeDocument(id)
    } catch (error) {
      console.warn("Vectoria delete failed", error)
    }
  }
}

export async function indexRecord(record: MyZRecord) {
  try {
    const docs = buildDocumentsFromRecord(record)
    if (!docs.length) return
    const map = await readDocMap()
    const prevIds = map[record.id] || []
    if (prevIds.length) {
      await deleteDocsByIds(prevIds)
    }
    const engine = await getEngine()
    if (!engine) return
    const inserted = await engine.addDocuments(
      docs.map((d) => ({ text: d.text, metadata: d.metadata, tags: d.metadata.tags })),
    )
    map[record.id] = inserted.map((doc: { id: string }) => doc.id)
    await writeDocMap(map)
  } catch (error) {
    console.warn("Vectoria indexRecord failed", error)
  }
}

export async function indexRecords(records: MyZRecord[] = []) {
  const engine = await getEngine()
  if (!engine) return

  const byId = new Map<string, MyZRecord>()
  records.forEach((record) => {
    if (record?.id) byId.set(record.id, record)
  })
  const uniqueRecords = Array.from(byId.values())
  if (!uniqueRecords.length) return

  try {
    const map = await readDocMap()

    for (const record of uniqueRecords) {
      const prevIds = map[record.id] || []
      if (prevIds.length) {
        await deleteDocsByIds(prevIds)
      }
    }

    const docs: VectoriaDocument[] = []
    for (const record of uniqueRecords) {
      docs.push(...buildDocumentsFromRecord(record))
    }

    const nextIdsByRecord: Record<string, string[]> = {}
    for (const batch of batchDocumentsForAdd(docs)) {
      if (!batch.length) continue
      const inserted = await engine.addDocuments(
        batch.map((d) => ({
          id: d.metadata?.recordId ? `${d.metadata.recordId}:${d.metadata.chunkIndex || 0}` : undefined,
          text: d.text,
          metadata: d.metadata,
          tags: d.metadata.tags,
        })),
      )
      inserted.forEach((doc: { id: string; metadata?: Record<string, any> }) => {
        const recordId =
          doc?.metadata && typeof doc.metadata.recordId === "string"
            ? doc.metadata.recordId
            : ""
        if (!recordId) return
        nextIdsByRecord[recordId] = nextIdsByRecord[recordId] || []
        nextIdsByRecord[recordId].push(doc.id)
      })
    }

    uniqueRecords.forEach((record) => {
      const nextIds = nextIdsByRecord[record.id] || []
      if (nextIds.length) {
        map[record.id] = nextIds
      } else {
        delete map[record.id]
      }
    })

    await writeDocMap(map)
  } catch (error) {
    console.warn("Vectoria indexRecords failed", error)
  }
}

export async function removeRecordFromIndex(recordId: string) {
  if (!recordId) return
  try {
    const engine = await getEngine()
    if (!engine) return
    const map = await readDocMap()
    const docIds = map[recordId] || []
    if (docIds.length) {
      await deleteDocsByIds(docIds)
    }
    delete map[recordId]
    await writeDocMap(map)
  } catch (error) {
    console.warn("Vectoria removeRecord failed", error)
  }
}

export async function searchSimilar(
  text: string,
  { topK = 3 } = {},
): Promise<VectoriaSearchResult[]> {
  try {
    const engine = await getEngine()
    if (!engine) return []
    const results = await engine.search(text, { topK })

    if (results.length === 0) return []

    // Normalize scores to 0-1 range for intuitive threshold comparison
    const maxScore = Math.max(...results.map((r) => r.finalScore))
    const minScore = Math.min(...results.map((r) => r.finalScore))
    const range = maxScore - minScore

    return results.map((r) => ({
      id: r.doc.id,
      text: r.doc.text,
      score: range > 0 ? (r.finalScore - minScore) / range : 0.5,
      metadata: r.doc.metadata as VectoriaMetadata,
    }))
  } catch (error) {
    console.warn("Vectoria search failed", error)
    return []
  }
}

export async function resetVectorIndex() {
  const engine = await getEngine()
  if (!engine) {
    throw new Error("向量检索未启用或未测试")
  }
  await engine.clear()
  await clearDocMap()
}
