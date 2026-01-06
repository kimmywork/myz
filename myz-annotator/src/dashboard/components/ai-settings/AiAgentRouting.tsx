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
        </div>
      )
    }

    return () => (
      <section class="settings__group">
        <div class="settings__group-header">
          <h3>Agent 模型选择</h3>
        </div>
        <div class="settings__fields space-y-3">
          {renderAgentRow("conversation", "Conversation")}
          {renderAgentRow("insights", "Insights")}
        </div>
      </section>
    )
  },
})

