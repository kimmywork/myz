import { computed, defineComponent } from "vue"
import type { PropType, StyleValue } from "vue"
import {
  DEFAULT_COLORS,
  HIGHLIGHT_STYLE_OPTIONS,
  HIGHLIGHT_STYLES,
} from "@myz/shared/types"
import type {
  AIAgentsSettings,
  AIProviderSetting,
  HighlightStyleValue,
} from "./types"

type AgentKey = keyof AIAgentsSettings
type ProviderFilterMode = "enabled" | "enabled_tested"

const DEFAULT_VISIBLE_AGENTS: AgentKey[] = [
  "conversation",
  "insights",
  "autoHighlight",
]

const DEFAULT_CATEGORY_STYLES = {
  conceptual: {
    style: HIGHLIGHT_STYLES.PAINT as HighlightStyleValue,
    color: DEFAULT_COLORS[0],
  },
  structural: {
    style: HIGHLIGHT_STYLES.UNDERLINE as HighlightStyleValue,
    color: DEFAULT_COLORS[3] || DEFAULT_COLORS[0],
  },
  behavioural: {
    style: HIGHLIGHT_STYLES.WAVY as HighlightStyleValue,
    color: DEFAULT_COLORS[1] || DEFAULT_COLORS[0],
  },
}

function clamp(value: unknown, min: number, max: number, fallback: number) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.max(min, Math.min(max, parsed))
}

function clampCount(
  value: unknown,
  min: number,
  max: number,
  fallback: number,
) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.max(min, Math.min(max, Math.round(parsed)))
}

function openColorPicker(event: Event) {
  const target = event.currentTarget as HTMLElement | null
  const input = target?.parentElement?.querySelector(
    "input[type='color']",
  ) as HTMLInputElement | null
  input?.click()
}

function handleSwatchKeydown(event: KeyboardEvent) {
  if (event.key !== "Enter" && event.key !== " ") return
  event.preventDefault()
  openColorPicker(event)
}

function getStylePreviewStyle(
  style: HighlightStyleValue,
  color: string,
): StyleValue {
  const safeColor =
    typeof color === "string" && color.trim() ? color : DEFAULT_COLORS[0]
  if (style === HIGHLIGHT_STYLES.UNDERLINE) {
    return {
      textDecorationLine: "underline",
      textDecorationStyle: "solid",
      textDecorationColor: safeColor,
      textUnderlineOffset: "3px",
      textDecorationThickness: "2px",
    }
  }
  if (style === HIGHLIGHT_STYLES.WAVY) {
    return {
      textDecorationLine: "underline",
      textDecorationStyle: "wavy",
      textDecorationColor: safeColor,
      textUnderlineOffset: "3px",
      textDecorationThickness: "2px",
    }
  }
  return {
    background: safeColor,
    color: "#0f172a",
    borderRadius: "6px",
    padding: "0 4px",
  }
}

