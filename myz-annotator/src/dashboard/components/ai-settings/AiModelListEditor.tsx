import { computed, defineComponent, ref, watch } from "vue"
import type { PropType } from "vue"
import type { AIModelSetting } from "@/background/settings.js"
import { createModelSetting } from "./factories.js"
import ToggleSwitch from "../ToggleSwitch.jsx"

function clampNumber(value: any, min: number, max: number, fallback: number) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.max(min, Math.min(max, parsed))
}

export default defineComponent({
  name: "AiModelListEditor",
  props: {
    models: { type: Array as PropType<AIModelSetting[]>, required: true },
    catalog: { type: Array as PropType<string[]>, default: () => [] },
    isRefreshingCatalog: { type: Boolean, default: false },
    catalogStatusMessage: { type: String, default: "" },
    onRefreshCatalog: { type: Function as PropType<() => void>, default: null },
    onChange: { type: Function as PropType<(models: AIModelSetting[]) => void>, required: true },
  },
  setup(props) {
    const manualModel = ref("")
    const listFilter = ref("")
    const selectedName = ref("")
    const pendingSelection = ref("")

    const modelByName = computed(() => {
      const map = new Map<string, AIModelSetting>()
      props.models.forEach((model) => {
        const key = (model.model || "").trim()
        if (!key) return
        map.set(key, model)
      })
      return map
    })

    const ensureUniqueModelName = (candidate: string, existing: AIModelSetting[]) => {
      const normalized = candidate.trim()
      if (!normalized) return ""
      const taken = new Set(existing.map((m) => m.model))
      if (!taken.has(normalized)) return normalized
      return ""
    }

    const addModel = (modelName: string) => {
      const name = ensureUniqueModelName(modelName, props.models)
      if (!name) return
      props.onChange([...props.models, createModelSetting(name)])
      selectedName.value = name
    }

    const removeModel = (id: string) => {
      props.onChange(props.models.filter((m) => m.id !== id))
    }

    const updateModel = (id: string, patch: Partial<AIModelSetting>) => {
      props.onChange(
        props.models.map((m) => (m.id === id ? ({ ...m, ...patch } as any) : m)),
      )
    }

    const updateCapabilities = (id: string, patch: any) => {
      props.onChange(
        props.models.map((m) =>
          m.id === id ? { ...m, capabilities: { ...m.capabilities, ...patch } } : m,
        ),
      )
    }

    const updateLimits = (id: string, patch: any) => {
      props.onChange(
        props.models.map((m) =>
          m.id === id ? { ...m, limits: { ...m.limits, ...patch } } : m,
        ),
      )
    }

    const normalizeTooling = (tooling: any) => {
      const toolChoice = tooling?.toolChoice || {}
      const mode = typeof toolChoice?.mode === "string" ? toolChoice.mode : "auto"
      return {
        toolChoice: {
          mode,
          toolName: typeof toolChoice?.toolName === "string" ? toolChoice.toolName : "",
        },
        strict:
          tooling?.strict === "on" || tooling?.strict === "off" || tooling?.strict === "auto"
            ? tooling.strict
            : "auto",
        parallelToolCalls:
          tooling?.parallelToolCalls === "on" ||
          tooling?.parallelToolCalls === "off" ||
          tooling?.parallelToolCalls === "auto"
            ? tooling.parallelToolCalls
            : "auto",
      }
    }

    const updateToolChoice = (id: string, patch: any) => {
      props.onChange(
        props.models.map((m) => {
          if (m.id !== id) return m
          const tooling = normalizeTooling(m.tooling)
          return {
            ...m,
            tooling: {
              ...tooling,
              toolChoice: {
                ...tooling.toolChoice,
                ...patch,
              },
            },
          }
        }),
      )
    }

    const updateTooling = (id: string, patch: any) => {
      props.onChange(
        props.models.map((m) => {
          if (m.id !== id) return m
          const tooling = normalizeTooling(m.tooling)
          return {
            ...m,
            tooling: {
              ...tooling,
              ...patch,
            },
          }
        }),
      )
    }

    const catalogNames = computed(() => {
      const raw = Array.isArray(props.catalog) ? props.catalog : []
      return raw
        .filter((id) => typeof id === "string" && id.trim().length > 0)
        .map((id) => id.trim())
    })

    const mergedNames = computed(() => {
      const set = new Set<string>()
      catalogNames.value.forEach((name) => set.add(name))
      props.models.forEach((model) => {
        const name = (model.model || "").trim()
        if (name) set.add(name)
      })

      const query = listFilter.value.trim().toLowerCase()
      const items = [...set]
        .filter((name) => (query ? name.toLowerCase().includes(query) : true))
        .map((name) => {
          const existing = modelByName.value.get(name) || null
          return {
            name,
            exists: Boolean(existing),
            enabled: Boolean(existing?.enabled),
            fromCatalog: catalogNames.value.includes(name),
          }
        })
        .sort((a, b) => {
          if (a.enabled !== b.enabled) return a.enabled ? -1 : 1
          if (a.exists !== b.exists) return a.exists ? -1 : 1
          return a.name.localeCompare(b.name)
        })
      return items
    })

    const selectedModel = computed(() => {
      const name = selectedName.value.trim()
      if (!name) return null
      return modelByName.value.get(name) || null
    })

    watch(
      () => mergedNames.value,
      (items) => {
        if (pendingSelection.value) {
          const next = pendingSelection.value
          pendingSelection.value = ""
          if (items.some((item) => item.name === next)) {
            selectedName.value = next
            return
          }
        }
        if (selectedName.value && items.some((item) => item.name === selectedName.value)) {
          return
        }
        selectedName.value = items[0]?.name || ""
      },
      { immediate: true },
    )

    const ensureModelConfig = (name: string, enabled?: boolean) => {
      const trimmed = (name || "").trim()
      if (!trimmed) return null
      const existing = modelByName.value.get(trimmed)
      if (existing) {
        if (typeof enabled === "boolean" && existing.enabled !== enabled) {
          updateModel(existing.id, { enabled })
        }
        return existing
      }
      const created = createModelSetting(trimmed)
      if (typeof enabled === "boolean") {
        created.enabled = enabled
      } else {
        created.enabled = false
      }
      props.onChange([...props.models, created])
      return created
    }

    return () => (
      <div class="space-y-3">
        <div class="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <div class="flex items-center gap-2">
              <div class="text-sm font-semibold text-slate-900 dark:text-slate-100">
                模型列表
              </div>
              {props.onRefreshCatalog && (
                <button
                  type="button"
                  class="btn btn-small px-2"
                  aria-label="刷新模型列表"
                  title="刷新 /models"
                  disabled={props.isRefreshingCatalog}
                  onClick={() => props.onRefreshCatalog?.()}
                >
                  <svg
                    class={[
                      "h-4 w-4",
                      props.isRefreshingCatalog ? "animate-spin" : "",
                    ].join(" ")}
                    viewBox="0 0 24 24"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                    aria-hidden="true"
                  >
                    <path
                      d="M20 12a8 8 0 1 1-2.343-5.657"
                      stroke="currentColor"
                      stroke-width="2"
                      stroke-linecap="round"
                    />
                    <path
                      d="M20 4v6h-6"
                      stroke="currentColor"
                      stroke-width="2"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                    />
                  </svg>
                </button>
              )}
            </div>
            {props.catalogStatusMessage ? (
              <div class="mt-1 text-xs text-slate-500 dark:text-slate-400">
                {props.catalogStatusMessage}
              </div>
            ) : null}
          </div>
          <div class="flex items-center gap-2">
            <input
              class="input"
              type="text"
              value={manualModel.value}
              placeholder="手动添加模型，例如 gpt-4o-mini"
              onInput={(e) => (manualModel.value = (e.target as HTMLInputElement).value)}
            />
            <button
              type="button"
              class="btn btn-small btn-primary whitespace-nowrap text-white"
              onClick={() => {
                addModel(manualModel.value)
                manualModel.value = ""
              }}
            >
              添加模型
            </button>
          </div>
        </div>

        <div class="flex flex-col gap-3 md:flex-row md:items-stretch">
          <div class="flex min-h-0 min-w-0 flex-1 flex-col overflow-auto rounded-2xl border border-slate-200 bg-white p-3 dark:border-white/10 dark:bg-slate-900/60">
            <div class="flex items-center justify-end gap-2">
              <div class="relative w-full">
                <span class="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-slate-400">
                  <svg
                    class="h-4 w-4"
                    viewBox="0 0 24 24"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                    aria-hidden="true"
                  >
                    <path
                      d="M11 19a8 8 0 1 1 0-16 8 8 0 0 1 0 16Z"
                      stroke="currentColor"
                      stroke-width="2"
                    />
                    <path
                      d="M21 21l-4.35-4.35"
                      stroke="currentColor"
                      stroke-width="2"
                      stroke-linecap="round"
                    />
                  </svg>
                </span>
                <input
                  class="input w-full pl-8"
                  type="text"
                  value={listFilter.value}
                  placeholder="筛选模型名称…"
                  onInput={(e) => (listFilter.value = (e.target as HTMLInputElement).value)}
                />
              </div>
            </div>
            <div class="mt-2 max-h-[45em] overflow-auto pr-1">
              <div class="space-y-1">
                {mergedNames.value.map((entry) => (
                  <button
                    type="button"
                    key={entry.name}
                    class={[
                      "flex w-full items-center justify-between gap-3 rounded-xl border px-3 py-2 text-left text-sm transition",
                      entry.name === selectedName.value
                        ? "border-indigo-400 bg-indigo-50 dark:border-indigo-400/60 dark:bg-indigo-500/10"
                        : "border-slate-200 hover:border-indigo-300 dark:border-white/10 dark:hover:border-indigo-400/40",
                    ].join(" ")}
                    onClick={() => {
                      selectedName.value = entry.name
                      ensureModelConfig(entry.name)
                    }}
                  >
                    <div class="min-w-0">
                      <div class="truncate font-medium text-slate-900 dark:text-slate-100">
                        {entry.name}
                      </div>
                      <div class="text-[11px] text-slate-500 dark:text-slate-400">
                        {entry.fromCatalog ? "/models" : "手动"}
                        {" · "}
                        {entry.exists ? "已配置" : "未配置"}
                      </div>
                    </div>
                    <div
                      class="shrink-0"
                      onClick={(e) => e.stopPropagation()}
                      onMousedown={(e) => e.stopPropagation()}
                    >
                      <ToggleSwitch
                        checked={entry.enabled}
                        ariaLabel={`启用模型 ${entry.name}`}
                        onChange={(e) => {
                          const nextEnabled = (e.target as HTMLInputElement).checked
                          if (!nextEnabled && entry.name === selectedName.value) {
                            const items = mergedNames.value
                            const index = items.findIndex((item) => item.name === entry.name)
                            const nextItem =
                              (index >= 0 ? items[index + 1] : null) ||
                              (index > 0 ? items[index - 1] : null)
                            if (nextItem) {
                              pendingSelection.value = nextItem.name
                              selectedName.value = nextItem.name
                            }
                          }
                          ensureModelConfig(entry.name, nextEnabled)
                        }}
                      />
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div class="flex-1 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-slate-900/60">
            {selectedModel.value ? (
              <div class="space-y-3">
                <div class="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                  <div class="min-w-0">
                    <div class="text-sm font-semibold text-slate-900 dark:text-slate-100">
                      {selectedModel.value.model}
                    </div>
                    <div class="text-xs text-slate-500 dark:text-slate-400">
                      点击左侧模型以切换；启用的模型会用于 Agent 选择。
                    </div>
                  </div>
                  <button
                    type="button"
                    class="btn btn-small whitespace-nowrap"
                    onClick={() => removeModel(selectedModel.value!.id)}
                  >
                    删除配置
                  </button>
                </div>

                <div class="space-y-3">
                  <div class="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-white/10 dark:bg-slate-800/40">
                    <div class="text-xs font-semibold text-slate-600 dark:text-slate-300">
                      能力
                    </div>
                    {[
                      ["vision", "支持 Vision"],
                      ["imageOutput", "支持图像输出"],
                      ["toolCalling", "支持 Tool Calling"],
                      ["reasoning", "支持 Reasoning"],
                    ].map(([key, label]) => (
                      <label class="flex items-center justify-between text-sm text-slate-700 dark:text-slate-200">
                        <span>{label}</span>
                        <input
                          type="checkbox"
                          checked={(selectedModel.value!.capabilities as any)[key]}
                          onChange={(e) =>
                            updateCapabilities(selectedModel.value!.id, {
                              [key]: (e.target as HTMLInputElement).checked,
                            })
                          }
                        />
                      </label>
                    ))}
                  </div>

                  <div class="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-white/10 dark:bg-slate-800/40">
                    <div class="text-xs font-semibold text-slate-600 dark:text-slate-300">
                      Token 配置
                    </div>
                    <label class="field">
                      <span>Context Window</span>
                      <input
                        type="number"
                        value={selectedModel.value!.limits.contextWindow}
                        onInput={(e) =>
                          updateLimits(selectedModel.value!.id, {
                            contextWindow: clampNumber(
                              (e.target as HTMLInputElement).value,
                              1024,
                              2000000,
                              selectedModel.value!.limits.contextWindow,
                            ),
                          })
                        }
                      />
                    </label>
                    <label class="field">
                      <span>Max Output Tokens</span>
                      <input
                        type="number"
                        value={selectedModel.value!.limits.maxOutputTokens}
                        onInput={(e) =>
                          updateLimits(selectedModel.value!.id, {
                            maxOutputTokens: clampNumber(
                              (e.target as HTMLInputElement).value,
                              1,
                              2000000,
                              selectedModel.value!.limits.maxOutputTokens,
                            ),
                          })
                        }
                      />
                    </label>
                    <label class="field">
                      <span>输出参数名</span>
                      <select
                        value={selectedModel.value!.limits.maxOutputTokenParam}
                        onChange={(e) =>
                          updateLimits(selectedModel.value!.id, {
                            maxOutputTokenParam: (e.target as HTMLSelectElement).value,
                          })
                        }
                      >
                        <option value="max_tokens">max_tokens</option>
                        <option value="max_completion_tokens">
                          max_completion_tokens
                        </option>
                      </select>
                    </label>
                  </div>

                  <div class="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-white/10 dark:bg-slate-800/40">
                    <div class="text-xs font-semibold text-slate-600 dark:text-slate-300">
                      Prompt 注入
                    </div>
                    <label class="flex items-center justify-between text-sm text-slate-700 dark:text-slate-200">
                      <span>系统提示改为用户消息</span>
                      <input
                        type="checkbox"
                        checked={Boolean(selectedModel.value!.systemPromptInUserMessage)}
                        onChange={(e) =>
                          updateModel(selectedModel.value!.id, {
                            systemPromptInUserMessage: (e.target as HTMLInputElement).checked,
                          })
                        }
                      />
                    </label>
                    <p class="text-xs text-slate-500 dark:text-slate-400">
                      当代理屏蔽 system prompt 时启用，系统提示会作为首条 user 消息注入。
                    </p>
                  </div>

                  <div class="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-white/10 dark:bg-slate-800/40">
                    <div class="text-xs font-semibold text-slate-600 dark:text-slate-300">
                      Tool Calling 配置
                    </div>
                    <label class="field">
                      <span>tool_choice</span>
                      <select
                        value={normalizeTooling(selectedModel.value!.tooling).toolChoice.mode}
                        onChange={(e) => {
                          const mode = (e.target as HTMLSelectElement).value
                          updateToolChoice(selectedModel.value!.id, { mode })
                        }}
                      >
                        <option value="auto">auto（默认）</option>
                        <option value="none">none（不调用工具）</option>
                        <option value="required">required（必须调用工具）</option>
                        <option value="tool">指定工具</option>
                      </select>
                    </label>
                    {normalizeTooling(selectedModel.value!.tooling).toolChoice.mode === "tool" ? (
                      <label class="field">
                        <span>指定工具名</span>
                        <input
                          type="text"
                          value={normalizeTooling(selectedModel.value!.tooling).toolChoice.toolName}
                          placeholder="例如 GetPageContext"
                          onInput={(e) =>
                            updateToolChoice(selectedModel.value!.id, {
                              toolName: (e.target as HTMLInputElement).value,
                            })
                          }
                        />
                      </label>
                    ) : null}
                    <label class="field">
                      <span>strict</span>
                      <select
                        value={normalizeTooling(selectedModel.value!.tooling).strict}
                        onChange={(e) =>
                          updateTooling(selectedModel.value!.id, {
                            strict: (e.target as HTMLSelectElement).value,
                          })
                        }
                      >
                        <option value="auto">auto（默认）</option>
                        <option value="on">on</option>
                        <option value="off">off</option>
                      </select>
                    </label>
                    <label class="field">
                      <span>parallel_tool_calls</span>
                      <select
                        value={normalizeTooling(selectedModel.value!.tooling).parallelToolCalls}
                        onChange={(e) =>
                          updateTooling(selectedModel.value!.id, {
                            parallelToolCalls: (e.target as HTMLSelectElement).value,
                          })
                        }
                      >
                        <option value="auto">auto（默认）</option>
                        <option value="on">on</option>
                        <option value="off">off</option>
                      </select>
                    </label>
                    <p class="text-xs text-slate-500 dark:text-slate-400">
                      注：部分 Provider 可能忽略 tool_choice / strict / parallel_tool_calls。
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <p class="text-sm text-slate-500">请选择一个模型</p>
            )}
          </div>
        </div>
      </div>
    )
  },
})
