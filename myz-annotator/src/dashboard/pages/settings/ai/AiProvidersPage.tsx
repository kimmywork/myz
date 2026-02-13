import { defineComponent } from "vue"
import AiProviderList from "../../../components/ai-settings/AiProviderList.jsx"
import AiProviderEditor from "../../../components/ai-settings/AiProviderEditor.jsx"
import { useAiSettingsContext } from "./aiSettingsContext.js"

export default defineComponent({
  name: "AiProvidersPage",
  setup() {
    const context = useAiSettingsContext()

    return () => (
      <div class="rounded-2xl border border-slate-200 bg-slate-50/60 p-4 shadow-sm dark:border-white/10 dark:bg-slate-800/40">
        <div class="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p class="text-sm font-medium text-slate-900 dark:text-white">Provider</p>
            <p class="text-xs text-slate-500 dark:text-slate-400">
              需测试通过后才能启用 Provider；模型可从 /models 加载并配置能力与 token 参数。
            </p>
          </div>
          <div class="flex items-center justify-end gap-2">
            {context.providerSaveNotice.value ? (
              <span class="text-xs text-emerald-600">
                {context.providerSaveNotice.value}
              </span>
            ) : null}
            <button
              type="button"
              class="btn btn-primary whitespace-nowrap"
              onClick={context.saveProvidersSection}
            >
              保存
            </button>
          </div>
        </div>

        <div class="grid gap-4 md:grid-cols-3">
          <AiProviderList
            providers={context.providers.value}
            selectedProviderId={context.selectedProviderId.value}
            usedByMap={context.usedByMap.value}
            onSelect={(id) => (context.selectedProviderId.value = id)}
            onAdd={context.addProvider}
            onRemove={context.removeProvider}
            onRename={context.renameProvider}
          />

          <div class="md:col-span-2 space-y-3">
            {context.selectedProvider.value ? (
              <AiProviderEditor
                provider={context.selectedProvider.value}
                catalog={context.selectedCatalog.value}
                isFetchingModels={context.isFetchingModels.value}
                isTesting={context.isTesting.value}
                statusMessage={context.catalogStatusMessage.value}
                onChange={context.replaceProvider}
                onFetchModels={context.fetchModels}
                onTestConnection={context.testConnection}
              />
            ) : (
              <div class="rounded-2xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-slate-900/60">
                <p class="text-sm text-slate-500">请选择或添加 Provider</p>
              </div>
            )}
          </div>
        </div>
      </div>
    )
  },
})
