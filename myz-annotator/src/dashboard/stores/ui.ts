import { defineStore } from "pinia";
import { computed, reactive, ref, Ref, watch } from "vue";
import { useHighlightsStore } from "./highlights.js";
import { PAGINATION_BATCH } from "../constants.js";
import {
  computeRecordStats,
  formatDateTime,
  formatInline,
  formatNote,
  getSearchTerms,
  groupHighlightsByDate,
  renderHighlightContent,
} from "@/dashboard/utils/records.js";
import { sendMessage } from "@/shared/messaging.js";
import {
  DEFAULT_COLOR,
  MyZRecord,
  RECORD_KINDS,
  getRecordKind,
} from "@/shared/types.js";

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

export const useUIStore = defineStore("ui", () => {
  const highlightsStore = useHighlightsStore();

  const view: Ref<"cards" | "list"> = ref("cards");
  const panel: Ref<"settings" | "highlights"> = ref("highlights");
  const renderedCount = ref(0);
  const filters: SearchFilters = reactive({
    search: "",
    site: "",
    tags: [],
    from: "",
    to: "",
  });

  const modalState: ModalState = reactive({
    recordId: "",
    mode: "view",
    note: "",
    tags: [],
    color: DEFAULT_COLOR,
    status: "",
    saving: false,
  });

  const searchNeedle = computed(() => filters.search.trim().toLowerCase());
  const searchTerms = computed(() => getSearchTerms(filters.search));

  const filteredHighlights = computed(() => {
    const needle = searchNeedle.value;
    const siteFilter = filters.site;
    const tagsFilter = filters.tags;
    const from = filters.from;
    const to = filters.to;
    return highlightsStore.highlights.filter((item) => {
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
        if (stats.aiCount) {
          detail.push(`AI ${stats.aiCount}`);
        }
        if (stats.tweetCount) {
          detail.push(`社区 ${stats.tweetCount}`);
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
    if (stats.aiCount) {
      parts.push(`AI ${stats.aiCount}`);
    }
    if (stats.tweetCount) {
      parts.push(`社区 ${stats.tweetCount}`);
    }
    const detail = parts.length ? `（${parts.join(" · ")}）` : "";
    return `共 ${stats.total} 条记录${detail} · 涉及 ${sites.size} 个站点`;
  });

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

  function loadMore() {
    if (hasMoreHighlights.value) {
      renderedCount.value = Math.min(
        renderedCount.value + PAGINATION_BATCH,
        filteredHighlights.value.length,
      );
    }
  }

  function openModal(id: string, mode: "view" | "edit") {
    const record = highlightsStore.highlights.find((item) => item.id === id);
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
    const record = highlightsStore.highlights.find(
      (item) => item.id === modalState.recordId,
    );
    if (!record) {
      return;
    }
    const socialRecordIds: string[] = Array.isArray((record as any)?.socialRecordIds)
      ? ((record as any).socialRecordIds as any[])
          .map((id) => (typeof id === "string" ? id.trim() : ""))
          .filter(Boolean)
      : [];
    const kind = getRecordKind(record);
    const note = modalState.note.trim();
    const tags = [...modalState.tags];
    if (kind === RECORD_KINDS.HIGHLIGHT) {
      // handled below
    }
    modalState.saving = true;
    modalState.status = "保存中…";
    try {
      if (socialRecordIds.length) {
        await sendMessage("myz:updateRecordsByIds", {
          ids: socialRecordIds,
          patch: { note, tags },
        });
        await highlightsStore.refreshHighlights();
      } else {
        const payload: Partial<MyZRecord> = {
          id: modalState.recordId,
          note,
          tags,
          kind,
        };
        if (kind === RECORD_KINDS.HIGHLIGHT) {
          payload.color = modalState.color || DEFAULT_COLOR;
        } else {
          payload.color = undefined;
          payload.range = undefined;
        }
        const updated = await sendMessage("myz:updateHighlight", payload);
        highlightsStore.applyUpdatedRecord(updated);
      }
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

  return {
    view,
    panel,
    filters,
    modalState,
    searchTerms,
    filteredHighlights,
    visibleHighlights,
    groupedHighlights,
    summaryText,
    hasMoreHighlights,
    setFilter,
    resetFilters,
    setView,
    showSettings,
    showHighlights,
    loadMore,
    openModal,
    closeModal,
    saveModal,
    renderHighlight: (record: MyZRecord) =>
      renderHighlightContent(record, searchTerms.value),
    formatNote: (value: string) => formatNote(value, searchTerms.value),
    formatInline: (value: string) => formatInline(value, searchTerms.value),
    formatDateTime,
    getRecordKind,
    updateRenderedCount,
  };
});
