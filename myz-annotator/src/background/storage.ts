import { LOCAL_TOOL_NAMES } from "./ai/tools/localDefinitions.js";
import { syncAiRequestHeaderRules } from "./aiHeaders.js";
import { DEFAULT_SETTINGS, SETTINGS_KEY, STORAGE_KEY } from "./constants.js";

import type {
  AIAgentConfig,
  AIAgentsSettings,
  AIModelSetting,
  AIReasoningEffortSetting,
  AIReasoningMode,
  AIProviderSetting,
  AIToolChoiceSetting,
  AIToolControlSettings,
  AIToolFlagSetting,
  AutoHighlightCategoryStyle,
  AutoHighlightCategoryStyles,
  McpServerSetting,
  OpenAICompatibleProfile,
  Settings,
  SettingsBundle,
} from "./settings.js";
import {
  normalizeColor,
  normalizeHighlightStyle,
} from "@/shared/highlightUtils.js";
import { MyZRecord, ensureRecordSchemaVersion } from "@/shared/types.js";
import { isRecord, type UnknownRecord } from "@/shared/typeUtils";
import { SETTINGS_SCHEMA_VERSION } from "@/shared/versioning";

const DB_NAME = "myz_db";
const DB_VERSION = 1;

let dbPromise: Promise<IDBDatabase> | null = null;

function getDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      console.error("Failed to open database", request.error);
      reject(request.error);
    };

    request.onsuccess = async () => {
      const db = request.result;
      try {
        await migrateFromLocalStorage(db);
      } catch (e) {
        console.error("Migration failed", e);
      }
      resolve(db);
    };

    request.onupgradeneeded = (event) => {
      const db = request.result;

      if (!db.objectStoreNames.contains("highlights")) {
        const store = db.createObjectStore("highlights", { keyPath: "id" });
        store.createIndex("url", "url", { unique: false });
        store.createIndex("createdAt", "createdAt", { unique: false });
      }
    };
  });
  return dbPromise;
}

async function migrateFromLocalStorage(db: IDBDatabase) {
  const { [STORAGE_KEY]: stored } = await chrome.storage.local.get(STORAGE_KEY);
  if (!stored || typeof stored !== "object") return;

  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(["highlights"], "readwrite");

    tx.oncomplete = async () => {
      await chrome.storage.local.remove(STORAGE_KEY);
      console.log("Migrated storage to IndexedDB");
      resolve();
    };

    tx.onerror = () => reject(tx.error);

    const highlightsStore = tx.objectStore("highlights");

    if (isRecord((stored as UnknownRecord).highlights)) {
      Object.values(
        (stored as UnknownRecord).highlights as UnknownRecord,
      ).forEach((highlight) => highlightsStore.put(highlight));
    }
  });
}

function getAllFromStore<T>(storeName: string): Promise<T[]> {
  return getDB().then((db) => {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, "readonly");
      const store = tx.objectStore(storeName);
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  });
}

function unwrapStoredSettings(stored: unknown): Partial<Settings> | null {
  if (!stored || typeof stored !== "object") {
    return null;
  }
  const candidate = stored as SettingsBundle;
  if (typeof candidate.schemaVersion === "string" && candidate.data) {
    return candidate.data as Partial<Settings>;
  }
  return stored as Partial<Settings>;
}

function wrapSettingsBundle(settings: Settings): SettingsBundle {
  return {
    schemaVersion: SETTINGS_SCHEMA_VERSION,
    data: settings,
  };
}