export default defineComponent({
  name: "AiAgentRouting",
  props: {
    providers: { type: Array as PropType<AIProviderSetting[]>, required: true },
    agents: { type: Object as PropType<AIAgentsSettings>, required: true },
    visibleAgents: {
      type: Array as PropType<AgentKey[]>,
      default: () => [...DEFAULT_VISIBLE_AGENTS],
    },
    providerFilterMode: {
      type: String as PropType<ProviderFilterMode>,
      default: "enabled_tested",
    },
    onChange: {
      type: Function as PropType<(next: AIAgentsSettings) => void>,
      required: true,
    },
  },
  setup(props) {
    const options = computed(() => {
      const items: Array<{
        label: string
        providerId: string
        modelId: string
      }> = []
      props.providers
        .filter((provider) => {
          if (!provider.enabled) return false
          if (props.providerFilterMode === "enabled") return true
          return Boolean(provider.lastTest?.ok)
        })
        .forEach((provider) => {
          provider.models
            .filter((model) => model.enabled && model.model)
            .forEach((model) => {
              items.push({
                label: `${provider.name} (${model.model})`,
                providerId: provider.id,
                modelId: model.id,
              })
            })
        })
      return items
    })

    const visibleAgents = computed(() => {
      const allowed = new Set(
        (props.visibleAgents || DEFAULT_VISIBLE_AGENTS).filter((key) =>
          DEFAULT_VISIBLE_AGENTS.includes(key),
        ),
      )
      return DEFAULT_VISIBLE_AGENTS.filter((key) => allowed.has(key))
    })

    const visionOptions = computed(() => {
      return options.value.filter((option) => {
        const provider = props.providers.find(
          (item) => item.id === option.providerId,
        )
        const model = provider?.models.find((item) => item.id === option.modelId)
        return Boolean(model?.capabilities?.vision)
      })
    })

    const resolveTargetModel = (
      target?: { providerId?: string; modelId?: string } | null,
    ) => {
      if (!target?.providerId || !target?.modelId) return null
      const provider = props.providers.find((item) => item.id === target.providerId)
      if (!provider) return null
      return (
        (provider.models || []).find((model) => model.id === target.modelId) ||
        null
      )
    }

    const updateAgent = <K extends AgentKey>(
      key: K,
      patch: Partial<AIAgentsSettings[K]>,
    ) => {
      props.onChange({
        ...props.agents,
        [key]: {
          ...props.agents[key],
          ...patch,
        },
      })
    }

    const helperText =
      props.providerFilterMode === "enabled_tested"
        ? "选择已测试并启用的 Provider+Model"
        : "选择已启用的 Provider+Model"

    const labelMap: Record<AgentKey, string> = {
      conversation: "Conversation",
      insights: "Insights",
      autoHighlight: "Auto Highlight",
    }

    const renderAgentRow = (key: AgentKey) => {
      const agent = props.agents[key]
      const currentKey = agent.target
        ? `${agent.target.providerId}:${agent.target.modelId}`
        : ""
      const supportsVision =
        key === "conversation"
          ? Boolean(resolveTargetModel(agent.target)?.capabilities?.vision)
          : false
      const multimodalKey =
        key === "conversation" && agent.multimodalTarget
          ? `${agent.multimodalTarget.providerId}:${agent.multimodalTarget.modelId}`
          : ""

      return (
        <div class="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-slate-900/60">
          <div class="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div>
              <div class="text-sm font-semibold text-slate-900 dark:text-slate-100">
                {labelMap[key]}
              </div>
              <div class="text-xs text-slate-500 dark:text-slate-400">
                {helperText}
              </div>
            </div>
          </div>

          <div class="mt-3 grid gap-3 md:grid-cols-2">
            <label class="field">
              <span>模型</span>
              <select
                value={currentKey}
                onChange={(event) => {
                  const value = (event.target as HTMLSelectElement).value
                  const [providerId, modelId] = value.split(":")
                  if (!providerId || !modelId) {
                    updateAgent(key, { target: null })
                    return
                  }
                  updateAgent(key, { target: { providerId, modelId } })
                }}
              >
                <option value="">未选择</option>
                {options.value.map((option) => (
                  <option value={`${option.providerId}:${option.modelId}`}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label class="field">
              <span>Temperature</span>
              <input
                type="number"
                step="0.1"
                min="0"
                max="2"
                value={agent.temperature}
                onInput={(event) =>
                  updateAgent(key, {
                    temperature: clamp(
                      (event.target as HTMLInputElement).value,
                      0,
                      2,
                      0.7,
                    ),
                  })
                }
              />
            </label>
          </div>

          {key === "conversation" && agent.target && !supportsVision ? (
            <div class="mt-3">
              <label class="field">
                <span>多模态模型（支持 Vision）</span>
                <select
                  value={multimodalKey}
                  onChange={(event) => {
                    const value = (event.target as HTMLSelectElement).value
                    const [providerId, modelId] = value.split(":")
                    if (!providerId || !modelId) {
                      updateAgent("conversation", { multimodalTarget: null })
                      return
                    }
                    updateAgent("conversation", {
                      multimodalTarget: { providerId, modelId },
                    })
                  }}
                >
                  <option value="">未选择</option>
                  {visionOptions.value.map((option) => (
                    <option value={`${option.providerId}:${option.modelId}`}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <div class="mt-1 text-xs text-slate-500 dark:text-slate-400">
                当主模型不支持 Vision 且输入包含图片时，将自动切换到该模型。
              </div>
            </div>
          ) : null}

          {key === "conversation" ? (
            <div class="mt-3">
              <label class="inline-flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
                <input
                  type="checkbox"
                  class="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 dark:border-slate-600 dark:bg-slate-800"
                  checked={Boolean(agent.superpowerMode)}
                  onChange={(event) =>
                    updateAgent("conversation", {
                      superpowerMode: (event.target as HTMLInputElement).checked,
                    })
                  }
                />
                <span>Superpower Mode（高级能力）</span>
              </label>
              <div class="mt-1 text-xs text-slate-500 dark:text-slate-400">
                开启后允许使用高级工具，并启用计划 → 执行 → 验证流程。
              </div>
            </div>
          ) : null}

          {key === "conversation" ? (
            <div class="mt-3">
              <label class="inline-flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
                <input
                  type="checkbox"
                  class="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 dark:border-slate-600 dark:bg-slate-800"
                  checked={Boolean(agent.compressImages)}
                  onChange={(event) =>
                    updateAgent("conversation", {
                      compressImages: (event.target as HTMLInputElement).checked,
                    })
                  }
                />
                <span>发送前压缩图片（最长边 ≤ 640px）</span>
              </label>
            </div>
          ) : null}

          {key === "conversation" ? (
            <div class="mt-3">
              <label class="field">
                <span>上下文压缩阈值（%）</span>
                <input
                  type="number"
                  min="50"
                  max="95"
                  step="1"
                  value={agent.contextCompressionThreshold ?? 80}
                  onInput={(event) =>
                    updateAgent("conversation", {
                      contextCompressionThreshold: clamp(
                        (event.target as HTMLInputElement).value,
                        50,
                        95,
                        80,
                      ),
                    })
                  }
                />
              </label>
              <div class="mt-1 text-xs text-slate-500 dark:text-slate-400">
                当对话上下文估算占用达到该百分比时，自动触发压缩。
              </div>
            </div>
          ) : null}

          {key === "autoHighlight" ? (
            <div class="mt-3 space-y-3">
              <div class="grid gap-3 md:grid-cols-2">
                <label class="field">
                  <span>最多高亮条数</span>
                  <input
                    type="range"
                    min="5"
                    max="30"
                    step="1"
                    value={agent.maxHighlights ?? 15}
                    onInput={(event) => {
                      updateAgent("autoHighlight", {
                        maxHighlights: clampCount(
                          (event.target as HTMLInputElement).value,
                          5,
                          30,
                          15,
                        ),
                      })
                    }}
                  />
                  <div class="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    当前：{agent.maxHighlights ?? 15}
                  </div>
                </label>
              </div>

              <div class="space-y-2 rounded-xl border border-slate-200 bg-slate-50/60 p-3 text-xs text-slate-600 dark:border-white/10 dark:bg-slate-900/40 dark:text-slate-300">
                <div class="text-xs font-semibold text-slate-700 dark:text-slate-200">
                  分类样式与颜色
                </div>
                <div class="text-[11px] text-slate-500 dark:text-slate-400">
                  Auto Highlight 会先将内容分类，再按这里的样式/颜色进行高亮。
                </div>
                {(["conceptual", "structural", "behavioural"] as const).map(
                  (category) => {
                    const autoHighlightAgent = props.agents
                      .autoHighlight as AIAgentsSettings["autoHighlight"]
                    const categoryStyles =
                      autoHighlightAgent.categoryStyles || DEFAULT_CATEGORY_STYLES
                    const current =
                      categoryStyles[category] || DEFAULT_CATEGORY_STYLES[category]
                    const normalizedStyle = current.style as HighlightStyleValue
                    const styleMeta = HIGHLIGHT_STYLE_OPTIONS[normalizedStyle]
                    const labelByCategory = {
                      conceptual: "Conceptual（核心知识）",
                      structural: "Structural（结构框架）",
                      behavioural: "Behavioural（行动指令）",
                    }

                    return (
                      <div class="mt-2 rounded-xl border border-slate-200 bg-white p-3 dark:border-white/10 dark:bg-slate-950/40">
                        <div class="mb-2 flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-200">
                          <span>{labelByCategory[category]}</span>
                          <span class="ml-auto text-[11px] font-normal text-slate-500 dark:text-slate-400">
                            当前样式：
                            <span
                              class="ml-1"
                              style={getStylePreviewStyle(
                                normalizedStyle,
                                current.color,
                              )}
                            >
                              {styleMeta?.label || normalizedStyle}
                            </span>
                          </span>
                        </div>
                        <div class="grid gap-3 md:grid-cols-2">
                          <label class="field">
                            <span>样式</span>
                            <select
                              value={current.style}
                              onChange={(event) => {
                                updateAgent("autoHighlight", {
                                  categoryStyles: {
                                    ...categoryStyles,
                                    [category]: {
                                      ...current,
                                      style: (event.target as HTMLSelectElement)
                                        .value as HighlightStyleValue,
                                    },
                                  },
                                })
                              }}
                            >
                              {Object.values(HIGHLIGHT_STYLES).map((style) => (
                                <option value={style}>
                                  {HIGHLIGHT_STYLE_OPTIONS[style]?.label || style}
                                </option>
                              ))}
                            </select>
                          </label>

                          <label class="field">
                            <span>颜色</span>
                            <div class="flex items-center gap-2">
                              <span
                                class="h-6 w-6 rounded-full border border-slate-200 dark:border-white/10"
                                style={{ background: current.color }}
                                role="button"
                                tabindex={0}
                                aria-label="打开颜色选择器"
                                onClick={openColorPicker}
                                onKeydown={handleSwatchKeydown}
                              ></span>
                              <input
                                type="color"
                                value={current.color}
                                onInput={(event) => {
                                  updateAgent("autoHighlight", {
                                    categoryStyles: {
                                      ...categoryStyles,
                                      [category]: {
                                        ...current,
                                        color: (event.target as HTMLInputElement)
                                          .value,
                                      },
                                    },
                                  })
                                }}
                              />
                              <span class="text-[11px] text-slate-500 dark:text-slate-400">
                                {current.color}
                              </span>
                            </div>
                          </label>
                        </div>
                      </div>
                    )
                  },
                )}
              </div>

              <div class="text-xs text-slate-500 dark:text-slate-400">
                模型的 max_tokens 会限制可输出的高亮条数，请同步调整该值。
              </div>
            </div>
          ) : null}
        </div>
      )
    }

    return () => (
      <div class="space-y-3">
        {visibleAgents.value.map((key) => renderAgentRow(key))}
      </div>
    )
  },
})
