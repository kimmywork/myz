import { defineStore } from "pinia";
import { reactive, ref } from "vue";
import type { SyncConfig } from "@myz/dashboard-core/host";
import { isRecord } from "@myz/shared";
import { desktopDashboardHost } from "../../host/desktop";
import {
  AI_PROVIDER_TYPES,
  AI_REASONING_EFFORT_SETTINGS,
  AI_REASONING_MODES,
  AI_TOOL_FLAG_SETTINGS,
  AI_TOOL_SELECTION_MODES,
  AI_TOOL_CHOICE_MODES,
  MAX_OUTPUT_TOKEN_PARAMS,
  OPENAI_COMPATIBLE_PROFILES,
  createDefaultDesktopSettings,
  createDefaultDesktopStoredSettings,
  createDefaultSyncSettings,
  LOCAL_TOOL_NAMES,
  syncConfigToSettings,
  type AIAgentConfig,
  type AIAgentModelRef,
  type AIAgentsSettings,
  type AILocalToolsSettings,
  type AIModelSetting,
  type AIProviderSetting,
  type AISkillsSettings,
  type DesktopAgentSettings,
  type DesktopSettings,
  type DesktopStoredSettings,
  type McpServerSetting,
  type SyncSettings,
  type VectorSearchLastTestStatus,
  type VectorSettings,
} from "../types/settings";
import {
  DEFAULT_COLORS,
  DEFAULT_HIGHLIGHT_STYLE,
  HIGHLIGHT_STYLES,
  type HIGHLIGHT_STYLES as HighlightStyle,
} from "@myz/shared";

function isHighlightStyle(value: unknown): value is HighlightStyle {
  return Object.values(HIGHLIGHT_STYLES).includes(value as HighlightStyle);
}

function normalizeModelRef(value: unknown): AIAgentModelRef | null {
  if (!isRecord(value)) {
    return null;
  }
  const providerId =
    typeof value.providerId === "string" ? value.providerId.trim() : "";
  const modelId = typeof value.modelId === "string" ? value.modelId.trim() : "";
  if (!providerId || !modelId) {
    return null;
  }
  return { providerId, modelId };
}

function normalizeBoolean(value: unknown, fallback = false) {
  return typeof value === "boolean" ? value : fallback;
}

function normalizeNumber(
  value: unknown,
  fallback: number,
  { min, max, round }: { min?: number; max?: number; round?: boolean } = {},
) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  let next = parsed;
  if (typeof min === "number") {
    next = Math.max(min, next);
  }
  if (typeof max === "number") {
    next = Math.min(max, next);
  }
  return round ? Math.round(next) : next;
}

