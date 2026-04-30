import { defineComponent, computed, ref, watch } from "vue";
import type { PropType } from "vue";
import ToggleSwitch from "./ToggleSwitch";
import AiHeadersEditor from "./AiHeadersEditor";
import AiModelListEditor from "./AiModelListEditor";
import {
  formatTierLabel,
  getOpenAICompatibleProfileMeta,
  getProviderTypeMeta,
  OPENAI_COMPATIBLE_PROFILE_OPTIONS,
  PROVIDER_TYPE_OPTIONS,
} from "./providerCatalog";
import type {
  AIModelSetting,
  AIProviderSetting,
} from "./types";

function normalizeUrl(value: string) {
  return value.trim().replace(/\/+$/, "");
}

export default defineComponent({
  name: "AiProviderEditor",
  props: {
    provider: { type: Object as PropType<AIProviderSetting>, required: true },
    catalog: { type: Array as PropType<string[]>, default: () => [] },
    isFetchingModels: { type: Boolean, default: false },
    isTesting: { type: Boolean, default: false },
    statusMessage: { type: String, default: "" },
    onChange: {
      type: Function as PropType<(next: AIProviderSetting) => void>,
      required: true,
    },
    onFetchModels: { type: Function as PropType<() => void>, required: true },
    onTestConnection: {
      type: Function as PropType<(model: AIModelSetting) => void>,
      required: true,
    },
  },
  setup(props) {
    const showApiKey = ref(false);
    const testModelId = ref("");

    const availableModels = computed(() =>
      (props.provider.models || []).filter((m) => m.model && m.model.trim()),
    );

    watch(
      () => props.provider.id,
      () => {
        testModelId.value = "";
      },
    );

    watch(
      () => props.provider.models,
      () => {
        const current = availableModels.value.find(
          (m) => m.id === testModelId.value,
        );
        if (current) return;
        testModelId.value = availableModels.value[0]?.id || "";
      },
      { deep: true, immediate: true },
    );

    const selectedCompatProfileMeta = computed(() =>
      getOpenAICompatibleProfileMeta(props.provider.compatProfile || "auto"),
    );
    const selectedProviderMeta = computed(() =>
      getProviderTypeMeta(props.provider.type),
    );
    const reasoningModeSupported = computed(() => {
      if (props.provider.type === "mistral") return true;
      if (props.provider.type !== "openai_compatible") return false;
      return selectedCompatProfileMeta.value.supportsReasoningMode;
    });
    const reasoningEffortSupported = computed(() => {
      if (props.provider.type === "mistral") return true;
      if (props.provider.type !== "openai_compatible") return false;
      return selectedCompatProfileMeta.value.supportsReasoningEffort;
    });
    const reasoningBudgetSupported = computed(() => {
      if (props.provider.type !== "openai_compatible") return false;
      return selectedCompatProfileMeta.value.supportsReasoningBudget;
    });
    const reasoningPanelTone = computed(() => {
      if (props.provider.type === "mistral") {
        return "border-sky-200 bg-sky-50 dark:border-sky-400/30 dark:bg-sky-500/10";
      }
      if (selectedCompatProfileMeta.value.tier === "tier_1") {
        return "border-emerald-200 bg-emerald-50 dark:border-emerald-400/30 dark:bg-emerald-500/10";
      }
      return "border-amber-200 bg-amber-50 dark:border-amber-400/30 dark:bg-amber-500/10";
    });
    const reasoningSummary = computed(() => {
      if (props.provider.type === "mistral") {
        return "Tier 0 官方 SDK 路线。当前 UI 仅暴露稳定可解释的 reasoning 控件。";
      }
      if (selectedCompatProfileMeta.value.supportLevel === "profile") {
        return "该 profile 属于优先支持路径，reasoning 与续轮行为会按供应商契约显式适配。";
      }
      return "该 profile 仅提供基础兼容。未在官方文档明确的 reasoning 特性不会被假定支持。";
    });
    const reasoningEffortOptions = computed(() => {
      if (props.provider.type === "mistral") {
        return [
          { value: "provider_default", label: "跟随默认" },
          { value: "high", label: "High" },
        ];
      }
      return [
        { value: "provider_default", label: "跟随默认" },
        { value: "low", label: "Low" },
        { value: "medium", label: "Medium" },
        { value: "high", label: "High" },
      ];
    });

    const canEnable = computed(() => {
      if (!props.provider.lastTest?.ok) return false;
      const models = props.provider.models || [];
      const enabledModels = models.filter((m) => m.enabled);
      if (!enabledModels.length) return false;
      const testedModel = String(props.provider.lastTest?.model || "").trim();
      if (!testedModel) return false;
      return enabledModels.some(
        (model) => String(model.model || "").trim() === testedModel,
      );
    });

    watch(
      () => canEnable.value,
      (enabled) => {
        if (!enabled && props.provider.enabled) {
          updateProvider({ enabled: false });
        }
      },
    );

    const selectedTestModel = computed(
      () =>
        availableModels.value.find((m) => m.id === testModelId.value) || null,
    );

    const updateProvider = (patch: Partial<AIProviderSetting>) => {
      props.onChange({ ...props.provider, ...patch });
    };

    const updateModels = (models: AIModelSetting[]) => {
      props.onChange({ ...props.provider, models });
    };

    const renderTestHint = () => {
      if (!props.provider.lastTest) {
        return <p class="text-xs text-slate-500">未测试，无法启用</p>;
      }
      if (props.provider.lastTest.ok && !canEnable.value) {
        return (
          <p class="text-xs text-amber-600">
            已测试通过，请启用对应模型后再启用 Provider
          </p>
        );
      }
      return (
        <p
          class={[
            "text-xs",
            props.provider.lastTest.ok ? "text-emerald-600" : "text-rose-600",
          ].join(" ")}
        >
          {props.provider.lastTest.ok ? "测试通过" : "测试失败"} ·{" "}
          {props.provider.lastTest.model} · {props.provider.lastTest.message}
        </p>
      );
    };

    const onChangeType = (nextType: AIProviderSetting["type"]) => {
      const currentMeta = getProviderTypeMeta(props.provider.type);
      const nextMeta = getProviderTypeMeta(nextType);
      const shouldRename =
        !props.provider.name || props.provider.name === currentMeta.defaultName;
      const shouldResetBaseUrl =
        !props.provider.baseUrl ||
        props.provider.baseUrl === currentMeta.defaultBaseUrl;
      updateProvider({
        type: nextType,
        name: shouldRename ? nextMeta.defaultName : props.provider.name,
        baseUrl: shouldResetBaseUrl
          ? nextMeta.defaultBaseUrl
          : props.provider.baseUrl,
        compatProfile: nextType === "openai_compatible" ? "auto" : "auto",
        reasoningMode:
          nextType === "openai_compatible" || nextType === "mistral"
            ? props.provider.reasoningMode || "provider_default"
            : "provider_default",
        reasoningEffort:
          nextType === "openai_compatible" || nextType === "mistral"
            ? props.provider.reasoningEffort || "provider_default"
            : "provider_default",
        reasoningBudget:
          nextType === "openai_compatible"
            ? props.provider.reasoningBudget
            : undefined,
        enabled: false,
        lastTest: null,
      });
    };

    const canTest = computed(() => {
      const meta = getProviderTypeMeta(props.provider.type);
      if (!props.provider.baseUrl) return false;
      if (meta.requiresApiKey && !props.provider.apiKey) return false;
      return true;
    });

    return () => (
      <div class="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-slate-900/60">
        <div class="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div class="min-w-0">
            <div class="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
              {props.provider.name || "未命名 Provider"}
            </div>
            <div class="mt-1 flex flex-wrap items-center gap-2 text-xs">
              <span class="rounded-full bg-slate-100 px-2 py-0.5 text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                {formatTierLabel(selectedProviderMeta.value.tier)}
              </span>
              <span class="rounded-full bg-slate-100 px-2 py-0.5 text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                {selectedProviderMeta.value.label}
              </span>
              {props.provider.type === "openai_compatible" ? (
                <span
                  class={[
                    "rounded-full px-2 py-0.5",
                    selectedCompatProfileMeta.value.tier === "tier_1"
                      ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-200"
                      : "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-200",
                  ].join(" ")}
                >
                  {selectedCompatProfileMeta.value.label}
                </span>
              ) : null}
            </div>
            <div class="mt-1 truncate text-xs text-slate-500 dark:text-slate-400">
              {props.provider.baseUrl || "未配置 Base URL"}
            </div>
          </div>
          <div class="flex items-center gap-3">
            <span class="text-sm text-slate-700 dark:text-slate-200">
              启用 Provider
            </span>
            <ToggleSwitch
              checked={props.provider.enabled}
              disabled={!canEnable.value}
              ariaLabel="启用 Provider"
              onChange={(e) =>
                updateProvider({
                  enabled: (e.target as HTMLInputElement).checked,
                })
              }
            />
          </div>
        </div>

        <label class="field">
          <span>Provider 类型</span>
          <select
            class="input"
            value={props.provider.type}
            onChange={(e) =>
              onChangeType(
                (e.target as HTMLSelectElement).value as AIProviderSetting["type"],
              )
            }
          >
            {PROVIDER_TYPE_OPTIONS.map((item) => (
              <option value={item.type}>{item.label}</option>
            ))}
          </select>
        </label>

        <div class="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600 dark:border-white/10 dark:bg-slate-800/40 dark:text-slate-300">
          {selectedProviderMeta.value.routeNote}
        </div>

        {props.provider.type === "openai_compatible" ? (
          <label class="field">
            <span>Compatibility Profile</span>
            <select
              class="input"
              value={props.provider.compatProfile || "auto"}
              onChange={(e) =>
                updateProvider({
                  compatProfile: (e.target as HTMLSelectElement)
                    .value as AIProviderSetting["compatProfile"],
                })
              }
            >
              {OPENAI_COMPATIBLE_PROFILE_OPTIONS.map((item) => (
                <option value={item.value}>
                  {item.label} · {item.tier === "tier_1" ? "Tier 1" : "Tier 2"}
                </option>
              ))}
            </select>
            <p class="text-xs text-slate-500 dark:text-slate-400">
              {selectedCompatProfileMeta.value.note}
            </p>
          </label>
        ) : null}

        <label class="field">
          <span>Base URL</span>
          <input
            type="url"
            value={props.provider.baseUrl}
            placeholder={
              getProviderTypeMeta(props.provider.type).baseUrlPlaceholder
            }
            onInput={(e) =>
              updateProvider({
                baseUrl: (e.target as HTMLInputElement).value,
              })
            }
            onBlur={() =>
              updateProvider({ baseUrl: normalizeUrl(props.provider.baseUrl) })
            }
          />
        </label>

        <label class="field">
          <span>API Key</span>
          <div class="relative">
            <input
              type={showApiKey.value ? "text" : "password"}
              value={props.provider.apiKey}
              placeholder="sk-..."
              onInput={(e) =>
                updateProvider({ apiKey: (e.target as HTMLInputElement).value })
              }
              style="padding-right: 40px;"
            />
            <button
              type="button"
              class="absolute right-2 top-1/2 -translate-y-1/2 text-sm text-slate-500"
              onClick={() => (showApiKey.value = !showApiKey.value)}
            >
              {showApiKey.value ? "隐藏" : "显示"}
            </button>
          </div>
        </label>

        <AiHeadersEditor
          value={props.provider.headers}
          onChange={(headers) => updateProvider({ headers })}
        />

        {props.provider.type === "openai_compatible" ||
        props.provider.type === "mistral" ? (
          <div
            class={[
              "space-y-3 rounded-xl border p-3",
              reasoningPanelTone.value,
            ].join(" ")}
          >
            <div class="text-xs font-semibold text-slate-600 dark:text-slate-300">
              Reasoning
            </div>

            {reasoningModeSupported.value ? (
              <label class="field">
                <span>Reasoning Mode</span>
                <select
                  class="input"
                  value={props.provider.reasoningMode || "provider_default"}
                  onChange={(e) =>
                    updateProvider({
                      reasoningMode: (e.target as HTMLSelectElement)
                        .value as AIProviderSetting["reasoningMode"],
                    })
                  }
                >
                  <option value="provider_default">跟随 Provider / 模型默认</option>
                  <option value="enabled">显式开启</option>
                  <option value="disabled">显式关闭</option>
                </select>
              </label>
            ) : (
              <div class="rounded-lg bg-white/70 px-3 py-2 text-xs text-slate-600 dark:bg-slate-900/30 dark:text-slate-300">
                当前 profile 不提供统一的 reasoning 开关。请按供应商模型能力或模型名称选择 chat / thinking 变体。
              </div>
            )}

            {reasoningEffortSupported.value ? (
              <label class="field">
                <span>Reasoning Effort</span>
                <select
                  class="input"
                  value={props.provider.reasoningEffort || "provider_default"}
                  disabled={
                    props.provider.type === "mistral" &&
                    props.provider.reasoningMode === "disabled"
                  }
                  onChange={(e) =>
                    updateProvider({
                      reasoningEffort: (e.target as HTMLSelectElement)
                        .value as AIProviderSetting["reasoningEffort"],
                    })
                  }
                >
                  {reasoningEffortOptions.value.map((option) => (
                    <option value={option.value}>{option.label}</option>
                  ))}
                </select>
                {props.provider.type === "mistral" ? (
                  <p class="text-xs text-slate-500 dark:text-slate-400">
                    Mistral 当前仅建议暴露稳定的 effort 选项；关闭 reasoning 时该项不生效。
                  </p>
                ) : null}
              </label>
            ) : null}

            {reasoningBudgetSupported.value ? (
              <label class="field">
                <span>Reasoning Budget</span>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={
                    typeof props.provider.reasoningBudget === "number"
                      ? String(props.provider.reasoningBudget)
                      : ""
                  }
                  placeholder="例如 1024"
                  onInput={(e) => {
                    const value = (e.target as HTMLInputElement).value.trim();
                    updateProvider({
                      reasoningBudget: value ? Number(value) : undefined,
                    });
                  }}
                />
              </label>
            ) : null}

            <p class="text-xs text-slate-600 dark:text-slate-300">
              {reasoningSummary.value}
            </p>
            <p class="text-xs text-slate-500 dark:text-slate-400">
              {props.provider.type === "mistral"
                ? "官方 Mistral provider 和 openai-compatible 供应商是两条不同接入路径，不应混用。"
                : selectedCompatProfileMeta.value.note}
            </p>
          </div>
        ) : null}

        <div class="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-white/10 dark:bg-slate-800/40">
          <div class="text-xs font-semibold text-slate-600 dark:text-slate-300">
            Streaming
          </div>
          <div class="flex items-center justify-between text-sm text-slate-700 dark:text-slate-200">
            <span>启用 Streaming</span>
            <ToggleSwitch
              checked={props.provider.streamingEnabled !== false}
              ariaLabel="启用 Streaming"
              onChange={(e) =>
                updateProvider({
                  streamingEnabled: (e.target as HTMLInputElement).checked,
                })
              }
            />
          </div>
          <p class="text-xs text-slate-500 dark:text-slate-400">
            关闭后将使用非流式请求；默认启用。
          </p>
        </div>

        <AiModelListEditor
          models={props.provider.models}
          catalog={props.catalog}
          isRefreshingCatalog={props.isFetchingModels}
          catalogStatusMessage={props.statusMessage}
          onRefreshCatalog={props.onFetchModels}
          onChange={updateModels}
        />

        <div class="space-y-2">
          <div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div class="flex min-w-0 items-center gap-2">
              <select
                class="input w-full sm:w-auto"
                value={testModelId.value}
                onChange={(e) =>
                  (testModelId.value = (e.target as HTMLSelectElement).value)
                }
              >
                <option value="">选择测试模型…</option>
                {availableModels.value.map((m) => (
                  <option value={m.id}>
                    {m.model}
                    {m.enabled ? "" : "（未启用）"}
                  </option>
                ))}
              </select>
              <button
                type="button"
                class="btn btn-small btn-primary whitespace-nowrap text-white"
                disabled={
                  props.isTesting || !selectedTestModel.value || !canTest.value
                }
                onClick={() => {
                  if (selectedTestModel.value) {
                    props.onTestConnection(selectedTestModel.value);
                  }
                }}
              >
                {props.isTesting ? "测试中…" : "测试连接"}
              </button>
            </div>
          </div>
          {renderTestHint()}
        </div>
      </div>
    );
  },
});