function normalizeSettings<T extends Settings>(settings: T): T {
  const clampPercent = (
    value: unknown,
    min: number,
    max: number,
    fallback: number,
  ) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.max(min, Math.min(max, Math.round(parsed)));
  };
  const normalizeToolFlag = (value: unknown): AIToolFlagSetting => {
    if (value === "on" || value === "off" || value === "auto") return value;
    return "auto";
  };
  const normalizeToolChoice = (value: unknown): AIToolChoiceSetting => {
    const record = isRecord(value) ? value : null;
    const mode = typeof record?.mode === "string" ? record.mode : "auto";
    if (mode === "none" || mode === "required" || mode === "auto") {
      return { mode };
    }
    if (mode === "tool") {
      const toolName =
        typeof record?.toolName === "string" ? record.toolName : "";
      return { mode, toolName };
    }
    return { mode: "auto" };
  };
  const normalizeTooling = (value: unknown): AIToolControlSettings => {
    const record = isRecord(value) ? value : null;
    return {
      toolChoice: normalizeToolChoice(record?.toolChoice),
      strict: normalizeToolFlag(record?.strict),
      parallelToolCalls: normalizeToolFlag(record?.parallelToolCalls),
    };
  };
  const normalizeCompatProfile = (value: unknown): OpenAICompatibleProfile => {
    switch (value) {
      case "deepseek":
      case "moonshot":
      case "glm":
      case "qwen":
      case "minimax":
      case "longcat":
      case "mimo":
      case "custom":
        return value;
      default:
        return "auto";
    }
  };
  const normalizeReasoningMode = (value: unknown): AIReasoningMode => {
    switch (value) {
      case "enabled":
      case "disabled":
        return value;
      default:
        return "provider_default";
    }
  };
  const normalizeReasoningEffort = (
    value: unknown,
  ): AIReasoningEffortSetting => {
    switch (value) {
      case "low":
      case "medium":
      case "high":
        return value;
      default:
        return "provider_default";
    }
  };
  const normalizeModelSetting = (model: unknown): AIModelSetting => {
    const record = isRecord(model) ? model : {};
    const limits = isRecord(record.limits) ? record.limits : {};
    const capabilities = isRecord(record.capabilities)
      ? record.capabilities
      : {};
    return {
      ...(record as Partial<AIModelSetting>),
      id: typeof record.id === "string" ? record.id : "",
      model: typeof record.model === "string" ? record.model : "",
      enabled: Boolean(record.enabled),
      systemPromptInUserMessage: Boolean(record.systemPromptInUserMessage),
      capabilities: {
        vision: Boolean(capabilities.vision),
        imageOutput: Boolean(capabilities.imageOutput),
        toolCalling:
          typeof capabilities.toolCalling === "boolean"
            ? capabilities.toolCalling
            : true,
        reasoning: Boolean(capabilities.reasoning),
      },
      limits: {
        contextWindow:
          typeof limits.contextWindow === "number" &&
          Number.isFinite(limits.contextWindow)
            ? Math.max(1, Math.floor(limits.contextWindow))
            : 32768,
        maxOutputTokens:
          typeof limits.maxOutputTokens === "number" &&
          Number.isFinite(limits.maxOutputTokens)
            ? Math.max(1, Math.floor(limits.maxOutputTokens))
            : 4096,
        maxOutputTokenParam:
          limits.maxOutputTokenParam === "max_completion_tokens"
            ? "max_completion_tokens"
            : "max_tokens",
      },
      tooling: normalizeTooling(record.tooling),
    };
  };
  settings.aiAssistantEnabled = Boolean(settings.aiAssistantEnabled);
  const rawProviders: unknown[] = Array.isArray(
    (settings as UnknownRecord).aiProviders,
  )
    ? ((settings as UnknownRecord).aiProviders as unknown[])
    : [];
  settings.aiProviders = rawProviders
    .filter((provider): provider is UnknownRecord => isRecord(provider))
    .map((record) => ({
      ...(record as Partial<AIProviderSetting>),
      type: typeof record.type === "string" ? record.type : "openai_compatible",
      streamingEnabled:
        typeof record.streamingEnabled === "boolean"
          ? record.streamingEnabled
          : true,
      compatProfile: normalizeCompatProfile(record.compatProfile),
      reasoningMode: normalizeReasoningMode(record.reasoningMode),
      reasoningEffort: normalizeReasoningEffort(record.reasoningEffort),
      reasoningBudget:
        typeof record.reasoningBudget === "number" &&
        Number.isFinite(record.reasoningBudget)
          ? Math.max(0, Math.floor(record.reasoningBudget))
          : undefined,
      models: Array.isArray(record.models)
        ? record.models.map((model) => normalizeModelSetting(model))
        : [],
    })) as AIProviderSetting[];
  const fallbackAgents: AIAgentsSettings = {
    conversation: {
      target: null,
      temperature: 0.7,
      compressImages: false,
      multimodalTarget: null,
      superpowerMode: false,
    },
    insights: { target: null, temperature: 0.7 },
    autoHighlight: {
      target: null,
      temperature: 0.4,
      maxHighlights: 15,
    },
  };
  settings.aiAgents = isRecord(settings.aiAgents)
    ? (settings.aiAgents as AIAgentsSettings)
    : fallbackAgents;
  const aiAgents = settings.aiAgents;
  const normalizeAgentTarget = (target: unknown): AIAgentConfig["target"] => {
    if (
      isRecord(target) &&
      typeof target.providerId === "string" &&
      typeof target.modelId === "string"
    ) {
      return { providerId: target.providerId, modelId: target.modelId };
    }
    return null;
  };
  if (!isRecord(aiAgents.conversation)) {
    aiAgents.conversation = {
      target: null,
      temperature: 0.7,
      compressImages: false,
      multimodalTarget: null,
      superpowerMode: false,
      contextCompressionThreshold: 80,
    };
  } else {
    aiAgents.conversation.target = normalizeAgentTarget(
      aiAgents.conversation.target,
    );
    aiAgents.conversation.temperature =
      typeof aiAgents.conversation.temperature === "number"
        ? aiAgents.conversation.temperature
        : 0.7;
    aiAgents.conversation.compressImages = Boolean(
      aiAgents.conversation.compressImages,
    );
    aiAgents.conversation.superpowerMode = Boolean(
      aiAgents.conversation.superpowerMode,
    );
    aiAgents.conversation.multimodalTarget = normalizeAgentTarget(
      aiAgents.conversation.multimodalTarget,
    );
    aiAgents.conversation.contextCompressionThreshold = clampPercent(
      aiAgents.conversation.contextCompressionThreshold,
      50,
      95,
      80,
    );
  }
  if (!isRecord(aiAgents.insights)) {
    aiAgents.insights = { target: null, temperature: 0.7 };
  } else {
    aiAgents.insights.target = normalizeAgentTarget(aiAgents.insights.target);
    aiAgents.insights.temperature =
      typeof aiAgents.insights.temperature === "number"
        ? aiAgents.insights.temperature
        : 0.7;
  }
  if (!isRecord(aiAgents.autoHighlight)) {
    const fallbackCategoryStyles = DEFAULT_SETTINGS.aiAgents.autoHighlight
      .categoryStyles as AutoHighlightCategoryStyles;
    aiAgents.autoHighlight = {
      target: null,
      temperature: 0.4,
      maxHighlights: 15,
      categoryStyles: fallbackCategoryStyles,
    };
  } else {
    aiAgents.autoHighlight.target = normalizeAgentTarget(
      aiAgents.autoHighlight.target,
    );
    aiAgents.autoHighlight.temperature =
      typeof aiAgents.autoHighlight.temperature === "number"
        ? aiAgents.autoHighlight.temperature
        : 0.4;
    const maxCount =
      typeof aiAgents.autoHighlight.maxHighlights === "number"
        ? aiAgents.autoHighlight.maxHighlights
        : 15;
    const maxHighlights = clampPercent(maxCount, 5, 30, 15);
    aiAgents.autoHighlight.maxHighlights = maxHighlights;

    const defaultCategoryStyles = DEFAULT_SETTINGS.aiAgents.autoHighlight
      .categoryStyles as AutoHighlightCategoryStyles;
    const rawCategoryStyles = isRecord(aiAgents.autoHighlight.categoryStyles)
      ? (aiAgents.autoHighlight
          .categoryStyles as Partial<AutoHighlightCategoryStyles>)
      : {};
    const normalizeCategoryStyle = (
      value: AutoHighlightCategoryStyle | undefined,
      fallback: AutoHighlightCategoryStyle | undefined,
    ): AutoHighlightCategoryStyle => ({
      style: normalizeHighlightStyle(value?.style ?? fallback?.style),
      color: normalizeColor(
        typeof value?.color === "string" ? value.color : "",
        typeof fallback?.color === "string" ? fallback.color : "#b58900",
      ),
    });
    aiAgents.autoHighlight.categoryStyles = {
      conceptual: normalizeCategoryStyle(
        rawCategoryStyles.conceptual,
        defaultCategoryStyles.conceptual,
      ),
      structural: normalizeCategoryStyle(
        rawCategoryStyles.structural,
        defaultCategoryStyles.structural,
      ),
      behavioural: normalizeCategoryStyle(
        rawCategoryStyles.behavioural,
        defaultCategoryStyles.behavioural,
      ),
    };
  }
  const rawServers: unknown[] = Array.isArray(
    (settings as UnknownRecord).aiMcpServers,
  )
    ? ((settings as UnknownRecord).aiMcpServers as unknown[])
    : [];
  settings.aiMcpServers = rawServers
    .filter((server): server is UnknownRecord => isRecord(server))
    .map((server) => {
      const normalized: McpServerSetting = {
        id: typeof server.id === "string" ? server.id : "",
        name: typeof server.name === "string" ? server.name : "",
        enabled: Boolean(server.enabled),
        url: typeof server.url === "string" ? server.url : "",
      };
      const headers = isRecord(server.headers) ? server.headers : null;
      if (headers) {
        const cleaned = Object.fromEntries(
          Object.entries(headers).filter(
            ([, value]) => typeof value === "string",
          ),
        ) as Record<string, string>;
        if (Object.keys(cleaned).length) {
          normalized.headers = cleaned;
        }
      }
      const lastTest = isRecord(server.lastTest) ? server.lastTest : null;
      if (lastTest) {
        normalized.lastTest = {
          ok: Boolean(lastTest.ok),
          message: typeof lastTest.message === "string" ? lastTest.message : "",
          testedAt:
            typeof lastTest.testedAt === "string" ? lastTest.testedAt : "",
        };
      } else if (server.lastTest === null) {
        normalized.lastTest = null;
      }
      return normalized;
    });
  const aiLocalTools = settings.aiLocalTools;
  if (!isRecord(aiLocalTools)) {
    settings.aiLocalTools = {
      enabledToolNames: LOCAL_TOOL_NAMES.slice(),
      mode: "manual",
      autoSelectorTarget: null,
    };
  } else {
    const toolNameMigrations: Record<string, string> = {
      "list-files": "List",
      "read-file": "Read",
      "write-file": "Write",
      "myz-web-search": "WebSearch",
      "myz-fetch-page": "WebFetch",
      "myz-task-init": "Task",
      "myz-task-update": "Task",
      "myz-task-attach-deliverable": "Task",
      "myz-task-get": "Task",
      "myz-task-complete-all": "Task",
      "myz-select-tools": "SelectTools",
      "myz-code-execution": "CodeExecution",
      "myz-list-tabs": "ListTabs",
      "myz-activate-tab": "ActivateTab",
      "myz-run-dom-actions": "RunDomActions",
      "myz-get-page-context": "GetPageContext",
      "myz-eval-in-page": "EvalInPage",
    };
    aiLocalTools.enabledToolNames = Array.isArray(aiLocalTools.enabledToolNames)
      ? aiLocalTools.enabledToolNames
          .filter((name) => typeof name === "string" && name.trim())
          .map((name) => toolNameMigrations[name.trim()] || name.trim())
          .filter((name) => LOCAL_TOOL_NAMES.includes(name))
      : LOCAL_TOOL_NAMES.slice();
    aiLocalTools.enabledToolNames = Array.from(
      new Set(aiLocalTools.enabledToolNames),
    );
    aiLocalTools.mode = aiLocalTools.mode === "auto" ? "auto" : "manual";
    const target = aiLocalTools.autoSelectorTarget;
    if (
      isRecord(target) &&
      typeof target.providerId === "string" &&
      typeof target.modelId === "string"
    ) {
      aiLocalTools.autoSelectorTarget = {
        providerId: target.providerId,
        modelId: target.modelId,
      };
    } else {
      aiLocalTools.autoSelectorTarget = null;
    }
  }
  const aiSkills = settings.aiSkills;
  if (!isRecord(aiSkills)) {
    settings.aiSkills = {
      mode: "manual",
      autoSelectorTarget: null,
    };
  } else {
    aiSkills.mode = aiSkills.mode === "auto" ? "auto" : "manual";
    const target = aiSkills.autoSelectorTarget;
    if (
      isRecord(target) &&
      typeof target.providerId === "string" &&
      typeof target.modelId === "string"
    ) {
      aiSkills.autoSelectorTarget = {
        providerId: target.providerId,
        modelId: target.modelId,
      };
    } else {
      aiSkills.autoSelectorTarget = null;
    }
  }

  settings.colorPalette = Array.isArray(settings.colorPalette)
    ? settings.colorPalette.filter((c) => typeof c === "string" && c.trim())
    : [];

  // Social import settings (extensible)
  const socialImport = settings.socialImport;
  if (!isRecord(socialImport)) {
    settings.socialImport = {
      twitter: { profileUrl: "" },
      mastodon: { profileUrl: "" },
    };
  } else if (!isRecord(socialImport.twitter)) {
    socialImport.twitter = { profileUrl: "" };
  } else if (typeof socialImport.twitter.profileUrl !== "string") {
    socialImport.twitter.profileUrl = "";
  }
  if (!isRecord(socialImport.mastodon)) {
    socialImport.mastodon = { profileUrl: "" };
  } else if (typeof socialImport.mastodon.profileUrl !== "string") {
    socialImport.mastodon.profileUrl = "";
  }

  const sync = settings.sync;
  if (!isRecord(sync)) {
    settings.sync = {
      enabled: false,
      s3: {
        endpoint: "",
        region: "",
        bucket: "",
        accessKeyId: "",
        secretAccessKey: "",
        sessionToken: "",
        prefix: "",
      },
    };
  } else {
    sync.enabled = Boolean(sync.enabled);
    if (!isRecord(sync.s3)) {
      sync.s3 = {
        endpoint: "",
        region: "",
        bucket: "",
        accessKeyId: "",
        secretAccessKey: "",
        sessionToken: "",
        prefix: "",
      };
    } else {
      sync.s3.endpoint =
        typeof sync.s3.endpoint === "string" ? sync.s3.endpoint : "";
      sync.s3.region = typeof sync.s3.region === "string" ? sync.s3.region : "";
      sync.s3.bucket = typeof sync.s3.bucket === "string" ? sync.s3.bucket : "";
      sync.s3.accessKeyId =
        typeof sync.s3.accessKeyId === "string" ? sync.s3.accessKeyId : "";
      sync.s3.secretAccessKey =
        typeof sync.s3.secretAccessKey === "string"
          ? sync.s3.secretAccessKey
          : "";
      sync.s3.sessionToken =
        typeof sync.s3.sessionToken === "string" ? sync.s3.sessionToken : "";
      sync.s3.prefix = typeof sync.s3.prefix === "string" ? sync.s3.prefix : "";
    }
  }

  return settings;
}

