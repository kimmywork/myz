import { computed, inject, ref, watch } from "vue";
import {
  createProviderSetting,
  createModelSetting,
} from "../../../components/ai-settings/factories.js";
import { getProviderTypeMeta } from "../../../components/ai-settings/providerCatalog.js";
import { useSettingsStore } from "../../../stores/settings.js";
import type {
  AIAgentsSettings,
  AIModelSetting,
  AIProviderSetting,
  AILocalToolsSettings,
  AISkillsSettings,
  McpServerSetting,
} from "@/background/settings.js";
import { sendMessage } from "@/shared/messaging.js";
import type {
  AIProviderFetchModelsMessageResult,
  AIProviderTestConnectionMessageResult,
} from "@/background/messages/ai";
import { DEFAULT_COLORS, HIGHLIGHT_STYLES } from "@/shared/types.js";

export const aiSettingsKey = Symbol("ai-settings");

function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

function ensureProviderHasModel(provider: AIProviderSetting) {
  if (provider.models?.length) return provider;
  return { ...provider, models: [createModelSetting("")] };
}

function clearMissingTargets(
  agents: AIAgentsSettings,
  providers: AIProviderSetting[],
): AIAgentsSettings {
  const providerById = new Map(providers.map((p) => [p.id, p]));

  const normalize = (key: "conversation" | "insights" | "autoHighlight") => {
    const agent = agents[key];
    if (!agent?.target) {
      return key === "conversation"
        ? { ...agent, multimodalTarget: null }
        : agent;
    }
    const provider = providerById.get(agent.target.providerId);
    if (!provider?.enabled || !provider.lastTest?.ok) {
      return { ...agent, target: null };
    }
    const model = (provider.models || []).find(
      (m) => m.id === agent.target?.modelId,
    );
    if (!model?.enabled) {
      return { ...agent, target: null };
    }
    if (key !== "conversation") {
      return agent;
    }
    if (model.capabilities?.vision) {
      return { ...agent, multimodalTarget: null };
    }
    const multimodalTarget = agent.multimodalTarget;
    if (!multimodalTarget?.providerId || !multimodalTarget?.modelId) {
      return { ...agent, multimodalTarget: null };
    }
    const multimodalProvider = providerById.get(multimodalTarget.providerId);
    if (!multimodalProvider?.enabled || !multimodalProvider.lastTest?.ok) {
      return { ...agent, multimodalTarget: null };
    }
    const multimodalModel = (multimodalProvider.models || []).find(
      (item) => item.id === multimodalTarget.modelId,
    );
    if (!multimodalModel?.enabled || !multimodalModel.capabilities?.vision) {
      return { ...agent, multimodalTarget: null };
    }
    return agent;
  };

  return {
    conversation: normalize("conversation"),
    insights: normalize("insights"),
    autoHighlight: normalize("autoHighlight"),
  };
}

