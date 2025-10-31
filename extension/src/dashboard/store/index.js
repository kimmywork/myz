import { computed, reactive, ref, watch } from "vue";
import { IMPORT_MAX_BYTES, PAGINATION_BATCH } from "../constants.js";
import {
  computeRecordStats,
  formatDateTime,
  formatInline,
  formatNote,
  getRecordKind,
  getSearchTerms,
  groupHighlightsByDate,
  normalizeRecord,
  recordToMarkdown,
  renderHighlightContent,
  RECORD_KINDS,
} from "../utils/records.js";
import { sendMessage } from "../utils/messaging.js";
import { downloadFile } from "../utils/download.js";
import { normalizeImportedPayload } from "../utils/import.js";
import { DEFAULT_COLOR } from "../../shared/highlightUtils.js";

export const DashboardStoreKey = Symbol("DashboardStore");

export function createDashboardStore() {
  const highlights = ref([]);
  const loadingHighlights = ref(true);
  const filters = reactive({
    search: "",
    site: "",
    tags: [],
    from: "",
    to: "",
  });
  const view = ref("cards");
  const panel = ref("highlights");
  const renderedCount = ref(0);
  const settings = reactive({
    logseqEndpoint: "",
    logseqPage: "MyZ Inbox",
    logseqAuthToken: "",
    logseqGraph: "",
    logseqSyncEnabled: false,
    dashboardView: "cards",
  });
  const logseqStatus = ref("");
  const settingsStatus = ref("");
  const importStatus = reactive({ message: "", tone: "info" });
  const isSyncInFlight = ref(false);

  const modalState = reactive({
    recordId: "",
    mode: "view",
    note: "",
    tags: [],
    color: DEFAULT_COLOR,
    status: "",
    saving: false,
  });

  const timers = new Map();

  const searchNeedle = computed(() => filters.search.trim().toLowerCase());
  const searchTerms = computed(() => getSearchTerms(filters.search));

  const filteredHighlights = computed(() => {
    const needle = searchNeedle.value;
    const siteFilter = filters.site;
    const tagsFilter = filters.tags;
    const from = filters.from;
    const to = filters.to;
    return highlights.value.filter((item) => {
      if (!item) {
        return false;
      }
      if (siteFilter && item.hostname !== siteFilter) {
        return false;
      }
      if (tagsFilter.length) {
        const itemTags = new Set(item.tags || []);
        if (!tagsFilter.every((tag) => itemTags.has(tag))) {
          return false;
        }
      }
      if (from) {
        const itemDate = item.createdAt ? item.createdAt.slice(0, 10) : "";
        if (itemDate < from) {
          return false;
        }
      }
      if (to) {
        const itemDate = item.createdAt ? item.createdAt.slice(0, 10) : "";
        if (itemDate > to) {
          return false;
        }
      }
      if (needle) {
        const haystack = [item.text, item.note, (item.tags || []).join(" ")]
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(needle)) {
          return false;
        }
      }
      return true;
    });
  });

  const hasMoreHighlights = computed(
    () => renderedCount.value < filteredHighlights.value.length,
  );

  const visibleHighlights = computed(() => {
    if (!filteredHighlights.value.length) {
      return [];
    }
    const limit =
      renderedCount.value ||
      Math.min(PAGINATION_BATCH, filteredHighlights.value.length);
    return filteredHighlights.value.slice(0, limit);
  });

  const groupedHighlights = computed(() => {
    return groupHighlightsByDate(visibleHighlights.value).map(
      ([date, items]) => {
        const stats = computeRecordStats(items);
        const detail = [];
        if (stats.highlightCount) {
          detail.push(`高亮 ${stats.highlightCount}`);
        }
        if (stats.savedCount) {
          detail.push(`保存 ${stats.savedCount}`);
        }
        return {
          date,
          items,
          stats,
          detailText: detail.length ? `（${detail.join(" · ")}）` : "",
        };
      },
    );
  });

  const summaryText = computed(() => {
    const stats = computeRecordStats(filteredHighlights.value);
    const sites = new Set(
      filteredHighlights.value.map((item) => item.hostname).filter(Boolean),
    );
    const parts = [];
    if (stats.highlightCount) {
      parts.push(`高亮 ${stats.highlightCount}`);
    }
    if (stats.savedCount) {
      parts.push(`保存 ${stats.savedCount}`);
    }
    const detail = parts.length ? `（${parts.join(" · ")}）` : "";
    return `共 ${stats.total} 条记录${detail} · 涉及 ${sites.size} 个站点`;
  });

  const availableSites = computed(() => {
    return [
      ...new Set(highlights.value.map((item) => item.hostname).filter(Boolean)),
    ].sort((a, b) => a.localeCompare(b));
  });

  const availableTags = computed(() => {
    const set = new Set();
    highlights.value.forEach((item) => {
      (item.tags || []).forEach((tag) => set.add(tag));
    });
    return [...set].sort((a, b) => a.localeCompare(b));
  });

  function setTimedStatus(target, message, duration = 3000) {
    target.value = message;
    if (timers.has(target)) {
      clearTimeout(timers.get(target));
    }
    if (duration > 0) {
      const id = setTimeout(() => {
        target.value = "";
        timers.delete(target);
      }, duration);
      timers.set(target, id);
    }
  }

  function setTimedImportStatus(message, tone = "info", duration = 3000) {
    importStatus.message = message;
    importStatus.tone = tone;
    if (timers.has(importStatus)) {
      clearTimeout(timers.get(importStatus));
    }
    if (duration > 0) {
      const id = setTimeout(() => {
        importStatus.message = "";
        importStatus.tone = "info";
        timers.delete(importStatus);
      }, duration);
      timers.set(importStatus, id);
    }
  }

  function updateRenderedCount({ preserve } = {}) {
    if (preserve) {
      renderedCount.value = Math.min(
        renderedCount.value || PAGINATION_BATCH,
        filteredHighlights.value.length,
      );
      return;
    }
    renderedCount.value = filteredHighlights.value.length
      ? Math.min(PAGINATION_BATCH, filteredHighlights.value.length)
      : 0;
  }

  watch(filteredHighlights, () => {
    updateRenderedCount({ preserve: true });
  });

  async function loadHighlights() {
    loadingHighlights.value = true;
    try {
      const result = await sendMessage("myz:getAllHighlights");
      highlights.value = Array.isArray(result)
        ? result
            .map((item) => normalizeRecord(item))
            .filter(Boolean)
            .map((item) => ({ ...item, kind: getRecordKind(item) }))
        : [];
      updateRenderedCount();
    } catch (error) {
      console.error("Failed to load highlights", error);
      highlights.value = [];
      updateRenderedCount();
      throw error;
    } finally {
      loadingHighlights.value = false;
    }
  }

  async function refreshHighlights({ preserveProgress = false } = {}) {
    await loadHighlights();
    updateRenderedCount({ preserve: preserveProgress });
  }

  async function loadSettings() {
    try {
      const result = await sendMessage("myz:getSettings");
      if (!result) {
        return;
      }
      Object.assign(settings, {
        logseqEndpoint: result.logseqEndpoint || "",
        logseqPage: result.logseqPage || settings.logseqPage,
        logseqAuthToken: result.logseqAuthToken || "",
        logseqGraph: result.logseqGraph || "",
        logseqSyncEnabled: Boolean(result.logseqSyncEnabled),
        dashboardView: result.dashboardView || settings.dashboardView,
      });
      if (settings.dashboardView) {
        view.value = settings.dashboardView;
      }
    } catch (error) {
      console.error("Failed to load settings", error);
    }
  }

  async function initialize() {
    await Promise.all([loadSettings(), loadHighlights()]);
  }

  function setFilter(key, value) {
    if (key === "tags") {
      filters.tags = Array.isArray(value) ? value : [];
    } else if (key in filters) {
      filters[key] = value;
    }
    updateRenderedCount();
  }

  function resetFilters() {
    filters.search = "";
    filters.site = "";
    filters.tags = [];
    filters.from = "";
    filters.to = "";
    updateRenderedCount();
  }

  async function persistDashboardView(nextView) {
    try {
      await sendMessage("myz:updateSettings", { dashboardView: nextView });
    } catch (error) {
      console.warn("Failed to persist dashboard view", error);
    }
  }

  function setView(nextView, { persist = true } = {}) {
    if (!nextView || view.value === nextView) {
      return;
    }
    view.value = nextView;
    if (persist) {
      persistDashboardView(nextView);
    }
  }

  function showSettings() {
    panel.value = "settings";
  }

  function showHighlights() {
    panel.value = "highlights";
  }

  async function copyHighlight(id) {
    const record = highlights.value.find((item) => item.id === id);
    if (!record) {
      return;
    }
    const markdown = recordToMarkdown(record);
    try {
      await navigator.clipboard.writeText(markdown);
      setTimedStatus(logseqStatus, "已复制到剪贴板", 2000);
    } catch (error) {
      console.error("复制失败", error);
      setTimedStatus(logseqStatus, "复制失败", 2000);
    }
  }

  async function deleteHighlight(id) {
    try {
      await sendMessage("myz:removeHighlight", { id });
      highlights.value = highlights.value.filter((item) => item.id !== id);
      updateRenderedCount({ preserve: true });
    } catch (error) {
      console.error("删除失败", error);
      setTimedStatus(logseqStatus, `删除失败：${error.message}`);
    }
  }

  async function downgradeHighlight(id) {
    const record = highlights.value.find((item) => item.id === id);
    if (!record || getRecordKind(record) === RECORD_KINDS.CLIP) {
      return;
    }
    try {
      const updated = await sendMessage("myz:updateHighlight", {
        id,
        kind: RECORD_KINDS.CLIP,
        range: null,
        color: null,
      });
      applyUpdatedRecord(updated, { preserve: true });
      if (modalState.recordId === id) {
        openModal(id, modalState.mode);
      }
    } catch (error) {
      console.error("降级失败", error);
      setTimedStatus(logseqStatus, `降级失败：${error.message}`);
    }
  }

  function applyUpdatedRecord(updated, { preserve = false } = {}) {
    const normalized = normalizeRecord(updated);
    if (!normalized) {
      return;
    }
    const index = highlights.value.findIndex(
      (item) => item.id === normalized.id,
    );
    if (index !== -1) {
      highlights.value.splice(index, 1, {
        ...highlights.value[index],
        ...normalized,
      });
    } else {
      highlights.value.unshift(normalized);
    }
    updateRenderedCount({ preserve });
  }

  function openModal(id, mode) {
    const record = highlights.value.find((item) => item.id === id);
    if (!record) {
      return;
    }
    modalState.recordId = record.id;
    modalState.mode = mode;
    modalState.note = record.note || "";
    modalState.tags = Array.isArray(record.tags) ? [...record.tags] : [];
    modalState.color = record.color || DEFAULT_COLOR;
    modalState.status = "";
  }

  function closeModal() {
    modalState.recordId = "";
    modalState.mode = "view";
    modalState.status = "";
    modalState.saving = false;
  }

  async function saveModal() {
    if (!modalState.recordId || modalState.saving) {
      return;
    }
    const record = highlights.value.find(
      (item) => item.id === modalState.recordId,
    );
    if (!record) {
      return;
    }
    const kind = getRecordKind(record);
    const payload = {
      id: modalState.recordId,
      note: modalState.note.trim(),
      tags: [...modalState.tags],
      kind,
    };
    if (kind === RECORD_KINDS.HIGHLIGHT) {
      payload.color = modalState.color || DEFAULT_COLOR;
    } else {
      payload.color = null;
      payload.range = null;
    }
    modalState.saving = true;
    modalState.status = "保存中…";
    try {
      const updated = await sendMessage("myz:updateHighlight", payload);
      applyUpdatedRecord(updated, { preserve: true });
      modalState.status = "保存成功";
      setTimeout(() => {
        closeModal();
      }, 600);
    } catch (error) {
      modalState.status = `保存失败：${error.message}`;
    } finally {
      modalState.saving = false;
    }
  }

  async function handleExport(format) {
    try {
      const result = await sendMessage("myz:export");
      if (!result) {
        return;
      }
      if (format === "markdown") {
        downloadFile(
          result.markdown,
          "text/markdown",
          `myz-export-${Date.now()}.md`,
        );
      } else {
        downloadFile(
          result.json,
          "application/json",
          `myz-export-${Date.now()}.json`,
        );
      }
    } catch (error) {
      console.error("导出失败", error);
      setTimedStatus(logseqStatus, `导出失败：${error.message}`);
    }
  }

  async function syncLogseq(customPayload = {}) {
    if (!settings.logseqSyncEnabled) {
      setTimedStatus(logseqStatus, "请先在设置中启用同步", 3000);
      return;
    }
    if (isSyncInFlight.value) {
      return;
    }
    isSyncInFlight.value = true;
    setTimedStatus(logseqStatus, "同步中…", 0);
    try {
      const payload = {
        title: `MyZ Export ${new Date().toISOString()}`,
        endpoint:
          customPayload.endpoint ||
          settings.logseqEndpoint?.trim() ||
          undefined,
        token:
          customPayload.token || settings.logseqAuthToken?.trim() || undefined,
        page: customPayload.page || settings.logseqPage?.trim() || undefined,
      };
      const result = await sendMessage("myz:syncLogseq", payload);
      const count =
        typeof result?.inserted === "number" ? result.inserted : null;
      const message =
        typeof result?.message === "string" ? result.message : "同步成功";
      const pageName =
        typeof result?.page === "string" && result.page ? result.page : "";
      const baseText =
        count !== null && !message.includes("新增")
          ? `${message}（新增 ${count} 条）`
          : message;
      setTimedStatus(
        logseqStatus,
        pageName ? `${baseText} → ${pageName}` : baseText,
        4000,
      );
      await refreshHighlights({ preserveProgress: true });
    } catch (error) {
      console.error("同步失败", error);
      setTimedStatus(logseqStatus, `同步失败：${error.message}`, 4000);
    } finally {
      isSyncInFlight.value = false;
    }
  }

  async function toggleSync(enabled) {
    settings.logseqSyncEnabled = enabled;
    try {
      await sendMessage("myz:updateSettings", { logseqSyncEnabled: enabled });
    } catch (error) {
      console.error("Failed to update sync toggle", error);
      settings.logseqSyncEnabled = !enabled;
      setTimedStatus(settingsStatus, `更新失败：${error.message}`);
      throw error;
    }
  }

  async function saveSettings(payload) {
    settingsStatus.value = "保存中…";
    try {
      const updated = await sendMessage("myz:updateSettings", payload);
      Object.assign(settings, {
        ...settings,
        ...updated,
      });
      settingsStatus.value = "设置已保存";
      setTimeout(() => {
        settingsStatus.value = "";
      }, 3000);
    } catch (error) {
      settingsStatus.value = `保存失败：${error.message}`;
      throw error;
    }
  }

  async function importHighlightsFromFile(file, strategy) {
    if (!file) {
      setTimedImportStatus("请先选择 JSON 文件", "error");
      return;
    }
    if (file.size > IMPORT_MAX_BYTES) {
      setTimedImportStatus(
        `文件体积过大（>${Math.floor(IMPORT_MAX_BYTES / 1024 / 1024)}MB）`,
        "error",
      );
      return;
    }
    setTimedImportStatus("解析文件…", "info", 0);
    const text = await file.text();
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch (error) {
      setTimedImportStatus("JSON 格式无效", "error");
      throw error;
    }
    const records = normalizeImportedPayload(parsed);
    if (!records.length) {
      const message = "文件中未找到有效的标注数据";
      setTimedImportStatus(message, "error");
      throw new Error(message);
    }
    setTimedImportStatus("写入中…", "info", 0);
    const result = await sendMessage("myz:importHighlights", {
      records,
      strategy,
    });
    const inserted = typeof result?.inserted === "number" ? result.inserted : 0;
    const replaced = typeof result?.replaced === "number" ? result.replaced : 0;
    const skipped =
      typeof result?.skipped === "number"
        ? result.skipped
        : Math.max(records.length - inserted - replaced, 0);
    const parts = [];
    if (inserted) {
      parts.push(`新增 ${inserted}`);
    }
    if (replaced) {
      parts.push(`更新 ${replaced}`);
    }
    if (skipped) {
      parts.push(`跳过 ${skipped}`);
    }
    const summary = parts.length ? parts.join(" · ") : "无可导入的标注";
    setTimedImportStatus(
      `导入完成：${summary}`,
      inserted || replaced ? "success" : "info",
      4000,
    );
    await refreshHighlights({ preserveProgress: true });
  }

  function cleanup() {
    timers.forEach((id) => clearTimeout(id));
    timers.clear();
  }

  return {
    highlights,
    filters,
    view,
    panel,
    settings,
    logseqStatus,
    settingsStatus,
    importStatus,
    modalState,
    loadingHighlights,
    availableSites,
    availableTags,
    groupedHighlights,
    summaryText,
    searchTerms,
    visibleHighlights,
    hasMoreHighlights,
    initialize,
    setFilter,
    resetFilters,
    setView,
    showSettings,
    showHighlights,
    loadMore: () => {
      if (hasMoreHighlights.value) {
        renderedCount.value = Math.min(
          renderedCount.value + PAGINATION_BATCH,
          filteredHighlights.value.length,
        );
      }
    },
    copyHighlight,
    deleteHighlight,
    downgradeHighlight,
    handleExport,
    syncLogseq,
    toggleSync,
    saveSettings,
    importHighlightsFromFile,
    openModal,
    closeModal,
    saveModal,
    renderHighlight: (record) =>
      renderHighlightContent(record, searchTerms.value),
    formatNote: (value) => formatNote(value, searchTerms.value),
    formatInline: (value) => formatInline(value, searchTerms.value),
    formatDateTime,
    getRecordKind,
    cleanup,
    isSyncInFlight,
    loadHighlights: refreshHighlights,
  };
}
