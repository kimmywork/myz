import { sendMessage } from "@myz/shared/messaging";
import {
  DEFAULT_COLOR,
  MyZRecord,
  RECORD_KINDS,
  getRecordKind,
} from "@myz/shared/types";
import { defineStore } from "pinia";
import { computed, reactive, ref, Ref, watch } from "vue";
import { PAGINATION_BATCH } from "../constants.js";
import { useHighlightsStore } from "./highlights.js";
import {
  computeRecordStats,
  formatDateTime,
  formatInline,
  formatNote,
  getSearchTerms,
  groupHighlightsByDate,
  groupRecordsByPage,
  PageSortMode,
  renderHighlightContent,
  sortRecordsForPage,
} from "@/dashboard/utils/records.js";

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
  const pageSidebarOpen = ref(false);
  const pageFilter = ref("");
  const pageSortMode: Ref<PageSortMode> = ref("time");
  const quickSearch = ref("");
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

  const filteredHighlightsBase = computed(() => {
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

  const pageGroups = computed(() =>
    groupRecordsByPage(filteredHighlightsBase.value),
  );

  const filteredHighlights = computed(() => {
    let items = filteredHighlightsBase.value;
    if (pageFilter.value) {
      items = items.filter(
        (item) => (item.url || item.sourceUrl || "") === pageFilter.value,
      );
      if (pageSortMode.value === "range") {
        items = sortRecordsForPage(items, "range");
      } else {
        items = sortRecordsForPage(items, "time");
      }
    }
    return items;
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
    if (pageFilter.value) {
      const stats = computeRecordStats(visibleHighlights.value);
      const detail = [];
      if (stats.highlightCount) {
        detail.push(`划线 ${stats.highlightCount}`);
      }
      if (stats.savedCount) {
        detail.push(`摘录 ${stats.savedCount}`);
      }
      return [
        {
          date: "当前页面",
          items: visibleHighlights.value,
          stats,
          detailText: detail.length ? `（${detail.join(" · ")}）` : "",
        },
      ];
    }
    return groupHighlightsByDate(visibleHighlights.value).map(
      ([date, items]) => {
        const stats = computeRecordStats(items);
        const detail = [];
        if (stats.highlightCount) {
          detail.push(`划线 ${stats.highlightCount}`);
        }
        if (stats.savedCount) {
          detail.push(`摘录 ${stats.savedCount}`);
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
      parts.push(`划线 ${stats.highlightCount}`);
    }
    if (stats.savedCount) {
      parts.push(`摘录 ${stats.savedCount}`);
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

  watch(pageGroups, (groups) => {
    if (!pageFilter.value) {
      return;
    }
    const exists = groups.some((group) => group.url === pageFilter.value);
    if (!exists) {
      pageFilter.value = "";
      updateRenderedCount();
    }
  });

  function setFilter(key: keyof SearchFilters, value: string | string[]) {
    if (key === "tags") {
      filters.tags = Array.isArray(value) ? value : [];
    } else if (key in filters) {
      filters[key] = value as string;
    }
    updateRenderedCount();
  }

  function clearFilterFields() {
    filters.search = "";
    filters.site = "";
    filters.tags = [];
    filters.from = "";
    filters.to = "";
  }

  function resetFilters() {
    quickSearch.value = "";
    clearFilterFields();
    pageFilter.value = "";
    updateRenderedCount();
  }

  function applyQuickSearch(value: string) {
    quickSearch.value = value;
    clearFilterFields();

    const trimmed = value.trim();
    if (!trimmed) {
      updateRenderedCount();
      return;
    }

    const lower = trimmed.toLowerCase();
    if (lower.startsWith("site:")) {
      const candidate = trimmed.slice(5).trim();
      if (candidate && highlightsStore.availableSites.includes(candidate)) {
        filters.site = candidate;
      } else {
        filters.search = candidate || "";
      }
      updateRenderedCount();
      return;
    }

    const normalizedTag = trimmed.startsWith("#")
      ? trimmed.slice(1).trim()
      : trimmed;
    if (
      normalizedTag &&
      highlightsStore.availableTags.includes(normalizedTag)
    ) {
      filters.tags = [normalizedTag];
      updateRenderedCount();
      return;
    }

    if (highlightsStore.availableSites.includes(trimmed)) {
      filters.site = trimmed;
      updateRenderedCount();
      return;
    }

    filters.search = trimmed.startsWith("#") ? normalizedTag : trimmed;
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

  function togglePageSidebar() {
    pageSidebarOpen.value = !pageSidebarOpen.value;
  }

  function setPageFilter(nextUrl: string) {
    pageFilter.value = nextUrl;
    updateRenderedCount();
  }

  function clearPageFilter() {
    pageFilter.value = "";
    updateRenderedCount();
  }

  function setPageSortMode(nextMode: PageSortMode) {
    if (nextMode && pageSortMode.value !== nextMode) {
      pageSortMode.value = nextMode;
    }
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
    const kind = getRecordKind(record);
    const note = modalState.note.trim();
    const tags = [...modalState.tags];
    modalState.saving = true;
    modalState.status = "保存中…";
    try {
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
      const updated = await sendMessage<Partial<MyZRecord>, MyZRecord>(
        "myz:updateHighlight",
        payload,
      );
      highlightsStore.applyUpdatedRecord(updated);
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
    filters,
    modalState,
    pageSidebarOpen,
    pageFilter,
    pageSortMode,
    quickSearch,
    searchTerms,
    pageGroups,
    filteredHighlights,
    visibleHighlights,
    groupedHighlights,
    summaryText,
    hasMoreHighlights,
    setFilter,
    resetFilters,
    applyQuickSearch,
    setView,
    togglePageSidebar,
    setPageFilter,
    clearPageFilter,
    setPageSortMode,
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