export const createAiSettingsContext = () => {
  const store = useSettingsStore();
  const aiAssistantEnabled = ref(false);
  const providers = ref<AIProviderSetting[]>([]);
  const agents = ref<AIAgentsSettings>({
    conversation: {
      target: null,
      temperature: 0.7,
      compressImages: false,
      multimodalTarget: null,
      superpowerMode: false,
      contextCompressionThreshold: 80,
    },
    insights: { target: null, temperature: 0.7 },
    autoHighlight: {
      target: null,
      temperature: 0.4,
      maxHighlights: 15,
      categoryStyles: {
        conceptual: {
          style: HIGHLIGHT_STYLES.PAINT,
          color: DEFAULT_COLORS[0],
        },
        structural: {
          style: HIGHLIGHT_STYLES.UNDERLINE,
          color: DEFAULT_COLORS[3] || DEFAULT_COLORS[0],
        },
        behavioural: {
          style: HIGHLIGHT_STYLES.WAVY,
          color: DEFAULT_COLORS[1] || DEFAULT_COLORS[0],
        },
      },
    },
  });
  const mcpServers = ref<McpServerSetting[]>([]);
  const localTools = ref<AILocalToolsSettings>({
    enabledToolNames: [],
    mode: "manual",
    autoSelectorTarget: null,
  });
  const skillsSettings = ref<AISkillsSettings>({
    mode: "manual",
    autoSelectorTarget: null,
  });

  const selectedProviderId = ref<string | null>(null);
  const isFetchingModels = ref(false);
  const isTesting = ref(false);
  const catalogStatusMessage = ref("");
  const catalogByProviderId = ref<Record<string, string[]>>({});
  const providerSaveNotice = ref("");
  const agentSaveNotice = ref("");
  const mcpSaveNotice = ref("");
  const localToolsSaveNotice = ref("");
  const skillsSaveNotice = ref("");

  const usedByMap = computed(() => {
    const map: Record<string, string[]> = {};
    const targets = [
      { key: "Conversation", target: agents.value.conversation?.target },
      { key: "Insights", target: agents.value.insights?.target },
      { key: "Auto Highlight", target: agents.value.autoHighlight?.target },
    ];
    targets.forEach(({ key, target }) => {
      if (!target?.providerId) return;
      map[target.providerId] = map[target.providerId] || [];
      map[target.providerId].push(key);
    });
    return map;
  });

  const hasEnabledProvider = computed(() =>
    providers.value.some((provider) => provider.enabled),
  );

  const selectedProvider = computed(
    () =>
      providers.value.find((p) => p.id === selectedProviderId.value) || null,
  );

  const selectedCatalog = computed(() => {
    const id = selectedProviderId.value;
    if (!id) return [];
    return catalogByProviderId.value[id] || [];
  });

  const setFormFromStore = () => {
    aiAssistantEnabled.value = Boolean(store.settings.aiAssistantEnabled);
    providers.value = (store.settings.aiProviders || []).map((p) =>
      ensureProviderHasModel(deepClone(p)),
    );
    if (providers.value.length === 0) {
      const created = ensureProviderHasModel(createProviderSetting());
      providers.value = [created];
      selectedProviderId.value = created.id;
    }
    agents.value = deepClone(store.settings.aiAgents);
    mcpServers.value = (store.settings.aiMcpServers || []).map((s) => ({
      ...s,
    }));
    localTools.value = store.settings.aiLocalTools
      ? deepClone(store.settings.aiLocalTools)
      : localTools.value;
    skillsSettings.value = store.settings.aiSkills
      ? deepClone(store.settings.aiSkills)
      : skillsSettings.value;

    if (
      !selectedProviderId.value ||
      !providers.value.some((p) => p.id === selectedProviderId.value)
    ) {
      selectedProviderId.value = providers.value[0]?.id || null;
    }
  };

  watch(
    () => store.settings,
    () => setFormFromStore(),
    { deep: true, immediate: true },
  );

  watch(hasEnabledProvider, (enabled) => {
    if (!enabled && aiAssistantEnabled.value) {
      aiAssistantEnabled.value = false;
    }
  });

  const replaceProvider = (next: AIProviderSetting) => {
    providers.value = providers.value.map((p) => (p.id === next.id ? next : p));
  };

  const renameProvider = (id: string, name: string) => {
    providers.value = providers.value.map((p) =>
      p.id === id ? { ...p, name } : p,
    );
  };

  const addProvider = () => {
    const created = ensureProviderHasModel(createProviderSetting());
    providers.value = [...providers.value, created];
    selectedProviderId.value = created.id;
    catalogStatusMessage.value = "";
  };

  const removeProvider = (id: string) => {
    providers.value = providers.value.filter((p) => p.id !== id);
    agents.value = {
      conversation:
        agents.value.conversation.target?.providerId === id
          ? { ...agents.value.conversation, target: null }
          : agents.value.conversation,
      insights:
        agents.value.insights.target?.providerId === id
          ? { ...agents.value.insights, target: null }
          : agents.value.insights,
      autoHighlight:
        agents.value.autoHighlight.target?.providerId === id
          ? { ...agents.value.autoHighlight, target: null }
          : agents.value.autoHighlight,
    };
    if (selectedProviderId.value === id) {
      selectedProviderId.value = providers.value[0]?.id || null;
    }
  };

  const fetchModels = async () => {
    const provider = selectedProvider.value;
    if (!provider) return;
    catalogStatusMessage.value = "";
    isFetchingModels.value = true;
    try {
      const result = await sendMessage<
        {
          type: AIProviderSetting["type"];
          baseUrl: string;
          apiKey: string;
          headers?: string;
        },
        AIProviderFetchModelsMessageResult
      >("myz:aiProviderFetchModels", {
        type: provider.type,
        baseUrl: provider.baseUrl,
        apiKey: provider.apiKey,
        headers: provider.headers || "",
      });
      const models = Array.isArray(result?.models) ? result.models : [];
      catalogByProviderId.value = {
        ...catalogByProviderId.value,
        [provider.id]: models,
      };
      catalogStatusMessage.value = models.length
        ? `已加载 ${models.length} 个模型`
        : "未返回模型";
    } catch (error) {
      catalogStatusMessage.value = `加载失败：${(error as Error).message}`;
    } finally {
      isFetchingModels.value = false;
    }
  };

  const testConnection = async (model: AIModelSetting) => {
    const provider = selectedProvider.value;
    if (!provider) return;

    isTesting.value = true;
    try {
      const meta = getProviderTypeMeta(provider.type);
      if (!provider.baseUrl) {
        throw new Error("Base URL is required");
      }
      if (meta.requiresApiKey && !provider.apiKey) {
        throw new Error("API key is required");
      }
      const result = await sendMessage<
        {
          provider: Pick<
            AIProviderSetting,
            | "baseUrl"
            | "apiKey"
            | "headers"
            | "type"
            | "streamingEnabled"
            | "compatProfile"
            | "reasoningMode"
            | "reasoningEffort"
            | "reasoningBudget"
          >;
          model: string;
          maxOutputTokens?: number;
          maxOutputTokenParam?: AIModelSetting["limits"]["maxOutputTokenParam"];
        },
        AIProviderTestConnectionMessageResult
      >("myz:aiProviderTestConnection", {
        provider: {
          baseUrl: provider.baseUrl,
          apiKey: provider.apiKey,
          headers: provider.headers || "",
          type: provider.type,
          streamingEnabled: provider.streamingEnabled,
          compatProfile: provider.compatProfile,
          reasoningMode: provider.reasoningMode,
          reasoningEffort: provider.reasoningEffort,
          reasoningBudget: provider.reasoningBudget,
        },
        model: model.model,
        maxOutputTokens: model.limits?.maxOutputTokens,
        maxOutputTokenParam: model.limits?.maxOutputTokenParam,
      });
      const ok = Boolean(result?.success);
      const message = ok
        ? result?.response || "连接成功"
        : result?.error || "连接失败";
      const testedAt = new Date().toISOString();

      const next: AIProviderSetting = {
        ...provider,
        enabled: ok ? provider.enabled : false,
        lastTest: { ok, message, testedAt, model: model.model },
      };
      replaceProvider(next);
    } catch (error) {
      const message = (error as Error).message;
      const testedAt = new Date().toISOString();
      const next: AIProviderSetting = {
        ...provider,
        enabled: false,
        lastTest: { ok: false, message, testedAt, model: model.model },
      };
      replaceProvider(next);
    } finally {
      isTesting.value = false;
    }
  };

  const setTimedNotice = (
    target: typeof providerSaveNotice,
    message: string,
  ) => {
    target.value = message;
    setTimeout(() => {
      if (target.value === message) target.value = "";
    }, 2500);
  };

  const buildProvidersForSave = () => {
    const nextProviders = providers.value.map((p) => {
      const testedModel = String(p.lastTest?.model || "").trim();
      const enabledModels = (p.models || []).filter((m) => m.enabled);
      const hasEnabledModel = enabledModels.length > 0;
      const hasTestedEnabledModel =
        Boolean(p.lastTest?.ok) &&
        Boolean(testedModel) &&
        enabledModels.some(
          (model) => String(model.model || "").trim() === testedModel,
        );
      if (
        (!p.lastTest?.ok || !hasEnabledModel || !hasTestedEnabledModel) &&
        p.enabled
      ) {
        return { ...p, enabled: false };
      }
      return p;
    });
    providers.value = nextProviders;
    return nextProviders;
  };

  const saveProvidersSection = async () => {
    const nextProviders = buildProvidersForSave();
    const nextAgents = clearMissingTargets(agents.value, nextProviders);
    await store.saveSettings({
      aiAssistantEnabled: Boolean(aiAssistantEnabled.value),
      aiProviders: nextProviders,
      aiAgents: nextAgents,
    });
    agents.value = nextAgents;
    setTimedNotice(providerSaveNotice, "已保存");
  };

  const saveAgentsSection = async () => {
    const nextProviders = buildProvidersForSave();
    const nextAgents = clearMissingTargets(agents.value, nextProviders);
    await store.saveSettings({ aiAgents: nextAgents });
    agents.value = nextAgents;
    setTimedNotice(agentSaveNotice, "已保存");
  };

  const saveMcpSection = async () => {
    await store.saveSettings({ aiMcpServers: mcpServers.value });
    setTimedNotice(mcpSaveNotice, "已保存");
  };

  const saveLocalToolsSection = async () => {
    await store.saveSettings({ aiLocalTools: localTools.value });
    setTimedNotice(localToolsSaveNotice, "已保存");
  };

  const saveSkillsSection = async () => {
    await store.saveSettings({ aiSkills: skillsSettings.value });
    setTimedNotice(skillsSaveNotice, "已保存");
  };

  return {
    aiAssistantEnabled,
    providers,
    agents,
    mcpServers,
    localTools,
    skillsSettings,
    selectedProviderId,
    selectedProvider,
    selectedCatalog,
    usedByMap,
    isFetchingModels,
    isTesting,
    catalogStatusMessage,
    providerSaveNotice,
    agentSaveNotice,
    mcpSaveNotice,
    localToolsSaveNotice,
    skillsSaveNotice,
    hasEnabledProvider,
    replaceProvider,
    renameProvider,
    addProvider,
    removeProvider,
    fetchModels,
    testConnection,
    saveProvidersSection,
    saveAgentsSection,
    saveMcpSection,
    saveLocalToolsSection,
    saveSkillsSection,
  };
};

export type AiSettingsContext = ReturnType<typeof createAiSettingsContext>;

export const useAiSettingsContext = () => {
  const context = inject<AiSettingsContext>(aiSettingsKey);
  if (!context) {
    throw new Error("AiSettingsContext is not provided");
  }
  return context;
};
