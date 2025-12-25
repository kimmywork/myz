import {
  defineComponent,
  ref,
  reactive,
  computed,
  watch,
  onMounted,
  ComputedRef,
  Ref,
} from "vue";
import { useSettingsStore } from "../stores/settings.js";
import {
  AIAssistantSettings,
  AIProviderSetting,
  McpServerSetting,
} from "@/background/settings";

function newProviderTemplate(): AIProviderSetting {
  return {
    id: crypto.randomUUID ? crypto.randomUUID() : `prov_${Date.now()}`,
    name: "自定义 Provider",
    apiEndpoint: "",
    apiKey: "",
    model: "gpt-4",
    customModel: "",
    contextSize: "32K",
    maxTokens: getTokensForContextSize("32K"),
    requestHeaders: "",
    lastTestStatus: { ok: false, message: "" },
  };
}

function legacyProviderFromSettings(
  settings: Partial<AIAssistantSettings> = {},
) {
  if (
    !settings ||
    (!settings.aiApiEndpoint && !settings.aiApiKey && !settings.aiModel)
  ) {
    return null;
  }
  return {
    ...newProviderTemplate(),
    id: "provider-default",
    name: "默认 Provider",
    apiEndpoint: settings.aiApiEndpoint || "",
    apiKey: settings.aiApiKey || "",
    model: settings.aiModel || "gpt-4",
    customModel: settings.aiCustomModel || "",
    contextSize: settings.aiContextSize || "32K",
    maxTokens:
      typeof settings.aiMaxTokens === "number"
        ? settings.aiMaxTokens
        : getTokensForContextSize(settings.aiContextSize || "32K"),
    requestHeaders: settings.aiRequestHeaders || "",
    lastTestStatus: { ok: true, message: "已迁移" },
  };
}

function getTokensForContextSize(size: string): number {
  const mapping: Record<string, number> = {
    "8K": 8000,
    "32K": 32000,
    "128K": 128000,
    "256K": 256000,
    "1M": 1000000,
  };
  return mapping[size] || 32000;
}

function cloneProvider(provider: AIProviderSetting): AIProviderSetting {
  return JSON.parse(JSON.stringify(provider));
}

