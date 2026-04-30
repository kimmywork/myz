import { defineComponent } from "vue";
import {
  AiProviderEditor,
  AiProvidersPanel,
} from "@myz/dashboard-ai-settings";
import { useAiSettingsContext } from "./aiSettingsContext";

export default defineComponent({
  name: "AiProvidersPage",
  setup() {
    const context = useAiSettingsContext();

    return () => (
      <AiProvidersPanel
        title="Provider"
        description="桌面端会保存 Provider / Model 配置，并可直接对当前选中的模型执行连接测试。"
        providers={context.providers.value}
        selectedProviderId={context.selectedProviderId.value}
        usedByMap={context.usedByMap.value}
        saveNotice={context.providerSaveNotice.value}
        onSelect={(id) => {
          context.selectedProviderId.value = id;
        }}
        onAdd={context.addProvider}
        onRemove={context.removeProvider}
        onRename={context.renameProvider}
        onSave={context.saveProvidersSection}
        renderHeaderExtras={() =>
          context.providerTestNotice.value ? (
            <span class="text-xs text-slate-500 dark:text-slate-400">
              {context.providerTestNotice.value}
            </span>
          ) : null
        }
        renderEditor={() =>
          context.selectedProvider.value ? (
            <AiProviderEditor
              provider={context.selectedProvider.value}
              onChange={context.replaceProvider}
              catalog={context.selectedCatalog.value}
              isFetchingModels={context.isFetchingModels.value}
              statusMessage={context.catalogStatusMessage.value}
              onFetchModels={() =>
                context.fetchModelsForProvider(
                  context.selectedProvider.value!.id,
                )
              }
              isTesting={
                context.testingProviderId.value ===
                context.selectedProvider.value.id
              }
              onTestConnection={(model) =>
                context.runProviderConnectionTest(
                  context.selectedProvider.value!.id,
                  model,
                )
              }
            />
          ) : (
            <div class="rounded-2xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-slate-900/60">
              <p class="text-sm text-slate-500 dark:text-slate-400">
                请选择或添加 Provider
              </p>
            </div>
          )
        }
      />
    );
  },
});
