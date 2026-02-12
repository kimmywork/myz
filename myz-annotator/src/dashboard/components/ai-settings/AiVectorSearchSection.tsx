import { computed, defineComponent, ref, watch } from "vue"
import type { PropType } from "vue"
import type { AIProviderSetting, VectorSettings } from "@/background/settings.js"
import { sendMessage } from "@/shared/messaging.js"
import { useSettingsStore } from "../../stores/settings.js"
import ToggleSwitch from "../ToggleSwitch.jsx"

function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value))
}

export default defineComponent({
  name: "AiVectorSearchSection",
  props: {
    providers: { type: Array as PropType<AIProviderSetting[]>, required: true },
  },
  setup(props) {
    const store = useSettingsStore()
    const draft = ref<VectorSettings>({
      enabled: false,
      target: null,
      lastTest: null,
      matchThreshold: 0.5,
    })
    const saveNotice = ref("")
    const status = ref("")
    const reindexHint = ref("")
    const isTesting = ref(false)
    const isRebuilding = ref(false)

    watch(
      () => store.settings.vectorSearch,
      (next) => {
        draft.value = deepClone(
          next || { enabled: false, target: null, lastTest: null, matchThreshold: 0.5 },
        )
      },
      { deep: true, immediate: true },
    )

    const vectorOptions = computed(() => {
      const items: Array<{ label: string; providerId: string; modelId: string; model: string }> = []
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
                model: model.model,
              })
            })
        })
      return items
    })

    const targetKey = computed(() => {
      const t = draft.value.target
      return t ? `${t.providerId}:${t.modelId}` : ""
    })

    const selectedConfig = computed(() => {
      const target = draft.value.target
      if (!target) return null
      const provider = props.providers.find((p) => p.id === target.providerId) || null
      const model = provider?.models?.find((m) => m.id === target.modelId) || null
      if (!provider || !model) return null
      return { provider, model }
    })

    const canEnable = computed(() => {
      const t = draft.value.target
      const test = draft.value.lastTest
      if (!t || !test?.ok) return false
      return test.providerId === t.providerId && test.modelId === t.modelId
    })

    const isDirty = computed(() => {
      return JSON.stringify(draft.value) !== JSON.stringify(store.settings.vectorSearch)
    })

    const savedTargetKey = computed(() => {
      const t = store.settings.vectorSearch?.target
      return t ? `${t.providerId}:${t.modelId}` : ""
    })

    const setTimedNotice = (message: string) => {
      saveNotice.value = message
      setTimeout(() => {
        if (saveNotice.value === message) saveNotice.value = ""
      }, 2500)
    }

    const testConnection = async () => {
      const config = selectedConfig.value
      if (!config) {
        status.value = "请选择模型"
        return
      }
      isTesting.value = true
      status.value = ""
      reindexHint.value = ""
      try {
        const result = await sendMessage("myz:vectorTestConnection", {
          provider: {
            baseUrl: config.provider.baseUrl,
            apiKey: config.provider.apiKey,
          },
          model: config.model.model,
        })
        const ok = Boolean(result?.success)
        const message = ok ? "连接成功" : result?.error || "连接失败"
        draft.value = {
          ...draft.value,
          enabled: ok ? draft.value.enabled : false,
          lastTest: {
            ok,
            message,
            testedAt: new Date().toISOString(),
            providerId: config.provider.id,
            modelId: config.model.id,
            model: config.model.model,
          },
        }
        status.value = message
      } catch (error) {
        const message = (error as Error).message
        draft.value = {
          ...draft.value,
          enabled: false,
          lastTest: config
            ? {
                ok: false,
                message,
                testedAt: new Date().toISOString(),
                providerId: config.provider.id,
                modelId: config.model.id,
                model: config.model.model,
              }
            : null,
        }
        status.value = message
      } finally {
        isTesting.value = false
      }
    }

    const save = async () => {
      const previousKey = savedTargetKey.value
      const nextKey = targetKey.value
      const next: VectorSettings = {
        ...draft.value,
        enabled: draft.value.enabled && canEnable.value,
      }
      await store.saveSettings({ vectorSearch: next as any })
      setTimedNotice("已保存")
      if (previousKey && nextKey && previousKey !== nextKey) {
        reindexHint.value = "模型已变更，保存后请重建索引"
      } else if (!previousKey && nextKey) {
        reindexHint.value = "已选择模型，建议重建索引以覆盖历史标注"
      }
    }

    const rebuildIndex = async () => {
      if (isDirty.value) {
        status.value = "请先保存设置再重建索引"
        return
      }
      isRebuilding.value = true
      status.value = ""
      try {
        const result = await sendMessage("myz:rebuildVectorIndex")
        status.value = result?.count ? `索引已重建（${result.count} 条）` : "索引已重建"
        reindexHint.value = ""
      } catch (error) {
        status.value = (error as Error).message
      } finally {
        isRebuilding.value = false
      }
    }

    return () => (
      <div class="rounded-2xl border border-slate-200 bg-slate-50/60 p-4 shadow-sm dark:border-white/10 dark:bg-slate-800/40">
        <div class="mb-3 flex items-center justify-between gap-2">
          <p class="text-sm font-medium text-slate-900 dark:text-white">
            向量检索（Vectoria）
          </p>
          <div class="flex items-center gap-2">
            {saveNotice.value ? (
              <span class="text-xs text-emerald-600">{saveNotice.value}</span>
            ) : null}
            <button
              type="button"
              class="btn btn-primary whitespace-nowrap"
              onClick={save}
            >
              保存
            </button>
          </div>
        </div>

        <div class="space-y-3">
          <div class="flex flex-col gap-2 sm:flex-row sm:items-end">
            <label class="field flex-1">
              <span>模型</span>
              <select
                value={targetKey.value}
                onChange={(e) => {
                  const value = (e.target as HTMLSelectElement).value
                  const [providerId, modelId] = value.split(":")
                  draft.value = {
                    ...draft.value,
                    target: providerId && modelId ? { providerId, modelId } : null,
                    enabled: false,
                    lastTest: null,
                  }
                  status.value = ""
                  reindexHint.value = ""
                }}
              >
                <option value="">未选择</option>
                {vectorOptions.value.map((opt) => (
                  <option value={`${opt.providerId}:${opt.modelId}`}>{opt.label}</option>
                ))}
              </select>
            </label>
            <div class="flex items-center gap-2 sm:pb-1">
              <span class="text-sm text-slate-600 dark:text-slate-300">启用</span>
              <ToggleSwitch
                checked={draft.value.enabled}
                disabled={!canEnable.value}
                ariaLabel="启用向量检索"
                onChange={(e) =>
                  (draft.value = {
                    ...draft.value,
                    enabled: (e.target as HTMLInputElement).checked,
                  })
                }
              />
            </div>
          </div>

          <label class="field">
            <span>匹配阈值</span>
            <div class="flex items-center gap-3">
              <input
                type="range"
                min="40"
                max="100"
                step="1"
                class="w-full"
                value={Math.round((draft.value.matchThreshold || 0.5) * 100)}
                onInput={(e) => {
                  const percent = Number((e.target as HTMLInputElement).value)
                  const next = Number.isFinite(percent) ? percent / 100 : 0.5
                  draft.value = {
                    ...draft.value,
                    matchThreshold: Math.min(1, Math.max(0.4, next)),
                  }
                }}
              />
              <span class="text-xs tabular-nums text-slate-500 dark:text-slate-300">
                {Math.round((draft.value.matchThreshold || 0.5) * 100)}%
              </span>
            </div>
            <p class="mt-1 text-xs text-slate-500 dark:text-slate-300">
              仅显示相似度高于阈值的匹配结果（40% - 100%）
            </p>
          </label>

          <div class="flex flex-wrap items-center gap-2">
            <button
              type="button"
              class="btn btn-small btn-primary whitespace-nowrap text-white"
              disabled={isTesting.value || !selectedConfig.value}
              onClick={testConnection}
            >
              {isTesting.value ? "测试中…" : "测试连接"}
            </button>
            <button
              type="button"
              class="btn btn-small whitespace-nowrap"
              disabled={isRebuilding.value || !store.settings.vectorSearch?.enabled}
              onClick={rebuildIndex}
            >
              {isRebuilding.value ? "重建中…" : "重建索引"}
            </button>

            {isDirty.value ? <span class="text-xs text-amber-600">未保存</span> : null}
          </div>

          <div class="text-xs">
            {draft.value.lastTest ? (
              <span
                class={[
                  draft.value.lastTest.ok ? "text-emerald-600" : "text-rose-600",
                ].join(" ")}
              >
                {draft.value.lastTest.ok ? "测试通过" : "测试失败"} ·{" "}
                {draft.value.lastTest.message}
              </span>
            ) : (
              <span class="text-slate-500">未测试，无法启用</span>
            )}
            {status.value ? <span class="text-slate-500"> · {status.value}</span> : null}
            {reindexHint.value ? (
              <span class="text-amber-600"> · {reindexHint.value}</span>
            ) : null}
          </div>
        </div>
      </div>
    )
  },
})
