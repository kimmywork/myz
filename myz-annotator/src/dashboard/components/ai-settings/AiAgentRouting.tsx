import { defineComponent, computed } from "vue"
import type { PropType } from "vue"
import type {
  AIAgentConfig,
  AIAgentsSettings,
  AIProviderSetting,
} from "@/background/settings.js"

function clamp(value: any, min: number, max: number, fallback: number) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.max(min, Math.min(max, parsed))
}

export default defineComponent({
  name: "AiAgentRouting",
  props: {
    providers: { type: Array as PropType<AIProviderSetting[]>, required: true },
    agents: { type: Object as PropType<AIAgentsSettings>, required: true },
    onChange: {
      type: Function as PropType<(next: AIAgentsSettings) => void>,
      required: true,
    },
  },
  setup(props) {
    const options = computed(() => {
      const items: Array<{ label: string; providerId: string; modelId: string }> = []
      props.providers
        .filter((p) => p.enabled && p.lastTest?.ok)
        .forEach((provider) => {
          provider.models
            .filter((m) => m.enabled && m.model)
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

    const visionOptions = computed(() => {
      const items: Array<{ label: string; providerId: string; modelId: string }> = []
      props.providers
        .filter((p) => p.enabled && p.lastTest?.ok)
        .forEach((provider) => {
          provider.models
            .filter((m) => m.enabled && m.model && m.capabilities?.vision)
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

    const resolveTargetModel = (target?: { providerId?: string; modelId?: string } | null) => {
      if (!target?.providerId || !target?.modelId) return null
      const provider = props.providers.find((p) => p.id === target.providerId)
      if (!provider) return null
      return (provider.models || []).find((model) => model.id === target.modelId) || null
    }

    const updateAgent = (
      key: "conversation" | "insights",
      patch: Partial<AIAgentConfig>,
    ) => {
      props.onChange({
        ...props.agents,
        [key]: {
          ...props.agents[key],
          ...patch,
        },
      })
    }

    const renderAgentRow = (key: "conversation" | "insights", label: string) => {
      const agent = props.agents[key]
      const currentKey = agent.target ? `${agent.target.providerId}:${agent.target.modelId}` : ""
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
                {label}
              </div>
              <div class="text-xs text-slate-500 dark:text-slate-400">
                选择已测试并启用的 Provider+Model
              </div>
            </div>
          </div>
          <div class="mt-3 grid gap-3 md:grid-cols-2">
            <label class="field">
              <span>模型</span>
              <select
                value={currentKey}
                onChange={(e) => {
                  const value = (e.target as HTMLSelectElement).value
                  const [providerId, modelId] = value.split(":")
                  if (!providerId || !modelId) {
                    updateAgent(key, { target: null })
                    return
                  }
                  updateAgent(key, { target: { providerId, modelId } })
                }}
              >
                <option value="">未选择</option>
                {options.value.map((opt) => (
                  <option value={`${opt.providerId}:${opt.modelId}`}>{opt.label}</option>
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
                onInput={(e) =>
                  updateAgent(key, {
                    temperature: clamp(
                      (e.target as HTMLInputElement).value,
                      0,
                      2,
                      0.7,
                    ),
                  })
                }
              />
            </label>
          </div>
          {key === "conversation" && agent.target && !supportsVision && (
            <div class="mt-3">
              <label class="field">
                <span>多模态模型（支持 Vision）</span>
                <select
                  value={multimodalKey}
                  onChange={(e) => {
                    const value = (e.target as HTMLSelectElement).value
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
                  {visionOptions.value.map((opt) => (
                    <option value={`${opt.providerId}:${opt.modelId}`}>{opt.label}</option>
                  ))}
                </select>
              </label>
              <div class="mt-1 text-xs text-slate-500 dark:text-slate-400">
                当主模型不支持 Vision 且输入包含图片时，将自动切换到该模型。
              </div>
            </div>
          )}
          {key === "conversation" && (
            <div class="mt-3">
              <label class="inline-flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
                <input
                  type="checkbox"
                  class="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 dark:border-slate-600 dark:bg-slate-800"
                  checked={Boolean(agent.compressImages)}
                  onChange={(e) =>
                    updateAgent("conversation", {
                      compressImages: (e.target as HTMLInputElement).checked,
                    })
                  }
                />
                <span>发送前压缩图片（最长边 ≤ 640px）</span>
              </label>
            </div>
          )}
          {key === "conversation" && (
            <div class="mt-3">
              <label class="field">
                <span>上下文压缩阈值（%）</span>
                <input
                  type="number"
                  min="50"
                  max="95"
                  step="1"
                  value={agent.contextCompressionThreshold ?? 80}
                  onInput={(e) =>
                    updateAgent("conversation", {
                      contextCompressionThreshold: clamp(
                        (e.target as HTMLInputElement).value,
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
          )}
        </div>
      )
    }

    return () => (
      <div class="space-y-3">
        {renderAgentRow("conversation", "Conversation")}
        {renderAgentRow("insights", "Insights")}
      </div>
    )
  },
})
