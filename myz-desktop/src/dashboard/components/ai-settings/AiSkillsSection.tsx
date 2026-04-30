import { computed, defineComponent } from "vue"
import type { PropType } from "vue"
import type {
  AIProviderSetting,
  AISkillsSettings,
} from "../../types/settings"

export default defineComponent({
  name: "AiSkillsSection",
  props: {
    providers: { type: Array as PropType<AIProviderSetting[]>, required: true },
    value: { type: Object as PropType<AISkillsSettings>, required: true },
    onChange: {
      type: Function as PropType<(next: AISkillsSettings) => void>,
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
        .filter((provider) => provider.enabled)
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
          桌面端已迁移 Skills 模式与选择器模型配置。Skill 目录管理与导入编辑器将在后续独立迁移。
        </div>

        <label class="inline-flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
          <input
            type="checkbox"
            checked={props.value.mode === "auto"}
            onChange={(event) =>
              update({
                mode: (event.target as HTMLInputElement).checked
                  ? "auto"
                  : "manual",
              })
            }
          />
          <span class="font-medium">自动匹配 Skills</span>
        </label>

        {props.value.mode === "auto" ? (
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

        <div class="settings__empty">
          Skills 文件管理仍待迁移。目前可以先在桌面端保存模式与选择器模型，后续再接入完整目录编辑体验。
        </div>
      </div>
    )
  },
})
