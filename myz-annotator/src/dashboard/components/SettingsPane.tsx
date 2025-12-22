import { computed, defineComponent, reactive, Ref, ref, watch } from "vue";
import { ImportStrategy } from "../store/index.js";
import { Settings } from "@/background/settings.js";
import { useDashboardStore } from "../store/useDashboardStore.js";
import AiSettings from "./AiSettings.jsx";
import ArchiveHistorySection from "./settings/ArchiveHistorySection.jsx";
import ArchiveQueueSection from "./settings/ArchiveQueueSection.jsx";
import ImportHighlightsSection from "./settings/ImportHighlightsSection.jsx";
import InternetArchiveSection from "./settings/InternetArchiveSection.jsx";
import LogseqSyncSection from "./settings/LogseqSyncSection.jsx";
import VectorSearchSection from "./settings/VectorSearchSection.jsx";

export default defineComponent({
  name: "SettingsPane",
  setup(props) {
    const store = useDashboardStore();
    const form = reactive({
      logseqEndpoint: "",
      logseqPage: "",
      logseqAuthToken: "",
      logseqGraph: "",
      internetArchiveAccessKey: "",
      internetArchiveAccessSecret: "",
    });
    const importFileRef: Ref<HTMLInputElement | null> = ref(null);
    const importStrategy: Ref<ImportStrategy> = ref("skip");
    const isImporting = ref(false);
    const archiveLoaded = ref(false);
    const archiveLoading = computed(() => store.archiveMetaLoading.value);
    const archiveStatus = computed(() => store.archiveMetaStatus.value);
    const archiveQueueEntries = computed(() => {
      const list = store.archiveQueueWithPosition.value;
      return Array.isArray(list) ? list : [];
    });
    const archiveHistoryEntries = computed(() => {
      const list = store.archiveHistorySorted.value;
      return Array.isArray(list) ? list : [];
    });

    const syncEnabled = computed(() => store.settings.logseqSyncEnabled);
    const archiveEnabled = computed(
      () => store.settings.internetArchiveEnabled,
    );

    watch(
      () => store.settings,
      (settings) => {
        form.logseqEndpoint = settings.logseqEndpoint || "";
        form.logseqPage = settings.logseqPage || "MyZ Inbox";
        form.logseqAuthToken = settings.logseqAuthToken || "";
        form.logseqGraph = settings.logseqGraph || "";
        form.internetArchiveAccessKey = settings.internetArchiveAccessKey || "";
        form.internetArchiveAccessSecret =
          settings.internetArchiveAccessSecret || "";
      },
      { immediate: true, deep: true },
    );

    async function handleSyncToggle(event: Event) {
      const enabled = (event.target as HTMLInputElement).checked;
      try {
        await store.toggleSync(enabled);
      } catch (error) {
        // toggleSync already reverts on failure; keep checkbox in sync
        (event.target as HTMLInputElement).checked =
          store.settings.logseqSyncEnabled;
      }
    }

    async function handleSaveSettings() {
      try {
        await store.saveSettings({
          logseqEndpoint: form.logseqEndpoint.trim(),
          logseqPage: form.logseqPage.trim(),
          logseqAuthToken: form.logseqAuthToken.trim(),
          logseqGraph: form.logseqGraph.trim(),
          logseqSyncEnabled: store.settings.logseqSyncEnabled,
        });
      } catch (error) {
        // status already surfaced
      }
    }

    async function handleArchiveToggle(event: Event) {
      const enabled = (event.target as HTMLInputElement).checked;
      try {
        await store.toggleInternetArchive(enabled);
      } catch (error) {
        (event.target as HTMLInputElement).checked =
          store.settings.internetArchiveEnabled;
      }
    }

    async function handleSaveArchiveSettings() {
      try {
        await store.saveSettings({
          internetArchiveEnabled: store.settings.internetArchiveEnabled,
          internetArchiveAccessKey: form.internetArchiveAccessKey.trim(),
          internetArchiveAccessSecret: form.internetArchiveAccessSecret.trim(),
        });
      } catch (error) {
        // status already surfaced
      }
    }

    async function ensureArchiveActivity({ force = false } = {}) {
      try {
        if (force) {
          await store.refreshArchiveActivity();
        } else {
          await store.loadArchiveActivity();
        }
        archiveLoaded.value = true;
      } catch (error) {
        // error state already reflected in archiveStatus
      }
    }

    async function handleRefreshArchive() {
      await ensureArchiveActivity({ force: true });
    }

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
            <p class="text-sm text-slate-500 dark:text-slate-400">
              配置 LogSeq 同步与默认选项
            </p>
          </div>
          <button class="btn-link" type="button" onClick={handleCloseSettings}>
            返回标注
          </button>
        </header>

        <div class="mt-4 space-y-4">
          <LogseqSyncSection
            syncEnabled={syncEnabled.value}
            form={form}
            onToggle={handleSyncToggle}
            onUpdateField={(key, value) => (form[key] = value)}
            onSave={handleSaveSettings}
            status={store.settingsStatus.value}
          />

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

          <InternetArchiveSection
            archiveEnabled={archiveEnabled.value}
            form={form}
            onToggle={handleArchiveToggle}
            onUpdateField={(key, value) => (form[key] = value)}
            onSave={handleSaveArchiveSettings}
            status={store.settingsStatus.value}
          />

          <ArchiveQueueSection
            entries={archiveQueueEntries.value}
            loading={archiveLoading.value}
            status={archiveStatus.value}
            onRefresh={handleRefreshArchive}
          />

          <ArchiveHistorySection
            entries={archiveHistoryEntries.value}
            loading={archiveLoading.value}
            metaLabel={
              archiveHistoryEntries.value.length
                ? `显示最近 ${archiveHistoryEntries.value.length} 条记录`
                : ""
            }
          />
        </div>
      </section>
    );
  },
});
