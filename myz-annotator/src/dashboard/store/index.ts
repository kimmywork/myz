import {
  ArchiveHistoryEntry,
  ArchiveQueueEntry,
} from "src/background/internetArchive.js";
import { computed, reactive, Ref, ref, watch } from "vue";
import { IMPORT_MAX_BYTES, PAGINATION_BATCH } from "../constants.js";
import { downloadFile } from "@/dashboard/utils/download.js";
import { normalizeImportedPayload } from "@/dashboard/utils/import.js";
import {
  computeRecordStats,
  formatDateTime,
  formatInline,
  formatNote,
  getSearchTerms,
  groupHighlightsByDate,
  normalizeRecord,
  recordToMarkdown,
  renderHighlightContent,
} from "@/dashboard/utils/records.js";
import { sendMessage } from "@/shared/messaging.js";
import {
  DEFAULT_COLOR,
  MyZRecord,
  RECORD_KINDS,
  getRecordKind,
} from "@/shared/types.js";

export const DashboardStoreKey = Symbol("DashboardStore");

export interface Settings {
  logseqEndpoint: string;
  logseqPage: string;
  logseqAuthToken: string;
  logseqGraph: string;
  logseqSyncEnabled: boolean;
  dashboardView: "cards" | "list";
  internetArchiveEnabled: boolean;
  internetArchiveAccessKey: string;
  internetArchiveAccessSecret: string;
  // AI Assistant settings
  aiAssistantEnabled: boolean;
  aiApiEndpoint: string;
  aiApiKey: string;
  aiModel: string;
  aiCustomModel: string;
  aiContextSize: string;
  aiMaxTokens: number;
  aiRequestHeaders: string;
  aiProviders: Array<{ id: string; name: string; endpoint: string }>;
  aiActiveProviderId: string | null;
  aiMcpServers: Array<{ name: string; endpoint: string }>;
  vectorSearchEnabled: boolean;
  vectorModelReady: boolean;
  vectorUseLocalModel: boolean | "remote";
  vectorOpenAiEndpoint: string;
  vectorOpenAiApiKey: string;
  vectorOpenAiModel: string;
  vectorMaxChars: number;
}

export interface SearchFilters {
  search: string;
  site: string;
  tags: string[];
  from: string;
  to: string;
}

export interface ModalState {
  recordId: string;
  mode: "view" | "edit";
  note: string;
  tags: string[];
  color: string;
  status: string;
  saving: boolean;
}

export type MessageTone = "info" | "error" | "success";

export type ImportStrategy = "skip" | "overwrite" | "latest";

export interface ImportStatus {
  message: string;
  tone?: MessageTone;
}

export interface DashboardStore {
  highlights: Ref<MyZRecord[]>;
  loadingHighlights: Ref<boolean>;
  filters: SearchFilters;
  view: Ref<"cards" | "list">;
  panel: Ref<"settings" | "highlights">;
  settings: Settings;
  logseqStatus: Ref<string>;
  settingsStatus: Ref<string>;
  importStatus: ImportStatus;
  isSyncInFlight: Ref<boolean>;
  archiveQueue: Ref<ArchiveQueueEntry[]>;
  archiveHistory: Ref<ArchiveHistoryEntry[]>;
  archiveMetaLoading: Ref<boolean>;
  archiveMetaStatus: Ref<string>;
  vectorModelLoading: Ref<boolean>;
  vectorModelStatus: Ref<string>;
  modalState: ModalState;
  searchTerms: Ref<string[]>;
  archiveQueueWithPosition: Ref<(ArchiveQueueEntry & { position: number })[]>;
  archiveHistorySorted: Ref<ArchiveHistoryEntry[]>;
  hasMoreHighlights: Ref<boolean>;
  visibleHighlights: Ref<MyZRecord[]>;
  groupedHighlights: Ref<
    {
      date: string;
      items: MyZRecord[];
      stats: ReturnType<typeof computeRecordStats>;
      detailText: string;
    }[]
  >;
  summaryText: Ref<string>;
  availableSites: Ref<string[]>;
  availableTags: Ref<string[]>;
  loadHighlights: () => Promise<void>;
  saveSettings: (payload: Partial<Settings>) => Promise<void>;
  loadArchiveActivity: (options?: { force?: boolean }) => Promise<void>;
  refreshArchiveActivity: () => Promise<void>;
  initialize: () => Promise<void>;
  setFilter: (key: keyof SearchFilters, value: string | string[]) => void;
  resetFilters: () => void;
  setView: (
    nextView: "cards" | "list",
    options?: { persist?: boolean },
  ) => void;
  showSettings: () => void;
  showHighlights: () => void;
  loadMore: () => void;
  copyHighlight: (id: string) => Promise<void>;
  deleteHighlight: (id: string) => Promise<void>;
  downgradeHighlight: (id: string) => Promise<void>;
  handleExport: (format: "markdown" | "json") => Promise<void>;
  syncLogseq: () => Promise<void>;

