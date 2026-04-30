import { testMcpConnection } from "@myz/ai-core/mcp";
import {
  fetchProviderModels,
  testProviderConnection,
} from "@myz/ai-core/providers/registry";
import { computed, inject, ref, watch } from "vue";
import { createProviderSetting } from "@myz/dashboard-ai-settings";
import {
  desktopChatHost,
  type DesktopWorkspaceContext,
} from "../../../../host/desktop";
import { useSettingsStore } from "../../../stores/settings";
import type {
  AIAgentsSettings,
  AIModelSetting,
  AILocalToolsSettings,
  DesktopAgentSettings,
  AIProviderSetting,
  AISkillsSettings,
  McpServerSetting,
  VectorSettings,
} from "../../../types/settings";

export const aiSettingsKey = Symbol("desktop-ai-settings");

function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

export const createAiSettingsContext = () => {
  const store = useSettingsStore();
  const aiAssistantEnabled = ref(false);
  const providers = ref<AIProviderSetting[]>([]);
  const agents = ref<AIAgentsSettings>(deepClone(store.settings.aiAgents));
  const mcpServers = ref<McpServerSetting[]>([]);
  const localTools = ref<AILocalToolsSettings>(
    deepClone(store.settings.aiLocalTools),
  );
  const skillsSettings = ref<AISkillsSettings>(
    deepClone(store.settings.aiSkills),
  );
  const vectorSettings = ref<VectorSettings>(
    deepClone(store.settings.vectorSearch),
  );
  const desktopAgent = ref<DesktopAgentSettings>(
    deepClone(store.settings.desktopAgent),
  );
  const workspaceContext = ref<DesktopWorkspaceContext | null>(null);

  const selectedProviderId = ref<string | null>(null);
  const isFetchingModels = ref(false);
  const providerSaveNotice = ref("");
  const providerTestNotice = ref("");
  const catalogStatusMessage = ref("");
  const agentSaveNotice = ref("");
  const mcpSaveNotice = ref("");
  const mcpTestNotice = ref("");
  const localToolsSaveNotice = ref("");
  const skillsSaveNotice = ref("");
  const vectorSaveNotice = ref("");
  const vectorTestNotice = ref("");
  const testingProviderId = ref<string | null>(null);
  const testingMcpServerId = ref<string | null>(null);
  const isVectorTesting = ref(false);
  const catalogByProviderId = ref<Record<string, string[]>>({});

  const usedByMap = computed(() => {
    const map: Record<string, string[]> = {};
    const targets = [
      { key: "Conversation", target: agents.value.conversation?.target },
      { key: "Vector Search", target: vectorSettings.value.target },
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
      providers.value.find(
        (provider) => provider.id === selectedProviderId.value,
      ) || null,
  );

  const selectedCatalog = computed(() => {
    const id = selectedProviderId.value;
    if (!id) return [];
    return catalogByProviderId.value[id] || [];
  });

  const selectedProviderTestModel = computed(() =>
    resolveProviderTestModel(selectedProvider.value),
  );

  const conversationTargetSummary = computed(() =>
    describeModelTarget(agents.value.conversation?.target),
  );

  const conversationTargetLastTest = computed(() => {
    const resolved = resolveTarget(agents.value.conversation?.target);
    if (!resolved) return null;
    const lastTest = resolved.provider.lastTest;
    if (!lastTest || lastTest.model !== resolved.model.model) {
      return null;
    }
    return lastTest;
  });

  const vectorTargetSummary = computed(() =>
    describeModelTarget(vectorSettings.value.target),
  );

  function setTimedNotice(target: { value: string }, message: string) {
    target.value = message;
    window.setTimeout(() => {
      if (target.value === message) {
        target.value = "";
      }
    }, 2500);
  }

  function setFormFromStore() {
    aiAssistantEnabled.value = Boolean(store.settings.aiAssistantEnabled);
    providers.value = (store.settings.aiProviders || []).map((provider) =>
      deepClone(provider),
    );
    if (!providers.value.length) {
      const created = createProviderSetting();
      providers.value = [created];
      selectedProviderId.value = created.id;
    }
    agents.value = deepClone(store.settings.aiAgents);
    mcpServers.value = (store.settings.aiMcpServers || []).map((server) =>
      deepClone(server),
    );
    localTools.value = deepClone(store.settings.aiLocalTools);
    skillsSettings.value = deepClone(store.settings.aiSkills);
    vectorSettings.value = deepClone(store.settings.vectorSearch);
    desktopAgent.value = deepClone(store.settings.desktopAgent);

    if (
      !selectedProviderId.value ||
      !providers.value.some(
        (provider) => provider.id === selectedProviderId.value,
      )
    ) {
      selectedProviderId.value = providers.value[0]?.id || null;
    }
  }

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

  function replaceProvider(next: AIProviderSetting) {
    providers.value = providers.value.map((provider) =>
      provider.id === next.id ? next : provider,
    );
  }

  function resolveProviderTestModel(provider: AIProviderSetting | null) {
    if (!provider) return null;
    return (
      provider.models.find((model) => model.enabled && model.model.trim()) ||
      provider.models.find((model) => model.model.trim()) ||
      null
    );
  }

  function resolveTarget(
    target: { providerId: string; modelId: string } | null,
  ) {
    if (!target?.providerId || !target?.modelId) {
      return null;
    }
    const provider = providers.value.find(
      (item) => item.id === target.providerId,
    );
    const model =
      provider?.models.find((item) => item.id === target.modelId) || null;
    if (!provider || !model || !model.model.trim()) {
      return null;
    }
    return { provider, model };
  }

  function describeModelTarget(
    target: { providerId: string; modelId: string } | null,
  ) {
    const resolved = resolveTarget(target);
    if (!resolved) return "未选择";
    return `${resolved.provider.name} / ${resolved.model.model}`;
  }

  function createProviderLastTest(
    model: AIModelSetting,
    result: { success: boolean; response?: string; error?: string },
  ) {
    const fallbackMessage = result.success
      ? "连接测试成功"
      : result.error || "连接测试失败";
    const responseText = result.response?.trim();
    return {
      ok: result.success,
      message: result.success && responseText ? responseText : fallbackMessage,
      testedAt: new Date().toISOString(),
      model: model.model,
    };
  }

  async function persistProvidersState() {
    await store.saveSettings({
      aiAssistantEnabled: Boolean(aiAssistantEnabled.value),
      aiProviders: providers.value,
    });
  }

  async function runProviderConnectionTest(
    providerId: string,
    preferredModel?: AIModelSetting | null,
  ) {
    const provider =
      providers.value.find((item) => item.id === providerId) || null;
    const model =
      preferredModel && preferredModel.model.trim()
        ? preferredModel
        : resolveProviderTestModel(provider);
    if (!provider || !model) {
      setTimedNotice(
        providerTestNotice,
        "请先为当前 Provider 配置至少一个模型",
      );
      return;
    }

    testingProviderId.value = providerId;
    providerTestNotice.value = "连接测试中…";
    try {
      const result = await testProviderConnection({
        provider,
        model: model.model,
        maxOutputTokens: model.limits.maxOutputTokens,
        maxOutputTokenParam: model.limits.maxOutputTokenParam,
      });
      const nextProvider = {
        ...provider,
        lastTest: createProviderLastTest(model, result),
      };
      replaceProvider(nextProvider);
      await persistProvidersState();
      setTimedNotice(
        providerTestNotice,
        result.success
          ? `连接成功：${model.model}`
          : `连接失败：${nextProvider.lastTest?.message || "连接测试失败"}`,
      );
    } catch (error) {
      const message = (error as Error).message;
      replaceProvider({
        ...provider,
        lastTest: {
          ok: false,
          message,
          testedAt: new Date().toISOString(),
          model: model.model,
        },
      });
      await persistProvidersState();
      setTimedNotice(providerTestNotice, `连接失败：${message}`);
    } finally {
      testingProviderId.value = null;
    }
  }

  async function fetchModelsForProvider(providerId: string) {
    const provider =
      providers.value.find((item) => item.id === providerId) || null;
    if (!provider) {
      return;
    }
    catalogStatusMessage.value = "";
    isFetchingModels.value = true;
    try {
      const models = await fetchProviderModels({
        type: provider.type,
        baseUrl: provider.baseUrl,
        apiKey: provider.apiKey,
        headers: provider.headers || "",
      });
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
  }

  async function runMcpConnectionTest(serverId: string) {
    const server =
      mcpServers.value.find((item) => item.id === serverId) || null;
    const url = server?.url?.trim() || "";
    if (!server || !url) {
      setTimedNotice(mcpTestNotice, "请先填写 MCP 服务器 URL");
      return;
    }

    testingMcpServerId.value = serverId;
    mcpTestNotice.value = "连接测试中…";
    try {
      const result = await testMcpConnection({
        url,
        headers: server.headers,
      });
      const message = result.success
        ? `连接成功，发现 ${result.tools?.length || 0} 个工具${
            typeof result.resources?.length === "number"
              ? `，${result.resources.length} 个资源`
              : ""
          }`
        : result.error || "连接测试失败";
      mcpServers.value = mcpServers.value.map((item) =>
        item.id === serverId
          ? {
              ...item,
              lastTest: {
                ok: result.success,
                message,
                testedAt: new Date().toISOString(),
              },
            }
          : item,
      );
      await store.saveSettings({ aiMcpServers: mcpServers.value });
      setTimedNotice(
        mcpTestNotice,
        result.success ? message : `连接失败：${message}`,
      );
    } finally {
      testingMcpServerId.value = null;
    }
  }

  async function runVectorConnectionTest() {
    const resolved = resolveTarget(vectorSettings.value.target);
    if (!resolved) {
      setTimedNotice(
        vectorTestNotice,
        "请先为向量检索选择可用的 Provider / Model",
      );
      return;
    }

    isVectorTesting.value = true;
    vectorTestNotice.value = "连接测试中…";
    try {
      const result = await testProviderConnection({
        provider: resolved.provider,
        model: resolved.model.model,
        maxOutputTokens: resolved.model.limits.maxOutputTokens,
        maxOutputTokenParam: resolved.model.limits.maxOutputTokenParam,
      });
      vectorSettings.value = {
        ...vectorSettings.value,
        lastTest: {
          ok: result.success,
          message: result.success
            ? result.response?.trim() || "向量模型连接成功"
            : result.error || "连接测试失败",
          testedAt: new Date().toISOString(),
          providerId: resolved.provider.id,
          modelId: resolved.model.id,
          model: resolved.model.model,
        },
      };
      await store.saveSettings({
        aiProviders: providers.value,
        vectorSearch: vectorSettings.value,
      });
      setTimedNotice(
        vectorTestNotice,
        result.success
          ? `连接成功：${resolved.model.model}`
          : `连接失败：${vectorSettings.value.lastTest?.message || "连接测试失败"}`,
      );
    } finally {
      isVectorTesting.value = false;
    }
  }

  function renameProvider(id: string, name: string) {
    providers.value = providers.value.map((provider) =>
      provider.id === id ? { ...provider, name } : provider,
    );
  }

  function addProvider() {
    const created = createProviderSetting();
    providers.value = [...providers.value, created];
    selectedProviderId.value = created.id;
    catalogStatusMessage.value = "";
  }

  function removeProvider(id: string) {
    providers.value = providers.value.filter((provider) => provider.id !== id);
    agents.value = {
      conversation:
        agents.value.conversation.target?.providerId === id
          ? {
              ...agents.value.conversation,
              target: null,
              multimodalTarget: null,
            }
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
    if (vectorSettings.value.target?.providerId === id) {
      vectorSettings.value = {
        ...vectorSettings.value,
        target: null,
        enabled: false,
      };
    }
    if (selectedProviderId.value === id) {
      selectedProviderId.value = providers.value[0]?.id || null;
    }
  }

  async function saveProvidersSection() {
    await store.saveSettings({
      aiAssistantEnabled: Boolean(aiAssistantEnabled.value),
      aiProviders: providers.value,
    });
    setTimedNotice(providerSaveNotice, "已保存");
  }

  async function saveAgentsSection() {
    await store.saveSettings({
      aiAgents: agents.value,
      desktopAgent: desktopAgent.value,
    });
    setTimedNotice(agentSaveNotice, "已保存");
  }

  async function loadWorkspaceContext() {
    workspaceContext.value = await desktopChatHost.getWorkspaceContext();
  }

  void loadWorkspaceContext();

  async function saveMcpSection() {
    await store.saveSettings({ aiMcpServers: mcpServers.value });
    setTimedNotice(mcpSaveNotice, "已保存");
  }

  async function saveLocalToolsSection() {
    await store.saveSettings({ aiLocalTools: localTools.value });
    setTimedNotice(localToolsSaveNotice, "已保存");
  }

  async function saveSkillsSection() {
    await store.saveSettings({ aiSkills: skillsSettings.value });
    setTimedNotice(skillsSaveNotice, "已保存");
  }

  async function saveVectorSection() {
    await store.saveSettings({ vectorSearch: vectorSettings.value });
    setTimedNotice(vectorSaveNotice, "已保存");
  }

  return {
    aiAssistantEnabled,
    providers,
    agents,
    mcpServers,
    localTools,
    skillsSettings,
    vectorSettings,
    desktopAgent,
    workspaceContext,
    selectedProviderId,
    selectedProvider,
    selectedCatalog,
    usedByMap,
    isFetchingModels,
    providerSaveNotice,
    providerTestNotice,
    catalogStatusMessage,
    agentSaveNotice,
    mcpSaveNotice,
    mcpTestNotice,
    localToolsSaveNotice,
    skillsSaveNotice,
    vectorSaveNotice,
    vectorTestNotice,
    hasEnabledProvider,
    testingProviderId,
    testingMcpServerId,
    isVectorTesting,
    selectedProviderTestModel,
    conversationTargetSummary,
    conversationTargetLastTest,
    vectorTargetSummary,
    replaceProvider,
    renameProvider,
    addProvider,
    removeProvider,
    fetchModelsForProvider,
    runProviderConnectionTest,
    runMcpConnectionTest,
    runVectorConnectionTest,
    saveProvidersSection,
    saveAgentsSection,
    saveMcpSection,
    saveLocalToolsSection,
    saveSkillsSection,
    saveVectorSection,
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
