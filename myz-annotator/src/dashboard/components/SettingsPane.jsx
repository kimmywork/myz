import { computed, defineComponent, reactive, ref, watch } from "vue";
import { useDashboardStore } from "../store/useDashboardStore.js";

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
          "main__section",
          "main__section--settings",
          props.active ? "is-active" : "is-hidden",
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
                <input
                  type="checkbox"
                  checked={syncEnabled.value}
                  onChange={handleSyncToggle}
                />
                <span>启用同步</span>
              </label>
            </div>
            <div
              class={
                "settings__fields" + (syncEnabled.value ? "" : " is-disabled")
              }
            >
              <label class="field">
                <span>服务器地址</span>
                <input
                  type="url"
                  placeholder="http://127.0.0.1:12315/api"
                  value={form.logseqEndpoint}
                  disabled={!syncEnabled.value}
                  onInput={(event) =>
                    (form.logseqEndpoint = event.target.value)
                  }
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
                  onInput={(event) =>
                    (form.logseqAuthToken = event.target.value)
                  }
                />
              </label>
              <div class="settings__actions">
                <button
                  class="btn btn-primary"
                  type="button"
                  onClick={handleSaveSettings}
                >
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
              <p class="settings__hint">
                选择先前导出的 JSON 文件，或导入他人分享的标注。
              </p>
              <label class="field">
                <span>JSON 文件</span>
                <input
                  ref={importFileRef}
                  type="file"
                  accept="application/json"
                />
              </label>
              <label class="field">
                <span>冲突处理</span>
                <select
                  value={importStrategy.value}
                  onChange={(event) =>
                    (importStrategy.value = event.target.value)
                  }
                >
                  <option value="skip">遇到重复时跳过</option>
                  <option value="overwrite">遇到重复时覆盖</option>
                  <option value="latest">保留最近更新</option>
                </select>
              </label>
              <div class="settings__actions">
                <button
                  class="btn"
                  type="button"
                  disabled={isImporting.value}
                  onClick={handleImport}
                >
                  {isImporting.value ? "导入中…" : "导入 JSON"}
                </button>
                <p
                  class={
                    "status-line" +
                    (store.importStatus.tone === "error"
                      ? " status-line--error"
                      : store.importStatus.tone === "success"
                        ? " status-line--success"
                        : "")
                  }
                >
                  {store.importStatus.message}
                </p>
              </div>
            </div>
          </section>

          <section class="settings__group">
            <div class="settings__group-header">
              <h3>Internet Archive 保存</h3>
              <label class="toggle">
                <input
                  type="checkbox"
                  checked={archiveEnabled.value}
                  onChange={handleArchiveToggle}
                />
                <span>启用保存</span>
              </label>
            </div>
            <div
              class={
                "settings__fields" +
                (archiveEnabled.value ? "" : " is-disabled")
              }
            >
              <label class="field">
                <span>Access Key (可选)</span>
                <input
                  type="text"
                  placeholder="Internet Archive Access Key"
                  value={form.internetArchiveAccessKey}
                  disabled={!archiveEnabled.value}
                  onInput={(event) =>
                    (form.internetArchiveAccessKey = event.target.value)
                  }
                />
              </label>
              <label class="field">
                <span>Access Secret (可选)</span>
                <input
                  type="password"
                  placeholder="Internet Archive Access Secret"
                  value={form.internetArchiveAccessSecret}
                  disabled={!archiveEnabled.value}
                  onInput={(event) =>
                    (form.internetArchiveAccessSecret = event.target.value)
                  }
                />
              </label>
              <div class="settings__actions">
                <button
                  class="btn btn-primary"
                  type="button"
                  onClick={handleSaveArchiveSettings}
                  disabled={!archiveEnabled.value}
                >
                  保存 Internet Archive 设置
                </button>
                <p class="status-line">{store.settingsStatus.value}</p>
              </div>
            </div>
          </section>

          <section class="settings__group">
            <div class="settings__group-header">
              <h3>保存队列</h3>
              <div class="settings__group-actions">
                <button
                  class="btn btn-secondary"
                  type="button"
                  onClick={handleRefreshArchive}
                  disabled={archiveLoading.value}
                >
                  {archiveLoading.value ? "刷新中…" : "刷新数据"}
                </button>
              </div>
            </div>
            <div class="settings__fields settings__fields--compact">
              {archiveStatus.value ? (
                <p class="status-line status-line--error">
                  {archiveStatus.value}
                </p>
              ) : null}
              {archiveLoading.value ? (
                <p class="settings__hint">加载中…</p>
              ) : archiveQueueEntries.value.length ? (
                <ul class="settings__list">
                  {archiveQueueEntries.value.map((item) => (
                    <li class="settings__list-item" key={item.id}>
                      <div class="settings__list-row">
                        <span class="settings__list-title" title={item.url}>
                          {item.url}
                        </span>
                        <span
                          class={[
                            "settings__pill",
                            `settings__pill--${queueStatusTone(item)}`,
                          ].join(" ")}
                        >
                          {queueStatusLabel(item)}
                        </span>
                      </div>
                      <div class="settings__list-meta">
                        <span>排队序号 #{item.position + 1}</span>
                        {item.requestedAt ? (
                          <span>
                            加入时间 {store.formatDateTime(item.requestedAt)}
                          </span>
                        ) : null}
                        <span>尝试 {item.attempts ?? 0} 次</span>
                        {item.force ? (
                          <span class="settings__pill settings__pill--accent">
                            强制
                          </span>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p class="settings__empty">暂无排队的保存请求</p>
              )}
            </div>
          </section>

          <section class="settings__group">
            <div class="settings__group-header">
              <h3>请求历史</h3>
              {archiveHistoryEntries.value.length ? (
                <span class="settings__group-meta">
                  显示最近 {archiveHistoryEntries.value.length} 条记录
                </span>
              ) : null}
            </div>
            <div class="settings__fields settings__fields--compact">
              {archiveLoading.value ? (
                <p class="settings__hint">加载中…</p>
              ) : archiveHistoryEntries.value.length ? (
                <ul class="settings__list">
                  {archiveHistoryEntries.value.map((item) => (
                    <li class="settings__list-item" key={item.id}>
                      <div class="settings__list-row">
                        <span class="settings__list-title">
                          {item.message ||
                            store.describeArchiveAction(item.action)}
                        </span>
                        <span
                          class={[
                            "settings__pill",
                            `settings__pill--${historyStatusTone(item)}`,
                          ].join(" ")}
                        >
                          {historyStatusLabel(item)}
                        </span>
                      </div>
                      <div class="settings__list-meta">
                        {item.timestamp ? (
                          <span>{store.formatDateTime(item.timestamp)}</span>
                        ) : null}
                        <span>{store.describeArchiveAction(item.action)}</span>
                        {typeof item.statusCode === "number" ? (
                          <span>HTTP {item.statusCode}</span>
                        ) : null}
                      </div>
                      <div class="settings__list-url" title={item.url}>
                        {item.url}
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p class="settings__empty">暂无请求记录</p>
              )}
            </div>
          </section>
        </div>
      </section>
    );
  },
});
