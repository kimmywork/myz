import { Vectoria, OpenAIEmbedder } from "vectoria";

const DOC_MAP_KEY = "myz::vectoriaDocMap";
const DB_NAME = "myz-vectoria";
const STORE_NAME = "myz-vectoria-store";
const MODEL_NAME = "Xenova/paraphrase-multilingual-MiniLM-L12-v2";

let vectoriaInstance = null;
let vectoriaInitPromise = null;

const vectoriaSettings = {
  enabled: false,
  modelReady: false,
  useLocalModel: true,
  openAiEndpoint: "",
  openAiApiKey: "",
  openAiModel: "text-embedding-3-small",
  maxChars: 500,
  signature: "",
};

export function applyVectoriaSettings(settings) {
  vectoriaSettings.enabled = Boolean(settings?.vectorSearchEnabled);
  vectoriaSettings.modelReady = Boolean(
    vectoriaSettings.enabled && settings?.vectorModelReady,
  );
  vectoriaSettings.useLocalModel =
    settings?.vectorUseLocalModel !== false &&
    settings?.vectorUseLocalModel !== "remote";
  vectoriaSettings.openAiEndpoint = settings?.vectorOpenAiEndpoint || "";
  vectoriaSettings.openAiApiKey = settings?.vectorOpenAiApiKey || "";
  vectoriaSettings.openAiModel =
    settings?.vectorOpenAiModel || "text-embedding-3-small";
  vectoriaSettings.maxChars =
    typeof settings?.vectorMaxChars === "number" && settings.vectorMaxChars > 0
      ? Math.floor(settings.vectorMaxChars)
      : 500;

  const signature = JSON.stringify({
    enabled: vectoriaSettings.enabled,
    useLocalModel: vectoriaSettings.useLocalModel,
    openAiEndpoint: vectoriaSettings.openAiEndpoint,
    openAiModel: vectoriaSettings.openAiModel,
    openAiKey: vectoriaSettings.openAiApiKey ? 1 : 0,
    maxChars: vectoriaSettings.maxChars,
  });

  if (
    signature !== vectoriaSettings.signature ||
    (!vectoriaSettings.enabled && vectoriaInstance)
  ) {
    vectoriaInstance = null;
    vectoriaInitPromise = null;
  }
  vectoriaSettings.signature = signature;
}

function createVectoriaInstance(config = {}) {
  if (config.useLocalModel === false) {
    if (!config.openAiApiKey) {
      throw new Error("缺少 OpenAI API Key");
    }
    const embedder = new OpenAIEmbedder({
      apiKey: config.openAiApiKey || "",
      endpoint: config.openAiEndpoint || "",
      modelName: config.openAiModel || "text-embedding-3-small",
    });
    return new Vectoria({
      dbName: DB_NAME,
      storeName: STORE_NAME,
      useLocalModel: false,
      customEmbedder: embedder,
    });
  }

  return new Vectoria({
    dbName: DB_NAME,
    storeName: STORE_NAME,
    useLocalModel: true,
    modelName: MODEL_NAME,
    device: "auto",
  });
}

export function getActiveMaxChars(override) {
  const value =
    typeof override === "number" && override > 0
      ? override
      : vectoriaSettings.maxChars;
  return Math.max(1, value || 500);
}

async function ensureVectoria({ forceInit = false } = {}) {
  if (!vectoriaSettings.enabled) return undefined;
  if (!forceInit && !vectoriaSettings.modelReady) return undefined;
  if (vectoriaInstance) return vectoriaInstance;
  if (vectoriaInitPromise) return vectoriaInitPromise;

  const config = {
    useLocalModel: vectoriaSettings.useLocalModel,
    openAiEndpoint: vectoriaSettings.openAiEndpoint,
    openAiApiKey: vectoriaSettings.openAiApiKey,
    openAiModel: vectoriaSettings.openAiModel,
  };

  vectoriaInitPromise = (async () => {
    const instance = createVectoriaInstance(config);
    if (typeof instance.init === "function") {
      await instance.init();
    }
    vectoriaInstance = instance;
    return vectoriaInstance;
  })().catch((error) => {
    vectoriaInstance = null;
    throw error;
  });

  try {
    return await vectoriaInitPromise;
  } finally {
    vectoriaInitPromise = null;
  }
}

export async function getVectoria() {
  return ensureVectoria({ forceInit: false });
}

export async function warmVectoriaModel() {
  const instance = await ensureVectoria({ forceInit: true });
  if (instance) {
    try {
      await instance.search("warm up", 1);
    } catch (error) {
      console.warn("Vectoria warm-up failed", error);
    }
  }
  return instance;
}

async function readDocMap() {
  const { [DOC_MAP_KEY]: stored } = await chrome.storage.local.get(DOC_MAP_KEY);
  return stored && typeof stored === "object" ? stored : {};
}

async function writeDocMap(map) {
  await chrome.storage.local.set({ [DOC_MAP_KEY]: map });
}

async function clearDocMap() {
  await writeDocMap({});
}

function splitSentences(text) {
  const normalized = (text || "").replace(/\s+/g, " ").trim();
  if (!normalized) return [];
  const parts = normalized
    .split(/(?<=[。！？!?；;．\.])\s+|\n+/)
    .map((p) => p.trim())
    .filter(Boolean);
  return parts.length ? parts : [normalized];
}

function chunkText(text, maxChars) {
  const limit = getActiveMaxChars(maxChars);
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
    const chunks = chunkText(section.text, vectoriaSettings.maxChars);
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

export async function testVectorProvider(config) {
  if (!config?.openAiApiKey) {
    throw new Error("请填写 OpenAI API Key");
  }
  const instance = createVectoriaInstance({
    useLocalModel: false,
    openAiApiKey: config?.openAiApiKey || "",
    openAiEndpoint: config?.openAiEndpoint || "",
    openAiModel: config?.openAiModel || "text-embedding-3-small",
  });
  await instance.init();
  await instance.search("warm up", 1);
  return true;
}

export async function resetVectorIndex() {
  const vectoria = await getVectoria();
  if (!vectoria) {
    throw new Error("模型未就绪");
  }
  if (typeof vectoria.resetIndex === "function") {
    await vectoria.resetIndex();
  }
  await clearDocMap();
}
