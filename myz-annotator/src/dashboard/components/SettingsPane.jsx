import { computed, defineComponent, reactive, ref, watch } from "vue";
import { useDashboardStore } from "../store/useDashboardStore.js";
import AiSettings from "./AiSettings.jsx";
import LogseqSyncSection from "./settings/LogseqSyncSection.jsx";
import ImportHighlightsSection from "./settings/ImportHighlightsSection.jsx";
import InternetArchiveSection from "./settings/InternetArchiveSection.jsx";
import ArchiveQueueSection from "./settings/ArchiveQueueSection.jsx";
import ArchiveHistorySection from "./settings/ArchiveHistorySection.jsx";
import VectorSearchSection from "./settings/VectorSearchSection.jsx";

export default defineComponent({
  name: "SettingsPane",
  props: {
    active: {
      type: Boolean,
      default: false,
    },
  },
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
    const importFileRef = ref(null);
    const importStrategy = ref("skip");
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

    async function handleSyncToggle(event) {
      const enabled = event.target.checked;
      try {
        await store.toggleSync(enabled);
      } catch (error) {
        // toggleSync already reverts on failure; keep checkbox in sync
        event.target.checked = store.settings.logseqSyncEnabled;
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

    async function handleArchiveToggle(event) {
      const enabled = event.target.checked;
      try {
        await store.toggleInternetArchive(enabled);
      } catch (error) {
        event.target.checked = store.settings.internetArchiveEnabled;
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

    function queueStatusTone(entry) {
      const status = (entry?.status || "queued").toLowerCase();
      if (status.includes("error") || status.includes("fail")) {
        return "error";
      }
      if (status.includes("complete") || status.includes("done")) {
        return "success";
      }
      if (status.includes("pending") || status.includes("processing")) {
        return "info";
      }
      return "info";
    }

    function queueStatusLabel(entry) {
      const status = (entry?.status || "queued").toLowerCase();
      if (status.includes("error") || status.includes("fail")) {
        return "失败";
      }
      if (status.includes("complete") || status.includes("done")) {
        return "完成";
      }
      if (status.includes("pending")) {
        return "等待存档";
      }
      if (status.includes("processing")) {
        return "处理中";
      }
      return "排队中";
    }

    function historyStatusTone(entry) {
      if (!entry) {
        return "info";
      }
      if (entry.status === "error" || entry.success === false) {
        return "error";
      }
      if (entry.status === "success" || entry.success === true) {
        return "success";
      }
      return "info";
    }

    function historyStatusLabel(entry) {
      if (!entry) {
        return "记录";
      }
      if (entry.status === "success" || entry.success === true) {
        return "成功";
      }
      if (entry.status === "error" || entry.success === false) {
        return "失败";
      }
      return "记录";
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
    async function handleAiSaveSettings(payload) {
      try {
        store.settingsStatus.value = "保存中...";
        await store.saveSettings(payload);
        store.settingsStatus.value = "设置已保存";
        setTimeout(() => {
          store.settingsStatus.value = "";
        }, 3000);
      } catch (error) {
        store.settingsStatus.value = `保存失败：${error.message}`;
        throw error;
      }
    }

    async function handleAiTestConnection(settings) {
      return await store.testAiConnection(settings);
    }

    function handleCloseSettings() {
      store.showHighlights();
    }

    watch(
      () => props.active,
      (isActive) => {
        if (!isActive) {
          return;
        }
        ensureArchiveActivity({ force: archiveLoaded.value });
      },
      { immediate: true },
    );

    return () => (
      <section
        id="settings-view"
        class={[
          "rounded-3xl border border-slate-200 bg-white/95 p-5 shadow-2xl transition dark:border-white/10 dark:bg-slate-900/60",
          props.active ? "block" : "hidden",
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
            onUpdateStatus={(value) => (store.settingsStatus.value = value)}
          />

          <VectorSearchSection
            enabled={store.settings.vectorSearchEnabled}
            modelReady={store.settings.vectorModelReady}
            loading={store.vectorModelLoading.value}
            status={store.vectorModelStatus.value}
            onToggle={store.toggleVectorSearch}
            onLoad={store.loadVectorModel}
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
            queueStatusTone={queueStatusTone}
            queueStatusLabel={queueStatusLabel}
            formatDateTime={store.formatDateTime}
          />

          <ArchiveHistorySection
            entries={archiveHistoryEntries.value}
            loading={archiveLoading.value}
            metaLabel={
              archiveHistoryEntries.value.length
                ? `显示最近 ${archiveHistoryEntries.value.length} 条记录`
                : ""
            }
            describeAction={store.describeArchiveAction}
            historyStatusTone={historyStatusTone}
            historyStatusLabel={historyStatusLabel}
            formatDateTime={store.formatDateTime}
          />
        </div>
      </section>
    );
  },
});