  toggleSync: (enabled: boolean) => void;
  toggleInternetArchive: (enabled: boolean) => void;
  importHighlightsFromFile: (
    file: File | undefined,
    strategy: ImportStrategy,
  ) => Promise<void>;
  openModal: (recordId: string, mode: "view" | "edit") => void;
  closeModal: () => void;
  saveModal: () => Promise<void>;
  renderHighlight: (record: MyZRecord) => string;
  testAiConnection: (settings: Partial<Settings>) => Promise<void>;
  testVectorProvider: (config: Partial<Settings>) => Promise<void>;

  formatNote: (value: string) => string;
  formatInline: (value: string) => string;
  formatDateTime: (dateString: string) => string;
  getRecordKind: (record: MyZRecord) => RECORD_KINDS;
  cleanup: () => void;
  rebuildVectorIndex: () => Promise<void>;
  toggleVectorSearch: (enabled: boolean) => void;
  loadVectorModel: () => Promise<void>;
  switchVectorProvider: (payload: Partial<Settings>) => Promise<void>;
}

export function createDashboardStore(): DashboardStore {
  const highlights: Ref<MyZRecord[]> = ref([]);
  const loadingHighlights = ref(true);
  const filters: SearchFilters = reactive({
    search: "",
    site: "",
    tags: [],
    from: "",
    to: "",
  });
  const view: Ref<"cards" | "list"> = ref("cards");
  const panel: Ref<"settings" | "highlights"> = ref("highlights");
  const renderedCount = ref(0);
  const settings: Settings = reactive({
    logseqEndpoint: "",
    logseqPage: "MyZ Inbox",
    logseqAuthToken: "",
    logseqGraph: "",
    logseqSyncEnabled: false,
    dashboardView: "cards",
    internetArchiveEnabled: false,
    internetArchiveAccessKey: "",
    internetArchiveAccessSecret: "",
    // AI Assistant settings
    aiAssistantEnabled: false,
    aiApiEndpoint: "",
    aiApiKey: "",
    aiModel: "gpt-4",
    aiCustomModel: "",
    aiContextSize: "32K",
    aiMaxTokens: 32768,
    aiRequestHeaders: "",
    aiProviders: [],
    aiActiveProviderId: null,
    aiMcpServers: [],
    vectorSearchEnabled: false,
    vectorModelReady: false,
    vectorUseLocalModel: true,
    vectorOpenAiEndpoint: "",
    vectorOpenAiApiKey: "",
    vectorOpenAiModel: "text-embedding-3-small",
    vectorMaxChars: 500,
  });
  const logseqStatus = ref("");
  const settingsStatus = ref("");
  const importStatus: ImportStatus = reactive({ message: "", tone: "info" });
  const isSyncInFlight = ref(false);
  const archiveQueue: Ref<ArchiveQueueEntry[]> = ref([]);
  const archiveHistory: Ref<ArchiveHistoryEntry[]> = ref([]);
  const archiveMetaLoading = ref(false);
  const archiveMetaStatus = ref("");
  const archiveMetaInitialized = ref(false);
  const vectorModelLoading = ref(false);
  const vectorModelStatus = ref("");

  const modalState: ModalState = reactive({
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

  const archiveQueueWithPosition = computed(() => {
    return archiveQueue.value.map((entry, index) => ({
      ...entry,
      position: index,
    }));
  });

  const archiveHistorySorted = computed(() => {
    return [...archiveHistory.value]
      .sort((a, b) => {
        const left = typeof a?.timestamp === "string" ? a.timestamp : "";
        const right = typeof b?.timestamp === "string" ? b.timestamp : "";
        return right.localeCompare(left);
      })
      .slice(0, 50);
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
      ...new Set(
        highlights.value
          .map((item) => item.hostname)
          .filter(Boolean) as string[],
      ),
    ].sort((a, b) => a.localeCompare(b));
  });

  const availableTags = computed(() => {
    const set = new Set<string>();
    highlights.value.forEach((item) => {
      (item.tags || []).forEach((tag) => set.add(tag));
    });
    return [...set].sort((a, b) => a.localeCompare(b));
  });

  function setTimedStatus(
    target: Ref<string | null>,
    message: string,
    duration = 3000,
  ) {
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

  function setTimedImportStatus(
    message: string,
    tone: MessageTone = "info",
    duration = 3000,
  ) {
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

  function updateRenderedCount({ preserve }: { preserve?: boolean } = {}) {
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
        ? (result
            .map((item) => normalizeRecord(item))
            .filter(Boolean) as MyZRecord[])
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
      const result: Settings = await sendMessage("myz:getSettings");
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
        internetArchiveEnabled: Boolean(result.internetArchiveEnabled),
        internetArchiveAccessKey: result.internetArchiveAccessKey || "",
        internetArchiveAccessSecret: result.internetArchiveAccessSecret || "",
        // AI Assistant settings
        aiAssistantEnabled: Boolean(result.aiAssistantEnabled),
        aiApiEndpoint: result.aiApiEndpoint || "",
        aiApiKey: result.aiApiKey || "",
        aiModel: result.aiModel || "gpt-4",
        aiCustomModel: result.aiCustomModel || "",
        aiContextSize: result.aiContextSize || "32K",
        aiMaxTokens:
          typeof result.aiMaxTokens === "number"
            ? result.aiMaxTokens
            : settings.aiMaxTokens,
        aiRequestHeaders: result.aiRequestHeaders || "",
        aiProviders: Array.isArray(result.aiProviders)
          ? result.aiProviders.map((p) => ({ ...p }))
          : [],
        aiActiveProviderId:
          typeof result.aiActiveProviderId === "string" ||
          result.aiActiveProviderId === null
            ? result.aiActiveProviderId
            : null,
        aiMcpServers: Array.isArray(result.aiMcpServers)
          ? result.aiMcpServers.map((s) => ({ ...s }))
          : [],
        vectorSearchEnabled: Boolean(result.vectorSearchEnabled),
        vectorModelReady: result.vectorSearchEnabled
          ? Boolean(result.vectorModelReady)
          : false,
        vectorUseLocalModel:
          result.vectorUseLocalModel !== false &&
          result.vectorUseLocalModel !== "remote",
        vectorOpenAiEndpoint: result.vectorOpenAiEndpoint || "",
        vectorOpenAiApiKey: result.vectorOpenAiApiKey || "",
        vectorOpenAiModel:
          result.vectorOpenAiModel || settings.vectorOpenAiModel,
        vectorMaxChars:
          typeof result.vectorMaxChars === "number" && result.vectorMaxChars > 0
            ? Math.floor(result.vectorMaxChars)
            : settings.vectorMaxChars,
      });
      if (settings.dashboardView) {
        view.value = settings.dashboardView;
      }
    } catch (error) {
      console.error("Failed to load settings", error);
    }
  }

  async function loadArchiveActivity({ force = false } = {}) {
    if (archiveMetaLoading.value) {
      return;
    }
    if (!force && archiveMetaInitialized.value) {
      return;
    }
    archiveMetaLoading.value = true;
    try {
      const result = await sendMessage("myz:getArchiveHistory");
      archiveQueue.value = Array.isArray(result?.queue) ? result.queue : [];
      archiveHistory.value = Array.isArray(result?.history)
        ? result.history
        : [];
      archiveMetaInitialized.value = true;
      archiveMetaStatus.value = "";
    } catch (error) {
      archiveMetaStatus.value = `加载失败：${(error as Error).message}`;
      throw error;
    } finally {
      archiveMetaLoading.value = false;
    }
  }

  async function refreshArchiveActivity() {
    await loadArchiveActivity({ force: true });
  }

  async function initialize() {
    await Promise.all([loadSettings(), loadHighlights()]);
  }

  function setFilter(key: keyof SearchFilters, value: string | string[]) {
    if (key === "tags") {
      filters.tags = Array.isArray(value) ? value : [];
    } else if (key in filters) {
      filters[key] = value as string;
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

  async function persistDashboardView(nextView: "cards" | "list") {
    try {
      await sendMessage("myz:updateSettings", { dashboardView: nextView });
    } catch (error) {
      console.warn("Failed to persist dashboard view", error);
    }
  }

  function setView(nextView: "cards" | "list", { persist = true } = {}) {
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

  async function copyHighlight(id: string) {
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

  async function deleteHighlight(id: string) {
    try {
      await sendMessage("myz:removeHighlight", { id });
      highlights.value = highlights.value.filter((item) => item.id !== id);
      updateRenderedCount({ preserve: true });
    } catch (error) {
      console.error("删除失败", error);
      setTimedStatus(logseqStatus, `删除失败：${(error as Error).message}`);
    }
  }

  async function downgradeHighlight(id: string) {
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
      setTimedStatus(logseqStatus, `降级失败：${(error as Error).message}`);
    }
  }

  function applyUpdatedRecord(updated: MyZRecord, { preserve = false } = {}) {
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

  function openModal(id: string, mode: "view" | "edit") {
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
    const payload: Partial<MyZRecord> = {
      id: modalState.recordId,
      note: modalState.note.trim(),
      tags: [...modalState.tags],
      kind,
    };
    if (kind === RECORD_KINDS.HIGHLIGHT) {
      payload.color = modalState.color || DEFAULT_COLOR;
    } else {
      payload.color = undefined;
      payload.range = undefined;
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
      modalState.status = `保存失败：${(error as Error).message}`;
    } finally {
      modalState.saving = false;
    }
  }

  async function handleExport(format: "markdown" | "json") {
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
      setTimedStatus(logseqStatus, `导出失败：${(error as Error).message}`);
    }
  }

  async function syncLogseq(customPayload: Partial<MyZRecord> = {}) {
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
      setTimedStatus(
        logseqStatus,
        `同步失败：${(error as Error).message}`,
        4000,
      );
    } finally {
      isSyncInFlight.value = false;
    }
  }

  async function toggleSync(enabled: boolean) {
    settings.logseqSyncEnabled = enabled;
    try {
      await sendMessage("myz:updateSettings", { logseqSyncEnabled: enabled });
    } catch (error) {
      console.error("Failed to update sync toggle", error);
      settings.logseqSyncEnabled = !enabled;
      setTimedStatus(settingsStatus, `更新失败：${(error as Error).message}`);
      throw error;
    }
  }

  async function toggleInternetArchive(enabled: boolean) {
    settings.internetArchiveEnabled = enabled;
    try {
      await sendMessage("myz:updateSettings", {
        internetArchiveEnabled: enabled,
      });
    } catch (error) {
      console.error("Failed to update archive toggle", error);
      settings.internetArchiveEnabled = !enabled;
      setTimedStatus(settingsStatus, `更新失败：${(error as Error).message}`);
      throw error;
    }
  }

  async function saveSettings(payload: Partial<Settings>) {
    settingsStatus.value = "保存中…";
    try {
      const updated = await sendMessage<Partial<Settings>, Partial<Settings>>(
        "myz:updateSettings",
        payload,
      );
      if (updated) {
        Object.assign(settings, {
          ...settings,
          ...updated,
        });
        if ("aiActiveProviderId" in updated) {
          settings.aiActiveProviderId =
            typeof updated.aiActiveProviderId === "string" ||
            updated.aiActiveProviderId === null
              ? updated.aiActiveProviderId
              : settings.aiActiveProviderId;
        }
        if (Array.isArray(updated.aiProviders)) {
          settings.aiProviders = updated.aiProviders.map((p) => ({ ...p }));
        }
        if (Array.isArray(updated.aiMcpServers)) {
          settings.aiMcpServers = updated.aiMcpServers.map((s) => ({ ...s }));
        }
        if ("vectorSearchEnabled" in updated) {
          settings.vectorSearchEnabled = Boolean(updated.vectorSearchEnabled);
        }
        if ("vectorModelReady" in updated) {
          settings.vectorModelReady = Boolean(updated.vectorModelReady);
        }
        if ("vectorUseLocalModel" in updated) {
          settings.vectorUseLocalModel =
            updated.vectorUseLocalModel !== false &&
            updated.vectorUseLocalModel !== "remote";
        }
        if ("vectorOpenAiEndpoint" in updated) {
          settings.vectorOpenAiEndpoint = updated.vectorOpenAiEndpoint || "";
        }
        if ("vectorOpenAiApiKey" in updated) {
          settings.vectorOpenAiApiKey = updated.vectorOpenAiApiKey || "";
        }
        if ("vectorOpenAiModel" in updated) {
          settings.vectorOpenAiModel =
            updated.vectorOpenAiModel || settings.vectorOpenAiModel;
        }
        if ("vectorMaxChars" in updated) {
          settings.vectorMaxChars =
            typeof updated.vectorMaxChars === "number" &&
            updated.vectorMaxChars > 0
              ? Math.floor(updated.vectorMaxChars)
              : settings.vectorMaxChars;
        }
      }
      settingsStatus.value = "设置已保存";
      setTimeout(() => {
        settingsStatus.value = "";
      }, 3000);
    } catch (error) {
      settingsStatus.value = `保存失败：${(error as Error).message}`;
      throw error;
    }
  }

  async function importHighlightsFromFile(
    file: File | undefined,
    strategy: ImportStrategy,
  ) {
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

  async function testAiConnection(settings: Partial<Settings>) {
    try {
      setTimedStatus(settingsStatus, "测试 AI 连接中…", 0);
      const result = await sendMessage("myz:testAiConnection", settings);
      if (result.success) {
        setTimedStatus(settingsStatus, "✓ AI 连接成功", 3000);
      } else {
        setTimedStatus(
          settingsStatus,
          `✗ AI 连接失败：${result.error || "未知错误"}`,
          4000,
        );
      }
      return result;
    } catch (error) {
      setTimedStatus(
        settingsStatus,
        `✗ 测试失败：${(error as Error).message}`,
        4000,
      );
      throw error;
    }
  }

  async function toggleVectorSearch(enabled: boolean) {
    settings.vectorSearchEnabled = enabled;
    if (!enabled) {
      settings.vectorModelReady = false;
    }
    const payload = {
      vectorSearchEnabled: enabled,
      vectorModelReady: enabled ? settings.vectorModelReady : false,
    };
    try {
      setTimedStatus(settingsStatus, "保存中…", 0);
      const updated = await sendMessage<Partial<Settings>, Partial<Settings>>(
        "myz:updateSettings",
        payload,
      );
      if (updated) {
        settings.vectorSearchEnabled = Boolean(updated.vectorSearchEnabled);
        settings.vectorModelReady = Boolean(updated.vectorModelReady);
      }
      setTimedStatus(settingsStatus, "设置已保存", 2000);
    } catch (error) {
      settings.vectorSearchEnabled = !enabled;
      setTimedStatus(
        settingsStatus,
        `更新失败：${(error as Error).message}`,
        4000,
      );
      throw error;
    }
  }

  async function loadVectorModel() {
    if (!settings.vectorSearchEnabled) {
      setTimedStatus(vectorModelStatus, "请先启用向量检索", 3000);
      return { success: false };
    }
    vectorModelLoading.value = true;
    try {
      setTimedStatus(vectorModelStatus, "加载模型中…", 0);
      const result = await sendMessage("myz:loadVectorModel");
      if (result?.vectorModelReady) {
        settings.vectorModelReady = true;
        setTimedStatus(vectorModelStatus, "模型加载完成", 4000);
      } else {
        setTimedStatus(vectorModelStatus, "模型未完成加载", 3000);
      }
      return result;
    } catch (error) {
      settings.vectorModelReady = false;
      setTimedStatus(
        vectorModelStatus,
        `加载失败：${(error as Error).message}`,
        4000,
      );
      throw error;
    } finally {
      vectorModelLoading.value = false;
    }
  }

  async function testVectorProvider(config: Partial<Settings>) {
    try {
      setTimedStatus(vectorModelStatus, "测试中…", 0);
      const result = await sendMessage("myz:testVectorProvider", config);
      if (result?.success) {
        setTimedStatus(vectorModelStatus, "测试通过", 3000);
      } else {
        setTimedStatus(vectorModelStatus, "测试失败", 3000);
      }
      return result;
    } catch (error) {
      setTimedStatus(
        vectorModelStatus,
        `测试失败：${(error as Error).message}`,
        4000,
      );
      throw error;
    }
  }

  async function rebuildVectorIndex() {
    try {
      setTimedStatus(vectorModelStatus, "重建索引中…", 0);
      await sendMessage("myz:rebuildVectorIndex");
      setTimedStatus(vectorModelStatus, "索引已重建", 4000);
    } catch (error) {
      setTimedStatus(
        vectorModelStatus,
        `重建失败：${(error as Error).message}`,
        4000,
      );
      throw error;
    }
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
    toggleInternetArchive,
    saveSettings,
    importHighlightsFromFile,
    openModal,
    closeModal,
    saveModal,
    renderHighlight: (record: MyZRecord) =>
      renderHighlightContent(record, searchTerms.value),
    formatNote: (value: string) => formatNote(value, searchTerms.value),
    formatInline: (value: string) => formatInline(value, searchTerms.value),
    formatDateTime,
    getRecordKind,
    archiveQueue,
    archiveQueueWithPosition,
    archiveHistory,
    archiveHistorySorted,
    archiveMetaLoading,
    archiveMetaStatus,
    vectorModelLoading,
    vectorModelStatus,
    loadArchiveActivity,
    refreshArchiveActivity,
    cleanup,
    isSyncInFlight,
    testAiConnection,
    testVectorProvider,
    rebuildVectorIndex,
    toggleVectorSearch,
    loadVectorModel,
    switchVectorProvider: async (payload: Partial<Settings>) => {
      // Save config first
      await saveSettings(payload);
      if (payload.vectorUseLocalModel) {
        if (settings.vectorSearchEnabled) {
          await loadVectorModel().catch(() => {});
        }
      } else if (payload.vectorOpenAiApiKey) {
        await testVectorProvider(payload);
        await saveSettings({ ...payload, vectorModelReady: true });
        setTimedStatus(settingsStatus, "已切换到 OpenAI 模型", 3000);
      }
    },
    loadHighlights: refreshHighlights,
  };
}
