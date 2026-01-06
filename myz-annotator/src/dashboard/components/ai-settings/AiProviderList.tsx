import { defineComponent } from "vue"
import type { PropType } from "vue"
import type { AIProviderSetting } from "@/background/settings.js"

function statusLabel(provider: AIProviderSetting) {
  if (provider.enabled) return "已启用"
  if (provider.lastTest?.ok) return "已测试"
  if (provider.lastTest) return "测试失败"
  return "未测试"
}

function statusDot(provider: AIProviderSetting) {
  if (provider.enabled) return "bg-emerald-500"
  if (provider.lastTest?.ok) return "bg-sky-500"
  if (provider.lastTest) return "bg-rose-500"
  return "bg-slate-300 dark:bg-slate-600"
}

export default defineComponent({
  name: "AiProviderList",
  props: {
    providers: { type: Array as PropType<AIProviderSetting[]>, required: true },
    selectedProviderId: { type: String as PropType<string | null>, default: null },
    usedByMap: { type: Object as PropType<Record<string, string[]>>, default: () => ({}) },
    onSelect: { type: Function as PropType<(id: string) => void>, required: true },
    onAdd: { type: Function as PropType<() => void>, required: true },
    onRemove: { type: Function as PropType<(id: string) => void>, required: true },
  },
  setup(props) {
    return () => (
      <div class="space-y-2">
        <div class="flex items-center justify-between">
          <span class="text-sm font-medium text-slate-700 dark:text-slate-200">
            Provider 列表
          </span>
          <button
            type="button"
            class="btn-small btn-primary text-white"
            onClick={() => props.onAdd()}
          >
            添加
          </button>
        </div>
        {props.providers.length === 0 ? (
          <p class="text-xs text-slate-500">暂无 Provider</p>
        ) : (
          <div class="space-y-2">
            {props.providers.map((provider) => (
              <div
                key={provider.id}
                class={[
                  "flex items-center gap-2 rounded-xl border px-3 py-2 transition",
                  provider.id === props.selectedProviderId
                    ? "border-indigo-400 bg-indigo-50 dark:border-indigo-400/60 dark:bg-indigo-500/10"
                    : "border-slate-200 hover:border-indigo-300 dark:border-white/10 dark:hover:border-indigo-400/40",
                ].join(" ")}
              >
                <button
                  type="button"
                  class="flex min-w-0 flex-1 items-center gap-2 text-left"
                  onClick={() => props.onSelect(provider.id)}
                >
                  <span
                    class={`inline-block h-2 w-2 shrink-0 rounded-full ${statusDot(provider)}`}
                    aria-hidden="true"
                  ></span>
                  <div class="min-w-0">
                    <div class="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                      {provider.name || "未命名"}
                    </div>
                    <div class="text-xs text-slate-500 dark:text-slate-400">
                      {statusLabel(provider)}
                      {provider.lastTest?.model ? ` · ${provider.lastTest.model}` : ""}
                      {props.usedByMap?.[provider.id]?.length
                        ? ` · 使用中: ${props.usedByMap[provider.id].join(", ")}`
                        : ""}
                    </div>
                  </div>
                </button>
                <button
                  type="button"
                  class="btn btn-small"
                  onClick={() => props.onRemove(provider.id)}
                >
                  删除
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    )
  },
})
