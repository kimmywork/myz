import { computed, defineComponent } from "vue"
import type { PropType, VNodeChild } from "vue"
import type { AIProviderSetting, AISkillsSettings } from "./types"

export default defineComponent({
  name: "AiSkillsSection",
  props: {
    providers: { type: Array as PropType<AIProviderSetting[]>, required: true },
    value: { type: Object as PropType<AISkillsSettings>, required: true },
    onChange: {
      type: Function as PropType<(next: AISkillsSettings) => void>,
      required: true,
    },
    requireTestedProviders: {
      type: Boolean,
      default: false,
    },
    description: {
      type: String,
      default:
        "Skills 可用 @skill-name 显式引用，或由选择器模型自动匹配。",
    },
    autoDescription: {
      type: String,
      default: "（自动模式：每次发送前会用选择器模型从已启用技能中挑选）",
    },
    missingAutoTargetNotice: {
      type: String,
      default:
        "已开启“自动”，但尚未选择选择器模型：为安全起见，本次将不会自动启用技能。",
    },
    autoLabel: {
      type: String,
      default: "自动",
    },
    autoHint: {
      type: String,
      default: "（用一个模型为每次输入选择需要启用的技能）",
    },
    renderAfterSelector: Function as PropType<() => VNodeChild>,
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
    const currentKey = computed(() => {
      const target = props.value.autoSelectorTarget
      return target ? `${target.providerId}:${target.modelId}` : ""
    })

    function update(patch: Partial<AISkillsSettings>) {
      props.onChange({
        ...props.value,
        ...patch,
      })
    }

    return () => (
      <div class="space-y-4">
        <div class="text-xs text-slate-500 dark:text-slate-400">
          {props.description}
          {isAuto.value ? props.autoDescription : null}
        </div>
        {missingAutoTarget.value ? (
          <div class="rounded-xl border border-amber-300/70 bg-amber-50 px-3 py-2 text-[11px] text-amber-800 dark:border-amber-400/40 dark:bg-amber-500/10 dark:text-amber-200">
            {props.missingAutoTargetNotice}
          </div>
        ) : null}

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
          <span class="font-medium">{props.autoLabel}</span>
          <span class="text-xs text-slate-500 dark:text-slate-400">
            {props.autoHint}
          </span>
        </label>

        {isAuto.value ? (
          <label class="field">
            <span>选择器模型</span>
            <select
              value={currentKey.value}
              onChange={(event) => {
                const value = (event.target as HTMLSelectElement).value
                const [providerId, modelId] = value.split(":")
                update({
                  autoSelectorTarget:
                    providerId && modelId ? { providerId, modelId } : null,
                })
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
        ) : null}

        {props.renderAfterSelector?.()}
      </div>
    )
  },
})