export default defineComponent({
  name: "AiSettings",
  setup() {
    const store = useSettingsStore();
    const aiAssistantEnabled = ref(false);
    const providers: Ref<AIProviderSetting[]> = ref([]);
    const activeProviderId: Ref<string | null> = ref(null);
    const selectedProviderId: Ref<string | null> = ref(null);
    const isTestingId: Ref<string | null> = ref(null);
    const testMessage = ref("");
    const showApiKey = ref(false);
    const showCustomModel = ref(false);

    const mcpServers: Ref<McpServerSetting[]> = ref([]);
    const showMcpForm = ref(false);
    const mcpForm = reactive({
      id: "",
      name: "",
      url: "",
      enabled: true,
    });
    const editingMcpServerId: Ref<string | null> = ref(null);

    const aiModels = [
      { value: "gpt-4", label: "GPT-4" },
      { value: "gpt-4-turbo", label: "GPT-4 Turbo" },
      { value: "gpt-3.5-turbo", label: "GPT-3.5 Turbo" },
      { value: "claude-3-5-sonnet-20241022", label: "Claude 3.5 Sonnet" },
      { value: "claude-3-haiku-20240307", label: "Claude 3 Haiku" },
      { value: "gemini-pro", label: "Gemini Pro" },
      { value: "deepseek-chat", label: "DeepSeek Chat" },
      { value: "moonshot-v1-8k", label: "Kimi Moonshot V1 8K" },
      { value: "moonshot-v1-32k", label: "Kimi Moonshot V1 32K" },
      { value: "moonshot-v1-128k", label: "Kimi Moonshot V1 128K" },
      { value: "custom", label: "自定义模型..." },
    ];

    const contextSizes = [
      { value: "8K", label: "8K (约 8000 tokens)" },
      { value: "32K", label: "32K (约 32000 tokens)" },
      { value: "128K", label: "128K (约 128000 tokens)" },
      { value: "256K", label: "256K (约 256000 tokens)" },
      { value: "1M", label: "1M (约 1000000 tokens)" },
    ];

    const selectedProvider: ComputedRef<AIProviderSetting | undefined> =
      computed(() =>
        providers.value.find((p) => p.id === selectedProviderId.value),
      );

    // Sync local state with store settings
    watch(
      () => store.settings,
      (newSettings) => {
        setFormFromSettings(newSettings);
      },
      { deep: true, immediate: true }
    );

    function ensureSelection() {
      if (!selectedProvider.value && providers.value.length) {
        selectedProviderId.value =
          providers.value.find((p) => p.id === activeProviderId.value)?.id ||
          providers.value[0].id;
      }
    }

    function setFormFromSettings(settings: AIAssistantSettings) {
      aiAssistantEnabled.value = Boolean(settings.aiAssistantEnabled);
      const incomingProviders = Array.isArray(settings.aiProviders)
        ? settings.aiProviders.map(cloneProvider)
        : [];
      const legacy = legacyProviderFromSettings(settings);
      const previousSelectedId = selectedProviderId.value;
      providers.value =
        incomingProviders.length > 0
          ? incomingProviders
          : legacy
            ? [legacy]
            : [];
      const requestedActive = providers.value.find(
        (p) =>
          p.id === settings.aiActiveProviderId && p.lastTestStatus?.ok,
      );
      activeProviderId.value =
        requestedActive?.id ||
        providers.value.find((p) => p.lastTestStatus?.ok)?.id ||
        null;
      const stillExists = providers.value.find(
        (p) => p.id === previousSelectedId,
      );
      selectedProviderId.value =
        stillExists?.id ||
        activeProviderId.value ||
        providers.value[0]?.id ||
        null;
      ensureSelection();
      showCustomModel.value = selectedProvider.value?.model === "custom";

      mcpServers.value = Array.isArray(settings.aiMcpServers)
        ? settings.aiMcpServers.map((s) => ({ ...s }))
        : [];

      testMessage.value = "";
      isTestingId.value = null;
      ensureSelection();
    }

    function addProvider() {
      const created = newProviderTemplate();
      providers.value = [...providers.value, created];
      selectedProviderId.value = created.id;
      showCustomModel.value = false;
    }

    function removeProvider(id: string) {
      providers.value = providers.value.filter((p) => p.id !== id);
      if (activeProviderId.value === id) {
        const nextActive =
          providers.value.find((p) => p.lastTestStatus?.ok)?.id || null;
        activeProviderId.value = nextActive;
      }
      if (selectedProviderId.value === id) {
        selectedProviderId.value = providers.value[0]?.id || null;
      }
      ensureSelection();
      showCustomModel.value = selectedProvider.value?.model === "custom";
    }

    function updateProviderField(key: keyof AIProviderSetting, value: any) {
      const provider = selectedProvider.value;
      if (!provider) return;
      (provider[key] as any) = value;
      if (key === "contextSize") {
        provider.maxTokens = getTokensForContextSize(value);
      }
      if (key === "model") {
        showCustomModel.value = value === "custom";
      }
    }

    async function persistSettings() {
      const activeProvider =
        providers.value.find(
          (p) => p.id === activeProviderId.value && p.lastTestStatus?.ok,
        ) || null;
      const fallbackActive = providers.value.find((p) => p.lastTestStatus?.ok);
      const resolvedActiveId = activeProvider?.id || fallbackActive?.id || null;
      activeProviderId.value = resolvedActiveId;
      const payload = {
        aiAssistantEnabled: aiAssistantEnabled.value,
        aiProviders: providers.value.map(cloneProvider),
        aiActiveProviderId: resolvedActiveId,
        aiMcpServers: mcpServers.value.map((s) => ({ ...s })),
      };
      await store.saveSettings(payload);
    }

    async function handleToggle(event: Event) {
      const enabled = (event.target as HTMLInputElement).checked;
      aiAssistantEnabled.value = enabled;
      try {
        await persistSettings();
      } catch (error) {
        aiAssistantEnabled.value = !enabled;
        console.error("Failed to toggle AI assistant:", error);
      }
    }

    async function handleTestProvider() {
      const provider = selectedProvider.value;
      if (!provider) return;
      if (!provider.apiEndpoint || !provider.apiKey) {
        testMessage.value = "请输入 API 地址和密钥";
        return;
      }
      isTestingId.value = provider.id;
      testMessage.value = "";
      try {
        const testSettings: Partial<AIAssistantSettings> = {
          aiApiEndpoint: provider.apiEndpoint,
          aiApiKey: provider.apiKey,
          aiModel: provider.model,
          aiCustomModel: provider.customModel,
          aiRequestHeaders: provider.requestHeaders,
        };

        const result = await store.testAiConnection(testSettings);
        
        provider.lastTestStatus = {
          ok: Boolean(result.success),
          message: result.success
            ? result.response || "连接成功"
            : result.error || "连接失败",
        };
        testMessage.value = provider.lastTestStatus.message;
        if (result.success) {
          await persistSettings();
        }
      } catch (e) {
        provider.lastTestStatus = {
          ok: false,
          message: (e as Error).message,
        };
        testMessage.value = (e as Error).message;
      } finally {
        isTestingId.value = null;
      }
    }

    async function handleSaveProvider() {
      if (!selectedProvider.value) {
        return;
      }
      try {
        await persistSettings();
      } catch (error) {
        console.error("Failed to save provider:", error);
      }
    }

    async function handleSelectActive(id: string) {
      const provider = providers.value.find((p) => p.id === id);
      if (!provider) return;
      if (!provider.lastTestStatus?.ok) {
        return;
      }
      activeProviderId.value = id;
      selectedProviderId.value = id;
      try {
        await persistSettings();
      } catch (error) {
        console.error("Failed to select active provider:", error);
      }
    }

    function handleAddMcpServer() {
      editingMcpServerId.value = null;
      mcpForm.id = "";
      mcpForm.name = "";
      mcpForm.url = "";
      mcpForm.enabled = true;
      showMcpForm.value = true;
    }

    function handleEditMcpServer(server: McpServerSetting) {
      editingMcpServerId.value = server.id;
      mcpForm.id = server.id;
      mcpForm.name = server.name;
      mcpForm.url = server.url;
      mcpForm.enabled = server.enabled;
      showMcpForm.value = true;
    }

    function handleRemoveMcpServer(id: string) {
      mcpServers.value = mcpServers.value.filter((s) => s.id !== id);
      persistSettings();
    }

    async function handleSaveMcpServer() {
      if (!mcpForm.name.trim() || !mcpForm.url.trim()) {
        return;
      }
      const record: McpServerSetting = {
        id:
          editingMcpServerId.value ||
          mcpForm.id ||
          (crypto.randomUUID ? crypto.randomUUID() : `mcp_${Date.now()}`),
        name: mcpForm.name.trim(),
        url: mcpForm.url.trim(),
        enabled: mcpForm.enabled,
        headers: {},
      };
      if (editingMcpServerId.value) {
        mcpServers.value = mcpServers.value.map((s) =>
          s.id === editingMcpServerId.value ? record : s,
        );
      } else {
        mcpServers.value = [...mcpServers.value, record];
      }
      showMcpForm.value = false;
      editingMcpServerId.value = null;
      await persistSettings();
    }

    function handleCancelMcpForm() {
      showMcpForm.value = false;
      editingMcpServerId.value = null;
    }

    onMounted(() => {
      setFormFromSettings(store.settings);
    });

    watch(
      selectedProvider,
      (next) => {
        showCustomModel.value = next?.model === "custom";
      },
      { immediate: true },
    );

    return () => {
      const provider = selectedProvider.value;
      const statusState = (p: Partial<AIProviderSetting>) => {
        if (!p) return "idle";
        if (p.lastTestStatus?.ok === true) return "success";
        if (p.lastTestStatus?.ok === false && p.lastTestStatus?.message) {
          return "error";
        }
        return "idle";
      };
      const statusLabel = (p: Partial<AIProviderSetting>) => {
        const state = statusState(p);
        if (state === "success") return "已通过测试";
        if (state === "error") return p.lastTestStatus?.message || "测试失败";
        return "未测试";
      };
      const statusTone = (p: Partial<AIProviderSetting>) => {
        const state = statusState(p);
        if (state === "success") return "text-emerald-600";
        if (state === "error") return "text-rose-600";
        return "text-slate-500";
      };
      const statusDot = (p: Partial<AIProviderSetting>) => {
        const state = statusState(p);
        if (state === "success") return "bg-emerald-500";
        if (state === "error") return "bg-rose-500";
        return "bg-slate-400";
      };
      const cardAccent = (p: Partial<AIProviderSetting>) => {
        const state = statusState(p);
        if (state === "success") {
          return "border-emerald-200 hover:border-emerald-300 dark:border-emerald-500/40 dark:hover:border-emerald-400/60";
        }
        if (state === "error") {
          return "border-rose-200 hover:border-rose-300 dark:border-rose-500/40 dark:hover:border-rose-400/60";
        }
        return "border-slate-200 hover:border-indigo-300 dark:border-white/10 dark:hover:border-indigo-400/40";
      };

      return (
        <>
          <section class="settings__group">
            <div class="settings__group-header">
              <h3>AI Assistant 智能助理</h3>
              <label class="toggle">
                <input
                  type="checkbox"
                  checked={aiAssistantEnabled.value}
                  onChange={handleToggle}
                />
                <span>启用智能助理</span>
              </label>
            </div>

            <div class="settings__fields">
              <p class="settings__hint">
                为智能助理配置多个 Provider，只有通过测试的 Provider
                才能设为正在使用。
              </p>
              <div class="grid gap-4 md:grid-cols-3">
                <div class="space-y-2">
                  <div class="flex items-center justify-between">
                    <span class="text-sm font-medium text-slate-700 dark:text-slate-200">
                      Provider 列表
                    </span>
                    <button
                      type="button"
                      class="btn-small btn-primary text-white"
                      onClick={addProvider}
                    >
                      添加
                    </button>
                  </div>
                  <div class="space-y-2">
                    {providers.value.length === 0 ? (
                      <p class="text-xs text-slate-500">
                        暂无 Provider，点击添加
                      </p>
                    ) : (
                      providers.value.map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          class={[
                            "w-full rounded-xl border px-3 py-2 text-left text-sm transition",
                            item.id === selectedProviderId.value
                              ? "border-indigo-400 bg-indigo-50 dark:border-indigo-400/60 dark:bg-indigo-500/10"
                              : cardAccent(item),
                          ].join(" ")}
                          onClick={() => (selectedProviderId.value = item.id)}
                        >
                          <div class="flex items-center justify-between gap-2">
                            <div class="flex min-w-0 items-center gap-2">
                              <span
                                class={`inline-block h-2 w-2 shrink-0 rounded-full ${statusDot(item)}`}
                                aria-hidden="true"
                              ></span>
                              <div class="min-w-0">
                                <div class="truncate font-semibold">
                                  {item.name || "未命名"}
                                </div>
                                <div class={`text-xs ${statusTone(item)}`}>
                                  {statusLabel(item)}
                                </div>
                              </div>
                            </div>
                            {activeProviderId.value === item.id ? (
                              <span class="rounded-full bg-indigo-100 px-2 py-1 text-[11px] font-semibold text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-100">
                                正在使用
                              </span>
                            ) : null}
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                </div>

                <div class="md:col-span-2 space-y-3 rounded-2xl border border-slate-200 p-4 shadow-sm dark:border-white/10">
                  {provider ? (
                    <>
                      <div class="grid gap-3 md:grid-cols-2">
                        <label class="field">
                          <span>名称</span>
                          <input
                            type="text"
                            value={provider.name}
                            onInput={(e) =>
                              updateProviderField(
                                "name",
                                (e.target as HTMLInputElement).value,
                              )
                            }
                          />
                        </label>
                        <label class="field">
                          <span>模型</span>
                          <select
                            value={provider.model}
                            onChange={(e) =>
                              updateProviderField(
                                "model",
                                (e.target as HTMLSelectElement).value,
                              )
                            }
                          >
                            {aiModels.map((model) => (
                              <option value={model.value}>{model.label}</option>
                            ))}
                          </select>
                        </label>
                      </div>

                      {showCustomModel.value && (
                        <label class="field">
                          <span>自定义模型名称</span>
                          <input
                            type="text"
                            value={provider.customModel}
                            onInput={(e) =>
                              updateProviderField(
                                "customModel",
                                (e.target as HTMLInputElement).value,
                              )
                            }
                          />
                        </label>
                      )}

                      <label class="field">
                        <span>API 地址</span>
                        <input
                          type="url"
                          value={provider.apiEndpoint}
                          placeholder="https://api.openai.com/v1/chat/completions"
                          onInput={(e) =>
                            updateProviderField(
                              "apiEndpoint",
                              (e.target as HTMLInputElement).value,
                            )
                          }
                        />
                      </label>

                      <label class="field">
                        <span>API 密钥</span>
                        <div class="relative">
                          <input
                            type={showApiKey.value ? "text" : "password"}
                            value={provider.apiKey}
                            placeholder="sk-..."
                            onInput={(e) =>
                              updateProviderField(
                                "apiKey",
                                (e.target as HTMLInputElement).value,
                              )
                            }
                            style="padding-right: 40px;"
                          />
                          <button
                            type="button"
                            class="absolute right-2 top-1/2 -translate-y-1/2 text-sm text-slate-500"
                            onClick={() =>
                              (showApiKey.value = !showApiKey.value)
                            }
                          >
                            {showApiKey.value ? "隐藏" : "显示"}
                          </button>
                        </div>
                      </label>

                      <div class="grid gap-3 md:grid-cols-2">
                        <label class="field">
                          <span>Context 大小</span>
                          <select
                            value={provider.contextSize}
                            onChange={(e) =>
                              updateProviderField(
                                "contextSize",
                                (e.target as HTMLSelectElement).value,
                              )
                            }
                          >
                            {contextSizes.map((size) => (
                              <option value={size.value}>{size.label}</option>
                            ))}
                          </select>
                        </label>
                        <label class="field">
                          <span>最大 tokens (自动根据 context 估算)</span>
                          <input
                            type="number"
                            value={provider.maxTokens}
                            onInput={(e) =>
                              updateProviderField(
                                "maxTokens",
                                Number((e.target as HTMLInputElement).value),
                              )
                            }
                          />
                        </label>
                      </div>

                      <label class="field">
                        <span>自定义 Headers</span>
                        <textarea
                          rows="3"
                          value={provider.requestHeaders}
                          placeholder={"X-Api-Key: xxx\napi-key: yyy"}
                          onInput={(e) =>
                            updateProviderField(
                              "requestHeaders",
                              (e.target as HTMLTextAreaElement).value,
                            )
                          }
                        ></textarea>
                        <small class="help-text">
                          每行一个 Header，格式为 <code>Header-Name: 值</code>
                        </small>
                      </label>

                      <div class="flex flex-wrap items-center gap-3">
                        <button
                          type="button"
                          class="btn btn-primary"
                          onClick={handleSaveProvider}
                        >
                          保存设置
                        </button>
                        <button
                          type="button"
                          class="btn"
                          onClick={handleTestProvider}
                          disabled={isTestingId.value === provider.id}
                        >
                          {isTestingId.value === provider.id
                            ? "测试中..."
                            : "测试连接"}
                        </button>
                        <button
                          type="button"
                          class="btn btn-secondary"
                          disabled={!provider.lastTestStatus?.ok}
                          onClick={() => handleSelectActive(provider.id)}
                        >
                          设为正在使用
                        </button>
                        <button
                          type="button"
                          class="btn btn-danger"
                          onClick={() => removeProvider(provider.id)}
                        >
                          删除 Provider
                        </button>
                        <span class="text-sm text-slate-600 dark:text-slate-300">
                          当前状态：{statusLabel(provider)}{" "}
                          {provider.lastTestStatus?.message
                            ? `(${provider.lastTestStatus.message})`
                            : ""}
                        </span>
                      </div>

                      {testMessage.value && (
                        <p class="status-line">{testMessage.value}</p>
                      )}
                    </>
                  ) : (
                    <p class="text-sm text-slate-500">
                      请选择或添加一个 Provider
                    </p>
                  )}
                </div>
              </div>
            </div>
          </section>

          <section class="settings__group">
            <div class="settings__group-header">
              <h3>MCP 服务器</h3>
              <p class="settings__subtitle">
                与 Provider 独立配置，可供工具调用
              </p>
            </div>
            <div class="settings__fields">
              {mcpServers.value.length === 0 ? (
                <p class="text-sm text-slate-500">未配置 MCP 服务器</p>
              ) : (
                mcpServers.value.map((server) => (
                  <div class="flex items-start justify-between rounded-2xl border border-slate-200 bg-white p-3 dark:border-white/10 dark:bg-slate-900/60">
                    <div class="min-w-0">
                      <div class="font-semibold">{server.name}</div>
                      <div class="text-xs text-slate-500">{server.url}</div>
                      <div class="mt-1 text-[11px] text-slate-500 flex items-center gap-2">
                        <span
                          class={[
                            "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold",
                            server.enabled
                              ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-100"
                              : "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-200",
                          ].join(" ")}
                        >
                          {server.enabled ? "已启用" : "已禁用"}
                        </span>
                      </div>
                    </div>
                    <div class="flex items-center gap-2">
                      <button
                        type="button"
                        class="btn btn-small"
                        onClick={() => handleEditMcpServer(server)}
                      >
                        编辑
                      </button>
                      <button
                        type="button"
                        class="btn btn-small"
                        onClick={() => handleRemoveMcpServer(server.id)}
                      >
                        删除
                      </button>
                    </div>
                  </div>
                ))
              )}

              {showMcpForm.value && (
                <div class="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm dark:border-white/10 dark:bg-slate-900/60">
                  <h4 class="text-sm font-semibold">
                    {editingMcpServerId.value
                      ? "编辑 MCP 服务器"
                      : "添加 MCP 服务器"}
                  </h4>
                  <div class="mt-2 grid gap-3 md:grid-cols-2">
                    <label class="field">
                      <span>服务器名称</span>
                      <input
                        type="text"
                        value={mcpForm.name}
                        onInput={(e) =>
                          (mcpForm.name = (e.target as HTMLInputElement).value)
                        }
                      />
                    </label>
                    <label class="field">
                      <span>服务器 URL</span>
                      <input
                        type="url"
                        value={mcpForm.url}
                        onInput={(e) =>
                          (mcpForm.url = (e.target as HTMLInputElement).value)
                        }
                      />
                    </label>
                  </div>
                  <label class="mt-2 inline-flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
                    <input
                      type="checkbox"
                      checked={mcpForm.enabled}
                      onChange={(e) =>
                        (mcpForm.enabled = (
                          e.target as HTMLInputElement
                        ).checked)
                      }
                    />
                    <span>启用此服务器</span>
                  </label>
                  <div class="mt-3 flex justify-end gap-2">
                    <button
                      type="button"
                      class="btn btn-secondary"
                      onClick={handleCancelMcpForm}
                    >
                      取消
                    </button>
                    <button
                      type="button"
                      class="btn btn-primary"
                      onClick={handleSaveMcpServer}
                    >
                      {editingMcpServerId.value ? "保存" : "添加"}
                    </button>
                  </div>
                </div>
              )}

              <button
                type="button"
                class="btn btn-small"
                onClick={handleAddMcpServer}
              >
                添加 MCP 服务器
              </button>
              <p class="help-text">
                MCP 服务器用于智能助理调用外部工具，与 AI Provider 配置独立。
              </p>
            </div>
          </section>
        </>
      );
    };
  },
});
