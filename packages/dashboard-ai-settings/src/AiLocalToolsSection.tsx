import { computed, defineComponent } from "vue"
import type { PropType } from "vue"
import {
  LOCAL_TOOL_DEFINITIONS,
  type AILocalToolsSettings,
  type AIProviderSetting,
} from "./types"

export default defineComponent({
  name: "AiLocalToolsSection",
  props: {
    providers: { type: Array as PropType<AIProviderSetting[]>, required: true },
    value: { type: Object as PropType<AILocalToolsSettings>, required: true },
    onChange: {
      type: Function as PropType<(next: AILocalToolsSettings) => void>,
      required: true,
    },
    requireTestedProviders: {
      type: Boolean,
      default: false,
    },
    description: {
      type: String,
      default:
        "本地 tools 列表可控制暴露给当前宿主 AI 工作流的工具集合；未启用的 tool 不会被暴露给模型，也不会被执行。",
    },
    autoDescription: {
      type: String,
      default: "（自动模式：每次发送前会用选择器模型从已启用工具中挑选本次可用的 subset）",
    },
    selectorHint: {
      type: String,
      default:
        "每次发送时，会把用户输入和候选工具列表交给该模型判断本次应启用哪些工具。",
    },
    missingAutoTargetNotice: {
      type: String,
      default:
        "已开启“自动”，但尚未选择选择器模型：为安全起见，本次将不会向主模型暴露任何工具。",
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
        .filter((provider) =>
          props.requireTestedProviders
            ? provider.enabled && provider.lastTest?.ok
            : provider.enabled,
        )
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

    const isAuto = computed(() => props.value.mode === "auto")
    const missingAutoTarget = computed(
      () => isAuto.value && !props.value.autoSelectorTarget,
    )
    const enabledSet = computed(() => new Set(props.value.enabledToolNames || []))
    const currentKey = computed(() => {
      const target = props.value.autoSelectorTarget
      return target ? `${target.providerId}:${target.modelId}` : ""
    })

    function update(patch: Partial<AILocalToolsSettings>) {
      props.onChange({
        ...props.value,
        ...patch,
      })
    }

    function toggleTool(name: string, enabled: boolean) {
      const current = new Set(props.value.enabledToolNames || [])
      if (enabled) {
        current.add(name)
      } else {
        current.delete(name)
      }
      update({ enabledToolNames: Array.from(current) })
    }

    return () => (
      <div class="space-y-3">
        <div class="text-xs text-slate-500 dark:text-slate-400">
          {props.description}
          {isAuto.value ? props.autoDescription : null}
        </div>
        {missingAutoTarget.value && (
          <div class="rounded-xl border border-amber-300/70 bg-amber-50 px-3 py-2 text-[11px] text-amber-800 dark:border-amber-400/40 dark:bg-amber-500/10 dark:text-amber-200">
            {props.missingAutoTargetNotice}
          </div>
        )}

        <label class="inline-flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
          <input
            type="checkbox"
            class="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 dark:border-slate-600 dark:bg-slate-800"
            checked={isAuto.value}
            onChange={(event) =>
              update({
                mode: (event.target as HTMLInputElement).checked
                  ? "auto"
                  : "manual",
              })
            }
          />
          <span class="font-medium">自动</span>
          <span class="text-xs text-slate-500 dark:text-slate-400">
            （用一个模型为每次输入选择需要启用的工具）
          </span>
        </label>

        {isAuto.value && (
          <label class="field">
            <span>选择器模型</span>
            <select
              value={currentKey.value}
              onChange={(event) => {
                const value = (event.target as HTMLSelectElement).value
                const [providerId, modelId] = value.split(":")
                if (!providerId || !modelId) {
                  update({ autoSelectorTarget: null })
                  return
                }
                update({ autoSelectorTarget: { providerId, modelId } })
              }}
            >
              <option value="">未选择</option>
              {options.value.map((option) => (
                <option value={`${option.providerId}:${option.modelId}`}>
                  {option.label}
                </option>
              ))}
            </select>
            <div class="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
              {props.selectorHint}
            </div>
          </label>
        )}

        <div class="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm dark:border-white/10 dark:bg-slate-900/60">
          <div class="mb-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
            本地 Tools
          </div>
          <div class="space-y-2">
            {LOCAL_TOOL_DEFINITIONS.map((tool) => (
              <label class="flex items-start gap-2 text-sm text-slate-700 dark:text-slate-200">
                <input
                  type="checkbox"
                  class="mt-0.5 h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 dark:border-slate-600 dark:bg-slate-800"
                  checked={enabledSet.value.has(tool.name)}
                  onChange={(event) =>
                    toggleTool(
                      tool.name,
                      (event.target as HTMLInputElement).checked,
                    )
                  }
                />
                <span class="min-w-0 flex-1">
                  <span class="font-medium">{tool.name}</span>
                  {tool.description ? (
                    <span class="ml-2 text-xs text-slate-500 dark:text-slate-400">
                      {tool.description}
                    </span>
                  ) : null}
                </span>
              </label>
            ))}
          </div>
        </div>
      </div>
    )
  },
})
