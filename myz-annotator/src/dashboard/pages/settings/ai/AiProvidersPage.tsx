import { defineComponent } from "vue";
import {
  AiProviderEditor,
  AiProvidersPanel,
} from "@myz/dashboard-ai-settings";
import { useAiSettingsContext } from "./aiSettingsContext.js";

export default defineComponent({
  name: "AiProvidersPage",
  setup() {
    const context = useAiSettingsContext();

    return () => (
      <AiProvidersPanel
        title="Provider"
        description="需测试通过后才能启用 Provider；模型可从 /models 加载并配置能力与 token 参数。"
        providers={context.providers.value}
        selectedProviderId={context.selectedProviderId.value}
        usedByMap={context.usedByMap.value}
        saveNotice={context.providerSaveNotice.value}
        onSelect={(id) => (context.selectedProviderId.value = id)}
        onAdd={context.addProvider}
        onRemove={context.removeProvider}
        onRename={context.renameProvider}
        onSave={context.saveProvidersSection}
        renderEditor={() =>
          context.selectedProvider.value ? (
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
          )
        }
      />
    );
  },
});