function normalizeStringArray(value: unknown, fallback: string[] = []) {
  if (!Array.isArray(value)) {
    return fallback.slice();
  }
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeModelSetting(value: unknown): AIModelSetting | null {
  if (!isRecord(value)) {
    return null;
  }
  const capabilities = isRecord(value.capabilities) ? value.capabilities : {};
  const limits = isRecord(value.limits) ? value.limits : {};
  const tooling = isRecord(value.tooling) ? value.tooling : {};
  const toolChoice = isRecord(tooling.toolChoice) ? tooling.toolChoice : null;
  const model = typeof value.model === "string" ? value.model.trim() : "";
  const id =
    typeof value.id === "string" && value.id.trim()
      ? value.id
      : `model-${crypto.randomUUID()}`;

  return {
    id,
    model,
    enabled: normalizeBoolean(value.enabled, true),
    systemPromptInUserMessage: normalizeBoolean(
      value.systemPromptInUserMessage,
      false,
    ),
    capabilities: {
      vision: normalizeBoolean(capabilities.vision),
      imageOutput: normalizeBoolean(capabilities.imageOutput),
      toolCalling: normalizeBoolean(capabilities.toolCalling, true),
      reasoning: normalizeBoolean(capabilities.reasoning),
    },
    limits: {
      contextWindow: normalizeNumber(limits.contextWindow, 32768, {
        min: 1024,
      }),
      maxOutputTokens: normalizeNumber(limits.maxOutputTokens, 4096, {
        min: 1,
      }),
      maxOutputTokenParam: MAX_OUTPUT_TOKEN_PARAMS.includes(
        limits.maxOutputTokenParam as (typeof MAX_OUTPUT_TOKEN_PARAMS)[number],
      )
        ? (limits.maxOutputTokenParam as (typeof MAX_OUTPUT_TOKEN_PARAMS)[number])
        : "max_tokens",
    },
    tooling: {
      toolChoice: {
        mode: AI_TOOL_CHOICE_MODES.includes(
          toolChoice?.mode as (typeof AI_TOOL_CHOICE_MODES)[number],
        )
          ? (toolChoice!.mode as (typeof AI_TOOL_CHOICE_MODES)[number])
          : "auto",
        toolName:
          typeof toolChoice?.toolName === "string" ? toolChoice.toolName : "",
      },
      strict: AI_TOOL_FLAG_SETTINGS.includes(
        tooling.strict as (typeof AI_TOOL_FLAG_SETTINGS)[number],
      )
        ? (tooling.strict as (typeof AI_TOOL_FLAG_SETTINGS)[number])
        : "auto",
      parallelToolCalls: AI_TOOL_FLAG_SETTINGS.includes(
        tooling.parallelToolCalls as (typeof AI_TOOL_FLAG_SETTINGS)[number],
      )
        ? (tooling.parallelToolCalls as (typeof AI_TOOL_FLAG_SETTINGS)[number])
        : "auto",
    },
  };
}

function normalizeProvider(value: unknown): AIProviderSetting | null {
  if (!isRecord(value)) {
    return null;
  }

  const models = Array.isArray(value.models)
    ? value.models
        .map((model) => normalizeModelSetting(model))
        .filter((model): model is AIModelSetting => model !== null)
    : [];

  return {
    id:
      typeof value.id === "string" && value.id.trim()
        ? value.id
        : `provider-${crypto.randomUUID()}`,
    name: typeof value.name === "string" ? value.name : "Provider",
    type: AI_PROVIDER_TYPES.includes(
      value.type as (typeof AI_PROVIDER_TYPES)[number],
    )
      ? (value.type as (typeof AI_PROVIDER_TYPES)[number])
      : "openai_compatible",
    enabled: normalizeBoolean(value.enabled),
    streamingEnabled: normalizeBoolean(value.streamingEnabled, true),
    compatProfile: OPENAI_COMPATIBLE_PROFILES.includes(
      value.compatProfile as (typeof OPENAI_COMPATIBLE_PROFILES)[number],
    )
      ? (value.compatProfile as (typeof OPENAI_COMPATIBLE_PROFILES)[number])
      : "auto",
    reasoningMode: AI_REASONING_MODES.includes(
      value.reasoningMode as (typeof AI_REASONING_MODES)[number],
    )
      ? (value.reasoningMode as (typeof AI_REASONING_MODES)[number])
      : "provider_default",
    reasoningEffort: AI_REASONING_EFFORT_SETTINGS.includes(
      value.reasoningEffort as (typeof AI_REASONING_EFFORT_SETTINGS)[number],
    )
      ? (value.reasoningEffort as (typeof AI_REASONING_EFFORT_SETTINGS)[number])
      : "provider_default",
    reasoningBudget:
      typeof value.reasoningBudget === "number"
        ? value.reasoningBudget
        : undefined,
    baseUrl: typeof value.baseUrl === "string" ? value.baseUrl : "",
    apiKey: typeof value.apiKey === "string" ? value.apiKey : "",
    headers: typeof value.headers === "string" ? value.headers : "",
    models,
    lastTest: isRecord(value.lastTest)
      ? {
          ok: normalizeBoolean(value.lastTest.ok),
          message:
            typeof value.lastTest.message === "string"
              ? value.lastTest.message
              : "",
          testedAt:
            typeof value.lastTest.testedAt === "string"
              ? value.lastTest.testedAt
              : "",
          model:
            typeof value.lastTest.model === "string"
              ? value.lastTest.model
              : "",
        }
      : null,
  };
}

function normalizeAgent(
  value: unknown,
  fallback: AIAgentConfig,
  options: {
    allowConversationExtras?: boolean;
    allowAutoHighlightExtras?: boolean;
  } = {},
): AIAgentConfig {
  if (!isRecord(value)) {
    return { ...fallback };
  }

  return {
    target: normalizeModelRef(value.target),
    temperature: normalizeNumber(value.temperature, fallback.temperature, {
      min: 0,
      max: 2,
    }),
    compressImages: options.allowConversationExtras
      ? normalizeBoolean(value.compressImages, Boolean(fallback.compressImages))
      : undefined,
    multimodalTarget: options.allowConversationExtras
      ? normalizeModelRef(value.multimodalTarget)
      : undefined,
    superpowerMode: options.allowConversationExtras
      ? normalizeBoolean(value.superpowerMode, Boolean(fallback.superpowerMode))
      : undefined,
    contextCompressionThreshold: options.allowConversationExtras
      ? normalizeNumber(
          value.contextCompressionThreshold,
          fallback.contextCompressionThreshold || 80,
          { min: 50, max: 95, round: true },
        )
      : undefined,
    maxHighlights: options.allowAutoHighlightExtras
      ? normalizeNumber(value.maxHighlights, fallback.maxHighlights || 15, {
          min: 5,
          max: 30,
          round: true,
        })
      : undefined,
  };
}

function normalizeCategoryStyle(
  value: unknown,
  fallback: { style: HighlightStyle; color: string },
) {
  if (!isRecord(value)) {
    return { ...fallback };
  }
  return {
    style: isHighlightStyle(value.style) ? value.style : fallback.style,
    color:
      typeof value.color === "string" && value.color.trim()
        ? value.color
        : fallback.color,
  };
}

function normalizeAgents(value: unknown): AIAgentsSettings {
  const defaults = createDefaultDesktopStoredSettings().aiAgents;
  if (!isRecord(value)) {
    return defaults;
  }
  const autoHighlight = isRecord(value.autoHighlight)
    ? value.autoHighlight
    : {};

  const autoHighlightBase = normalizeAgent(
    autoHighlight,
    defaults.autoHighlight,
    {
      allowAutoHighlightExtras: true,
    },
  );

  return {
    conversation: normalizeAgent(value.conversation, defaults.conversation, {
      allowConversationExtras: true,
    }),
    insights: normalizeAgent(value.insights, defaults.insights),
    autoHighlight: {
      ...autoHighlightBase,
      categoryStyles: {
        conceptual: normalizeCategoryStyle(
          isRecord(autoHighlight.categoryStyles)
            ? autoHighlight.categoryStyles.conceptual
            : undefined,
          defaults.autoHighlight.categoryStyles!.conceptual,
        ),
        structural: normalizeCategoryStyle(
          isRecord(autoHighlight.categoryStyles)
            ? autoHighlight.categoryStyles.structural
            : undefined,
          defaults.autoHighlight.categoryStyles!.structural,
        ),
        behavioural: normalizeCategoryStyle(
          isRecord(autoHighlight.categoryStyles)
            ? autoHighlight.categoryStyles.behavioural
            : undefined,
          defaults.autoHighlight.categoryStyles!.behavioural,
        ),
      },
    },
  };
}

function normalizeLocalTools(value: unknown): AILocalToolsSettings {
  const defaults = createDefaultDesktopStoredSettings().aiLocalTools;
  if (!isRecord(value)) {
    return defaults;
  }
  return {
    enabledToolNames: normalizeStringArray(
      value.enabledToolNames,
      LOCAL_TOOL_NAMES,
    ).filter((name) => LOCAL_TOOL_NAMES.includes(name)),
    mode: AI_TOOL_SELECTION_MODES.includes(
      value.mode as (typeof AI_TOOL_SELECTION_MODES)[number],
    )
      ? (value.mode as (typeof AI_TOOL_SELECTION_MODES)[number])
      : defaults.mode,
    autoSelectorTarget: normalizeModelRef(value.autoSelectorTarget),
  };
}

function normalizeSkills(value: unknown): AISkillsSettings {
  const defaults = createDefaultDesktopStoredSettings().aiSkills;
  if (!isRecord(value)) {
    return defaults;
  }
  return {
    mode: AI_TOOL_SELECTION_MODES.includes(
      value.mode as (typeof AI_TOOL_SELECTION_MODES)[number],
    )
      ? (value.mode as (typeof AI_TOOL_SELECTION_MODES)[number])
      : defaults.mode,
    autoSelectorTarget: normalizeModelRef(value.autoSelectorTarget),
  };
}

function normalizeVectorLastTest(
  value: unknown,
): VectorSearchLastTestStatus | null {
  if (!isRecord(value)) {
    return null;
  }
  const providerId =
    typeof value.providerId === "string" ? value.providerId.trim() : "";
  const modelId = typeof value.modelId === "string" ? value.modelId.trim() : "";
  const model = typeof value.model === "string" ? value.model : "";
  if (!providerId || !modelId || !model) {
    return null;
  }
  return {
    ok: normalizeBoolean(value.ok),
    message: typeof value.message === "string" ? value.message : "",
    testedAt: typeof value.testedAt === "string" ? value.testedAt : "",
    providerId,
    modelId,
    model,
  };
}

function normalizeVectorSettings(value: unknown): VectorSettings {
  const defaults = createDefaultDesktopStoredSettings().vectorSearch;
  if (!isRecord(value)) {
    return defaults;
  }
  return {
    enabled: normalizeBoolean(value.enabled),
    target: normalizeModelRef(value.target),
    lastTest: normalizeVectorLastTest(value.lastTest),
    matchThreshold: normalizeNumber(
      value.matchThreshold,
      defaults.matchThreshold,
      {
        min: 0.4,
        max: 1,
      },
    ),
  };
}

function normalizeDesktopAgent(value: unknown): DesktopAgentSettings {
  const defaults = createDefaultDesktopStoredSettings().desktopAgent;
  if (!isRecord(value)) {
    return defaults;
  }
  return {
    personaName:
      typeof value.personaName === "string" && value.personaName.trim()
        ? value.personaName.trim()
        : defaults.personaName,
    rolePrompt:
      typeof value.rolePrompt === "string" && value.rolePrompt.trim()
        ? value.rolePrompt.trim()
        : defaults.rolePrompt,
  };
}

function normalizeMcpServer(value: unknown): McpServerSetting | null {
  if (!isRecord(value)) {
    return null;
  }
  const headers = isRecord(value.headers)
    ? (() => {
        const next: Record<string, string> = {};
        Object.entries(value.headers).forEach(([key, entry]) => {
          if (
            typeof key === "string" &&
            typeof entry === "string" &&
            key.trim()
          ) {
            next[key.trim()] = entry;
          }
        });
        return Object.keys(next).length ? next : undefined;
      })()
    : undefined;

  return {
    id:
      typeof value.id === "string" && value.id.trim()
        ? value.id
        : `mcp-${crypto.randomUUID()}`,
    name: typeof value.name === "string" ? value.name : "MCP Server",
    enabled: normalizeBoolean(value.enabled),
    url: typeof value.url === "string" ? value.url : "",
    headers,
    lastTest: isRecord(value.lastTest)
      ? {
          ok: normalizeBoolean(value.lastTest.ok),
          message:
            typeof value.lastTest.message === "string"
              ? value.lastTest.message
              : "",
          testedAt:
            typeof value.lastTest.testedAt === "string"
              ? value.lastTest.testedAt
              : "",
        }
      : null,
  };
}

function normalizeStoredSettings(value: unknown): DesktopStoredSettings {
  const defaults = createDefaultDesktopStoredSettings();
  if (!isRecord(value)) {
    return defaults;
  }
  const socialImport = isRecord(value.socialImport) ? value.socialImport : {};
  const twitter = isRecord(socialImport.twitter) ? socialImport.twitter : {};
  const mastodon = isRecord(socialImport.mastodon) ? socialImport.mastodon : {};

  const colorPalette = normalizeStringArray(
    value.colorPalette,
    defaults.colorPalette,
  );
  const safePalette = colorPalette.length
    ? colorPalette
    : defaults.colorPalette;

  return {
    dashboardView:
      value.dashboardView === "list" || value.dashboardView === "cards"
        ? value.dashboardView
        : defaults.dashboardView,
    colorPalette: safePalette,
    lastUsedColor:
      typeof value.lastUsedColor === "string" &&
      safePalette.includes(value.lastUsedColor)
        ? value.lastUsedColor
        : safePalette[0] || DEFAULT_COLORS[0],
    lastUsedStyle: isHighlightStyle(value.lastUsedStyle)
      ? value.lastUsedStyle
      : DEFAULT_HIGHLIGHT_STYLE,
    aiAssistantEnabled: normalizeBoolean(value.aiAssistantEnabled),
    aiProviders: Array.isArray(value.aiProviders)
      ? value.aiProviders
          .map((provider) => normalizeProvider(provider))
          .filter(
            (provider): provider is AIProviderSetting => provider !== null,
          )
      : defaults.aiProviders,
    aiAgents: normalizeAgents(value.aiAgents),
    aiMcpServers: Array.isArray(value.aiMcpServers)
      ? value.aiMcpServers
          .map((server) => normalizeMcpServer(server))
          .filter((server): server is McpServerSetting => server !== null)
      : defaults.aiMcpServers,
    aiLocalTools: normalizeLocalTools(value.aiLocalTools),
    aiSkills: normalizeSkills(value.aiSkills),
    vectorSearch: normalizeVectorSettings(value.vectorSearch),
    desktopAgent: normalizeDesktopAgent(value.desktopAgent),
    socialImport: {
      twitter: {
        profileUrl:
          typeof twitter.profileUrl === "string"
            ? twitter.profileUrl
            : defaults.socialImport.twitter.profileUrl,
      },
      mastodon: {
        profileUrl:
          typeof mastodon.profileUrl === "string"
            ? mastodon.profileUrl
            : defaults.socialImport.mastodon.profileUrl,
      },
    },
  };
}

function normalizeSyncPatch(value: Partial<SyncSettings>): Partial<SyncConfig> {
  const patch: Partial<SyncConfig> = {};
  if (typeof value.enabled === "boolean") {
    patch.enabled = value.enabled;
  }
  if (value.s3) {
    patch.s3 = {
      endpoint: typeof value.s3.endpoint === "string" ? value.s3.endpoint : "",
      region: typeof value.s3.region === "string" ? value.s3.region : "",
      bucket: typeof value.s3.bucket === "string" ? value.s3.bucket : "",
      accessKeyId:
        typeof value.s3.accessKeyId === "string" ? value.s3.accessKeyId : "",
      secretAccessKey:
        typeof value.s3.secretAccessKey === "string"
          ? value.s3.secretAccessKey
          : "",
      sessionToken:
        typeof value.s3.sessionToken === "string" ? value.s3.sessionToken : "",
      prefix: typeof value.s3.prefix === "string" ? value.s3.prefix : "",
    };
  }
  return patch;
}

export const useSettingsStore = defineStore("desktop-settings", () => {
  const settings: DesktopSettings = reactive(createDefaultDesktopSettings());
  const settingsStatus = ref("");
  const timers = new Map<typeof settingsStatus, number>();

  function setTimedStatus(
    target: typeof settingsStatus,
    message: string,
    duration = 3000,
  ) {
    target.value = message;
    if (timers.has(target)) {
      window.clearTimeout(timers.get(target));
    }
    if (duration > 0) {
      const id = window.setTimeout(() => {
        target.value = "";
        timers.delete(target);
      }, duration);
      timers.set(target, id);
    }
  }

  function applyStoredSettings(next: DesktopStoredSettings) {
    Object.assign(settings, next);
  }

  function applySyncSettings(next: SyncSettings) {
    settings.sync = next;
  }

  async function initialize() {
    await loadSettings();
  }

  async function loadSettings() {
    try {
      const [storedResult, syncResult] = await Promise.all([
        desktopDashboardHost.settings.getSettings(),
        desktopDashboardHost.sync?.getConfig(),
      ]);
      applyStoredSettings(normalizeStoredSettings(storedResult));
      applySyncSettings(
        syncResult
          ? syncConfigToSettings(syncResult)
          : createDefaultSyncSettings(),
      );
    } catch (error) {
      console.error("Failed to load desktop settings", error);
    }
  }

  async function saveSettings(payload: Partial<DesktopSettings>) {
    settingsStatus.value = "保存中…";
    try {
      const tasks: Promise<void>[] = [];
      const storedPatch = { ...payload };
      delete storedPatch.sync;

      if (Object.keys(storedPatch).length) {
        tasks.push(
          desktopDashboardHost.settings
            .updateSettings(storedPatch as Partial<DesktopStoredSettings>)
            .then((result) => {
              applyStoredSettings(normalizeStoredSettings(result));
            }),
        );
      }

      if (payload.sync && desktopDashboardHost.sync) {
        tasks.push(
          desktopDashboardHost.sync
            .updateConfig(normalizeSyncPatch(payload.sync))
            .then((result) => {
              applySyncSettings(syncConfigToSettings(result));
            }),
        );
      }

      await Promise.all(tasks);
      setTimedStatus(settingsStatus, "设置已保存");
    } catch (error) {
      setTimedStatus(
        settingsStatus,
        `保存失败：${(error as Error).message}`,
        4000,
      );
      throw error;
    }
  }

  function cleanup() {
    timers.forEach((id) => window.clearTimeout(id));
    timers.clear();
  }

  return {
    settings,
    settingsStatus,
    initialize,
    loadSettings,
    saveSettings,
    cleanup,
  };
});
