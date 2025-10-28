import { computed, defineComponent, reactive, ref, watch } from "vue";
import { useDashboardStore } from "../store/useDashboardStore.js";

export default defineComponent({
  name: "SettingsPane",
  props: {
    active: {
      type: Boolean,
      default: false
    }
  },
  setup(props) {
    const store = useDashboardStore();
    const form = reactive({
      logseqEndpoint: "",
      logseqPage: "",
      logseqAuthToken: "",
      logseqGraph: ""
    });
    const importFileRef = ref(null);
    const importStrategy = ref("skip");
    const isImporting = ref(false);

    const syncEnabled = computed(() => store.settings.logseqSyncEnabled);

    watch(
      () => store.settings,
      (settings) => {
        form.logseqEndpoint = settings.logseqEndpoint || "";
        form.logseqPage = settings.logseqPage || "MyZ Inbox";
        form.logseqAuthToken = settings.logseqAuthToken || "";
        form.logseqGraph = settings.logseqGraph || "";
      },
      { immediate: true, deep: true }
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
          logseqSyncEnabled: store.settings.logseqSyncEnabled
        });
      } catch (error) {
        // status already surfaced
      }
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

    function handleCloseSettings() {
      store.showHighlights();
    }

    return () => (
      <section
        id="settings-view"
        class={[
          "main__section",
          "main__section--settings",
          props.active ? "is-active" : "is-hidden"
        ].join(" ")}
        aria-labelledby="settings-title"
      >
        <header class="settings__header">
          <div>
            <h2 id="settings-title">设置</h2>
            <p class="settings__subtitle">配置 LogSeq 同步与默认选项</p>
          </div>
          <button class="btn-link" type="button" onClick={handleCloseSettings}>
            返回标注
          </button>
        </header>

        <div class="settings__content">
          <section class="settings__group">
            <div class="settings__group-header">
              <h3>LogSeq 同步</h3>
              <label class="toggle">
                <input type="checkbox" checked={syncEnabled.value} onChange={handleSyncToggle} />
                <span>启用同步</span>
              </label>
            </div>
            <div class={"settings__fields" + (syncEnabled.value ? "" : " is-disabled")}>
              <label class="field">
                <span>服务器地址</span>
                <input
                  type="url"
                  placeholder="http://127.0.0.1:12315/api"
                  value={form.logseqEndpoint}
                  disabled={!syncEnabled.value}
                  onInput={(event) => (form.logseqEndpoint = event.target.value)}
                />
              </label>
              <label class="field">
                <span>目标页面</span>
                <input
                  type="text"
                  placeholder="MyZ Inbox"
                  value={form.logseqPage}
                  disabled={!syncEnabled.value}
                  onInput={(event) => (form.logseqPage = event.target.value)}
                />
              </label>
              <label class="field">
                <span>Graph 名称 (可选)</span>
                <input
                  type="text"
                  placeholder="默认 graph"
                  value={form.logseqGraph}
                  disabled={!syncEnabled.value}
                  onInput={(event) => (form.logseqGraph = event.target.value)}
                />
              </label>
              <label class="field">
                <span>认证 Token (可选)</span>
                <input
                  type="text"
                  placeholder="Bearer ..."
                  value={form.logseqAuthToken}
                  disabled={!syncEnabled.value}
                  onInput={(event) => (form.logseqAuthToken = event.target.value)}
                />
              </label>
              <div class="settings__actions">
                <button class="btn btn-primary" type="button" onClick={handleSaveSettings}>
                  保存设置
                </button>
                <p class="status-line">{store.settingsStatus.value}</p>
              </div>
            </div>
          </section>

          <section class="settings__group">
            <div class="settings__group-header">
              <h3>导入标注</h3>
            </div>
            <div class="settings__fields">
              <p class="settings__hint">选择先前导出的 JSON 文件，或导入他人分享的标注。</p>
              <label class="field">
                <span>JSON 文件</span>
                <input ref={importFileRef} type="file" accept="application/json" />
              </label>
              <label class="field">
                <span>冲突处理</span>
                <select value={importStrategy.value} onChange={(event) => (importStrategy.value = event.target.value)}>
                  <option value="skip">遇到重复时跳过</option>
                  <option value="overwrite">遇到重复时覆盖</option>
                  <option value="latest">保留最近更新</option>
                </select>
              </label>
              <div class="settings__actions">
                <button class="btn" type="button" disabled={isImporting.value} onClick={handleImport}>
                  {isImporting.value ? "导入中…" : "导入 JSON"}
                </button>
                <p class={"status-line" + (store.importStatus.tone === "error" ? " status-line--error" : store.importStatus.tone === "success" ? " status-line--success" : "")}>
                  {store.importStatus.message}
                </p>
              </div>
            </div>
          </section>
        </div>
      </section>
    );
  }
});
