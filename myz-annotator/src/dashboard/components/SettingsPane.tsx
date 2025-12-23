import { defineComponent, Ref, ref } from "vue";
import { useDashboardStore } from "../store/useDashboardStore.js";
import AiSettings from "./AiSettings.jsx";
import ImportHighlightsSection from "./settings/ImportHighlightsSection.jsx";
import VectorSearchSection from "./settings/VectorSearchSection.jsx";
import { ImportStrategy } from "@/background/import.js";
import { Settings } from "@/background/settings.js";

export default defineComponent({
  name: "SettingsPane",
  setup(props) {
    const store = useDashboardStore();
    const importFileRef: Ref<HTMLInputElement | null> = ref(null);
    const importStrategy: Ref<ImportStrategy> = ref("skip");
    const isImporting = ref(false);

    async function handleImport() {
      const fileInput = importFileRef.value;
      const file = fileInput?.files?.[0];
      isImporting.value = true;
      try {
        await store.importHighlightsFromFile(file, importStrategy.value);
        if (fileInput) {
          fileInput.value = "";
        }
      } catch (error) {
        // status already surfaced by store
      } finally {
        isImporting.value = false;
      }
    }

    // AI Settings handlers
    async function handleAiSaveSettings(payload: Partial<Settings>) {
      try {
        store.settingsStatus.value = "保存中...";
        await store.saveSettings(payload);
        store.settingsStatus.value = "设置已保存";
        setTimeout(() => {
          store.settingsStatus.value = "";
        }, 3000);
      } catch (error) {
        store.settingsStatus.value = `保存失败：${(error as Error).message}`;
        throw error;
      }
    }

    async function handleAiTestConnection(settings: Partial<Settings>) {
      return await store.testAiConnection(settings);
    }

    function handleCloseSettings() {
      store.showHighlights();
    }

    async function handleVectorToggle(enabled: boolean) {
      await store.toggleVectorSearch(enabled);
    }

    async function handleVectorLoad() {
      await store.loadVectorModel();
    }

    async function handleVectorRebuild() {
      await store.rebuildVectorIndex();
    }

    async function handleVectorTest(payload: Partial<Settings>) {
      await store.testVectorProvider(payload);
    }

    async function handleVectorSave(payload: Partial<Settings>) {
      await store.saveSettings(payload);
    }

    async function handleVectorSwitch(payload: Partial<Settings>) {
      await store.switchVectorProvider(payload);
    }

    return () => (
      <section
        id="settings-view"
        class={[
          "rounded-3xl border border-slate-200 bg-white/95 p-5 shadow-2xl transition dark:border-white/10 dark:bg-slate-900/60",
        ].join(" ")}
        aria-labelledby="settings-title"
      >
        <header class="flex flex-col gap-2 border-b border-slate-200 pb-4 sm:flex-row sm:items-center sm:justify-between dark:border-white/5">
          <div>
            <h2
              id="settings-title"
              class="text-xl font-semibold text-slate-900 dark:text-white"
            >
              设置
            </h2>
            <p class="text-sm text-slate-500 dark:text-slate-400">配置选项</p>
          </div>
          <button class="btn-link" type="button" onClick={handleCloseSettings}>
            返回标注
          </button>
        </header>

        <div class="mt-4 space-y-4">
          <ImportHighlightsSection
            importFileRef={importFileRef}
            importStrategy={importStrategy.value}
            onStrategyChange={(value) => (importStrategy.value = value)}
            onImport={handleImport}
            isImporting={isImporting.value}
            status={store.importStatus}
          />

          <AiSettings
            settings={store.settings}
            onSave={handleAiSaveSettings}
            onTestConnection={handleAiTestConnection}
            status={store.settingsStatus.value}
            onUpdateStatus={(value: any) =>
              (store.settingsStatus.value = value as string)
            }
          />

          <VectorSearchSection
            settings={store.settings}
            loading={store.vectorModelLoading.value}
            status={store.vectorModelStatus.value}
            onToggleEnable={handleVectorToggle}
            onLoadLocal={handleVectorLoad}
            onRebuild={handleVectorRebuild}
            onTestOpenAi={handleVectorTest}
            onSave={handleVectorSave}
            onSwitchProvider={handleVectorSwitch}
          />
        </div>
      </section>
    );
  },
});
