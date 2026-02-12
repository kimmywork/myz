import { defineComponent, computed, ref, watch } from "vue"
import type { PropType } from "vue"
import type { AIModelSetting, AIProviderSetting } from "@/background/settings.js"
import AiHeadersEditor from "./AiHeadersEditor.jsx"
import AiModelListEditor from "./AiModelListEditor.jsx"
import { getProviderTypeMeta, PROVIDER_TYPE_OPTIONS } from "./providerCatalog.js"
import ToggleSwitch from "../ToggleSwitch.jsx"

function normalizeUrl(value: string) {
  return value.trim().replace(/\/+$/, "")
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
    const showApiKey = ref(false)
    const testModelId = ref("")

    const availableModels = computed(() =>
      (props.provider.models || []).filter((m) => m.model && m.model.trim()),
    )

    watch(
      () => props.provider.id,
      () => {
        testModelId.value = ""
      },
    )

    watch(
      () => props.provider.models,
      () => {
        const current = availableModels.value.find((m) => m.id === testModelId.value)
        if (current) return
        testModelId.value = availableModels.value[0]?.id || ""
      },
      { deep: true, immediate: true },
    )

    const canEnable = computed(() => Boolean(props.provider.lastTest?.ok))

    const selectedTestModel = computed(
      () => availableModels.value.find((m) => m.id === testModelId.value) || null,
    )

    const updateProvider = (patch: Partial<AIProviderSetting>) => {
      props.onChange({ ...props.provider, ...patch })
    }

    const updateModels = (models: AIModelSetting[]) => {
      props.onChange({ ...props.provider, models })
    }

    const renderTestHint = () => {
      if (!props.provider.lastTest) {
        return <p class="text-xs text-slate-500">未测试，无法启用</p>
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
      )
    }

    const onChangeType = (nextType: AIProviderSetting["type"]) => {
      const currentMeta = getProviderTypeMeta(props.provider.type)
      const nextMeta = getProviderTypeMeta(nextType)
      const shouldRename =
        !props.provider.name || props.provider.name === currentMeta.defaultName
      const shouldResetBaseUrl =
        !props.provider.baseUrl ||
        props.provider.baseUrl === currentMeta.defaultBaseUrl
      updateProvider({
        type: nextType,
        name: shouldRename ? nextMeta.defaultName : props.provider.name,
        baseUrl: shouldResetBaseUrl ? nextMeta.defaultBaseUrl : props.provider.baseUrl,
        enabled: false,
        lastTest: null,
      })
    }

    const canTest = computed(() => {
      const meta = getProviderTypeMeta(props.provider.type)
      if (!props.provider.baseUrl) return false
      if (meta.requiresApiKey && !props.provider.apiKey) return false
      return true
    })

    return () => (
      <div class="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-slate-900/60">
        <div class="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div class="min-w-0">
            <div class="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
              {props.provider.name || "未命名 Provider"}
            </div>
            <div class="truncate text-xs text-slate-500 dark:text-slate-400">
              {props.provider.baseUrl || "未配置 Base URL"}
            </div>
          </div>
          <div class="flex items-center gap-3">
            <span class="text-sm text-slate-700 dark:text-slate-200">启用 Provider</span>
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
            onChange={(e) => onChangeType((e.target as HTMLSelectElement).value as any)}
          >
            {PROVIDER_TYPE_OPTIONS.map((item) => (
              <option value={item.type}>{item.label}</option>
            ))}
          </select>
        </label>

        <label class="field">
          <span>Base URL</span>
          <input
            type="url"
            value={props.provider.baseUrl}
            placeholder={getProviderTypeMeta(props.provider.type).baseUrlPlaceholder}
            onInput={(e) =>
              updateProvider({
                baseUrl: (e.target as HTMLInputElement).value,
              })
            }
            onBlur={() => updateProvider({ baseUrl: normalizeUrl(props.provider.baseUrl) })}
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
                onChange={(e) => (testModelId.value = (e.target as HTMLSelectElement).value)}
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
                  props.isTesting ||
                  !selectedTestModel.value ||
                  !canTest.value
                }
                onClick={() => {
                  if (selectedTestModel.value) {
                    props.onTestConnection(selectedTestModel.value)
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
    )
  },
})
