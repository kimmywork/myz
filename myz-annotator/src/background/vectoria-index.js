import { Vectoria } from "vectoria";

const DOC_MAP_KEY = "myz::vectoriaDocMap";
let vectoriaInstance = null;
const MODEL_NAME = "Xenova/paraphrase-multilingual-MiniLM-L12-v2";
const DEVICE = "wasm";
const vectoriaSettings = {
  enabled: false,
  modelReady: false,
};

export function applyVectoriaSettings(settings) {
  vectoriaSettings.enabled = Boolean(settings?.vectorSearchEnabled);
  vectoriaSettings.modelReady = Boolean(settings?.vectorModelReady);
  if (!vectoriaSettings.enabled) {
    vectoriaInstance = null;
  }
}

async function ensureVectoria({ forceInit = false } = {}) {
  if (!vectoriaSettings.enabled) return undefined;
  if (!forceInit && !vectoriaSettings.modelReady) return undefined;

  if (vectoriaInstance) return vectoriaInstance;

  const wasmPaths = {
    wasm: chrome.runtime.getURL("/wasm/ort-wasm-simd-threaded.jsep.wasm"),
  };

  try{
      const instance = new Vectoria({
      dbName: "myz-vectoria",
      storeName: "myz-vectoria-store",
      useLocalModel: true,
      modelName: MODEL_NAME,
      device: DEVICE,
      wasmPaths,
    });
    if (typeof instance.init === "function") {
      await instance.init();
      await instance.search("warm up", 1);
    }
    vectoriaInstance = instance;
    return vectoriaInstance;
  }catch(error) {
    console.warn("Vectoria init failed", error);
    vectoriaInstance = null;
    throw error;
  }finally {
  };

  return vectoriaInstance;
}

export async function getVectoria() {
  return ensureVectoria({ forceInit: false });
}

export async function warmVectoriaModel() {
  return ensureVectoria({ forceInit: true });
}

async function readDocMap() {
  const { [DOC_MAP_KEY]: stored } = await chrome.storage.local.get(DOC_MAP_KEY);
  return stored && typeof stored === "object" ? stored : {};
}

async function writeDocMap(map) {
  await chrome.storage.local.set({ [DOC_MAP_KEY]: map });
}

function chunkText(text, { size = 400, overlap = 80 } = {}) {
  const content = (text || "").replace(/\s+/g, " ").trim();
  if (!content) return [];
  if (content.length <= size) return [content];
  const chunks = [];
  let start = 0;
  while (start < content.length) {
    const end = Math.min(content.length, start + size);
    chunks.push(content.slice(start, end));
    if (end === content.length) break;
    start = end - overlap;
    if (start < 0) start = 0;
  }
  return chunks;
}

function extractHost(url) {
  try {
    return new URL(url).hostname || "";
  } catch {
    return "";
  }
}

function buildDocumentsFromRecord(record) {
  if (!record || !record.id) return [];
  const sections = [];
  const baseMeta = {
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

  const docs = [];
  sections.forEach((section) => {
    const chunks = chunkText(section.text);
    chunks.forEach((chunk, idx) => {
      docs.push({
        text: chunk,
        metadata: {
          ...baseMeta,
          section: section.section,
          chunkIndex: idx,
          chunkCount: chunks.length,
        },
      });
    });
  });
  return docs;
}

async function deleteDocsByIds(docIds = []) {
  if (!docIds.length) return;
  const vectoria = await getVectoria();
  if (!vectoria) return;
  for (const id of docIds) {
    try {
      await vectoria.deleteDocument(id);
    } catch (error) {
      console.warn("Vectoria delete failed", error);
    }
  }
}

export async function indexRecord(record) {
  try {
    if (!vectoriaSettings.enabled || !vectoriaSettings.modelReady) {
      return;
    }
    const docs = buildDocumentsFromRecord(record);
    if (!docs.length) {
      return;
    }
    const map = await readDocMap();
    const prevIds = map[record.id] || [];
    if (prevIds.length) {
      await deleteDocsByIds(prevIds);
    }
    const vectoria = await getVectoria();
    if (!vectoria) return;
    const inserted = await vectoria.addDocuments(docs);
    map[record.id] = inserted.map((doc) => doc.id);
    await writeDocMap(map);
  } catch (error) {
    console.warn("Vectoria indexRecord failed", error);
  }
}

export async function indexRecords(records = []) {
  if (!vectoriaSettings.enabled || !vectoriaSettings.modelReady) {
    return;
  }
  for (const record of records) {
    // eslint-disable-next-line no-await-in-loop
    await indexRecord(record);
  }
}

export async function removeRecordFromIndex(recordId) {
  if (!recordId) return;
  try {
    if (!vectoriaSettings.enabled || !vectoriaSettings.modelReady) {
      return;
    }
    const map = await readDocMap();
    const docIds = map[recordId] || [];
    if (docIds.length) {
      await deleteDocsByIds(docIds);
    }
    delete map[recordId];
    await writeDocMap(map);
  } catch (error) {
    console.warn("Vectoria removeRecord failed", error);
  }
}

export async function searchSimilar(text, { topK = 3 } = {}) {
  try {
    const vectoria = await getVectoria();
    if (!vectoria) return [];
    const results = await vectoria.search(text, topK);
    return results;
  } catch (error) {
    console.warn("Vectoria search failed", error);
    return [];
  }
}