export async function saveHighlight(record: MyZRecord) {
  const db = await getDB();
  const normalized = ensureRecordSchemaVersion(record);
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction("highlights", "readwrite");
    const store = tx.objectStore("highlights");
    const request = store.put(normalized);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function deleteHighlight(id: string) {
  const db = await getDB();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction("highlights", "readwrite");
    const store = tx.objectStore("highlights");
    const request = store.delete(id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function getHighlightsForUrl(url: string): Promise<MyZRecord[]> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("highlights", "readonly");
    const store = tx.objectStore("highlights");
    const index = store.index("url");
    const request = index.getAll(url);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function getHighlight(id: string): Promise<MyZRecord | undefined> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("highlights", "readonly");
    const store = tx.objectStore("highlights");
    const request = store.get(id);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function getAllHighlights(): Promise<MyZRecord[]> {
  const records = await getAllFromStore<MyZRecord>("highlights");
  return records.sort((a, b) => {
    const timeA = new Date(a.createdAt || 0).getTime();
    const timeB = new Date(b.createdAt || 0).getTime();
    return timeB - timeA;
  });
}

export async function readSettings(): Promise<Settings> {
  const { [SETTINGS_KEY]: stored } = (await chrome.storage.local.get(
    SETTINGS_KEY,
  )) as {
    [SETTINGS_KEY]?: SettingsBundle | Partial<Settings>;
  };
  const raw = unwrapStoredSettings(stored) || {};
  const merged = normalizeSettings({ ...DEFAULT_SETTINGS, ...raw });
  merged.lastUsedStyle = normalizeHighlightStyle(merged.lastUsedStyle);
  return merged;
}

export async function writeSettings(
  patch: Partial<Settings>,
): Promise<Settings> {
  const current = await readSettings();
  const updated = normalizeSettings({ ...current, ...patch });
  updated.lastUsedStyle = normalizeHighlightStyle(updated.lastUsedStyle);
  const bundle = wrapSettingsBundle(updated);
  await chrome.storage.local.set({ [SETTINGS_KEY]: bundle });
  try {
    await syncAiRequestHeaderRules(updated);
  } catch (error) {
    console.warn("Failed to sync AI header rules", error);
  }
  return updated;
}

export async function persistHighlightPreferences({
  color,
  style,
}: Partial<MyZRecord> = {}) {
  const patch: Partial<Settings> = {};
  const settings = await readSettings();

  if (typeof color === "string" && color.trim()) {
    const normalizedColor = color.trim();
    if (settings.lastUsedColor !== normalizedColor) {
      patch.lastUsedColor = normalizedColor;
    }
  }

  if (style) {
    const normalizedStyle = normalizeHighlightStyle(style);
    if (settings.lastUsedStyle !== normalizedStyle) {
      patch.lastUsedStyle = normalizedStyle;
    }
  }

  if (Object.keys(patch).length) {
    await writeSettings(patch);
  }
}

export function generateId() {
  return `myz_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function generateUniqueImportId(usedIds: Set<string>) {
  let candidate = generateId();
  while (usedIds.has(candidate)) {
    candidate = generateId();
  }
  usedIds.add(candidate);
  return candidate;
}
