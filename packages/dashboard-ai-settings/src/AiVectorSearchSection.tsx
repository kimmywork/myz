import { computed, defineComponent } from "vue"
import type { PropType } from "vue"
import ToggleSwitch from "./ToggleSwitch"
import type { AIProviderSetting, VectorSettings } from "./types"

export default defineComponent({
  name: "AiVectorSearchSection",
  props: {
    providers: { type: Array as PropType<AIProviderSetting[]>, required: true },
    value: { type: Object as PropType<VectorSettings>, required: true },
    onChange: {
      type: Function as PropType<(next: VectorSettings) => void>,
      required: true,
    },
    isTesting: { type: Boolean, default: false },
    onTestConnection: Function as PropType<() => void>,
    targetSummary: { type: String, default: "未选择" },
    description: {
      type: String,
      default:
        "当前页会保存向量检索目标与阈值，并可验证所选模型是否可连接。",
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

    const targetKey = computed(() => {
      const target = props.value.target
      return target ? `${target.providerId}:${target.modelId}` : ""
    })

    function update(patch: Partial<VectorSettings>) {
      props.onChange({
        ...props.value,
        ...patch,
      })
    }

    return () => (
      <div class="space-y-4 rounded-2xl border border-slate-200 bg-slate-50/60 p-4 shadow-sm dark:border-white/10 dark:bg-slate-800/40">
        <div class="text-xs text-slate-500 dark:text-slate-400">
          {props.description}
        </div>

        <div class="flex flex-col gap-2 sm:flex-row sm:items-end">
          <label class="field flex-1">
            <span>模型</span>
            <select
              value={targetKey.value}
              onChange={(event) => {
                const value = (event.target as HTMLSelectElement).value
                const [providerId, modelId] = value.split(":")
                update({
                  target: providerId && modelId ? { providerId, modelId } : null,
                  lastTest: null,
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
          <div class="flex items-center gap-2 sm:pb-1">
            <button
              type="button"
              class="btn btn-small whitespace-nowrap"
              disabled={props.isTesting || !props.value.target}
              onClick={() => props.onTestConnection?.()}
            >
              {props.isTesting ? "测试中…" : "测试连接"}
            </button>
            <span class="text-sm text-slate-600 dark:text-slate-300">启用</span>
            <ToggleSwitch
              checked={props.value.enabled}
              ariaLabel="启用向量检索"
              onChange={(event) =>
                update({
                  enabled: (event.target as HTMLInputElement).checked,
                })
              }
            />
          </div>
        </div>

        <div class="rounded-xl border border-slate-200 bg-white/80 p-3 text-xs text-slate-600 dark:border-white/10 dark:bg-slate-950/40 dark:text-slate-300">
          当前目标：{props.targetSummary}
        </div>

        {props.value.lastTest ? (
          <div
            class={[
              "rounded-xl border p-3 text-xs",
              props.value.lastTest.ok
                ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-400/30 dark:bg-emerald-500/10 dark:text-emerald-100"
                : "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-400/30 dark:bg-rose-500/10 dark:text-rose-100",
            ].join(" ")}
          >
            <div class="font-medium">
              {props.value.lastTest.ok ? "最近一次连接测试成功" : "最近一次连接测试失败"}
            </div>
            <div class="mt-1 break-words">{props.value.lastTest.message}</div>
            <div class="mt-1 opacity-80">
              模型：{props.value.lastTest.model} · 时间：{props.value.lastTest.testedAt}
            </div>
          </div>
        ) : null}

        <label class="field">
          <span>匹配阈值</span>
          <div class="flex items-center gap-3">
            <input
              type="range"
              min="40"
              max="100"
              step="1"
              class="w-full"
              value={Math.round((props.value.matchThreshold || 0.5) * 100)}
              onInput={(event) => {
                const percent = Number((event.target as HTMLInputElement).value)
                const next = Number.isFinite(percent) ? percent / 100 : 0.5
                update({
                  matchThreshold: Math.min(1, Math.max(0.4, next)),
                })
              }}
            />
            <span class="text-xs tabular-nums text-slate-500 dark:text-slate-300">
              {Math.round((props.value.matchThreshold || 0.5) * 100)}%
            </span>
          </div>
          <p class="mt-1 text-xs text-slate-500 dark:text-slate-300">
            仅显示相似度高于阈值的匹配结果（40% - 100%）
          </p>
        </label>
      </div>
    )
  },
})
