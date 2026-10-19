import {
  DEFAULT_COLOR,
  MyZRecord,
  RECORD_KINDS,
  getRecordKind,
} from "@myz/shared/types";
import { defineStore } from "pinia";
import { computed, reactive, ref, watch } from "vue";
import type { Ref } from "vue";
import { PAGINATION_BATCH } from "../constants.js";
import { useHighlightsStore } from "./highlights.js";
import { matchesFilters, resolveQuickSearch } from "./ui/filters.js";
import type { SearchFilters } from "./ui/filters.js";
import { buildGroupedHighlights, buildSummaryText } from "./ui/grouping.js";
import {
  formatDateTime,
  formatInline,
  formatNote,
  getSearchTerms,
  groupRecordsByPage,
  renderHighlightContent,
  sortRecordsForPage,
  type PageSortMode,
} from "@/dashboard/utils/records.js";
import { invoke } from "@/messaging/invoke";

export type { SearchFilters } from "./ui/filters.js";

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

  const searchNeedle = computed(() => filters.search.trim().toLowerCase());
  const searchTerms = computed(() => getSearchTerms(filters.search));

  const filteredHighlightsBase = computed(() =>
    highlightsStore.highlights.filter((item) =>
      matchesFilters(item, filters, searchNeedle.value),
    ),
  );

  const pageGroups = computed(() =>
    groupRecordsByPage(filteredHighlightsBase.value),
  );

  const filteredHighlights = computed(() => {
    let items = filteredHighlightsBase.value;
    if (pageFilter.value) {
      items = items.filter(
        (item) => (item.url || item.sourceUrl || "") === pageFilter.value,
      );
      items = sortRecordsForPage(
        items,
        pageSortMode.value === "range" ? "range" : "time",
      );
    }
    return items;
  });

  const hasMoreHighlights = computed(
    () => renderedCount.value < filteredHighlights.value.length,
  );

  const visibleHighlights = computed(() => {
    if (!filteredHighlights.value.length) return [];
    const limit =
      renderedCount.value ||
      Math.min(PAGINATION_BATCH, filteredHighlights.value.length);
    return filteredHighlights.value.slice(0, limit);
  });

  const groupedHighlights = computed(() =>
    buildGroupedHighlights(visibleHighlights.value, pageFilter.value),
  );

  const summaryText = computed(() =>
    buildSummaryText(filteredHighlights.value),
  );

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
    if (!pageFilter.value) return;
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
    const patch = resolveQuickSearch(
      value,
      highlightsStore.availableSites,
      highlightsStore.availableTags,
    );
    if (patch) {
      if (patch.site !== undefined) filters.site = patch.site;
      if (patch.search !== undefined) filters.search = patch.search;
      if (patch.tags !== undefined) filters.tags = patch.tags;
    }
    updateRenderedCount();
  }

  async function persistDashboardView(nextView: "cards" | "list") {
    try {
      await invoke("myz:updateSettings", { dashboardView: nextView });
    } catch (error) {
      console.warn("Failed to persist dashboard view", error);
    }
  }

  function setView(nextView: "cards" | "list", { persist = true } = {}) {
    if (!nextView || view.value === nextView) return;
    view.value = nextView;
    if (persist) persistDashboardView(nextView);
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

  /**
   * Persist record edits made in the viewer (design-system §4.8: record
   * reading and editing live on the viewer page, not in a large modal).
   */
  async function updateRecord(
    id: string,
    patch: { note?: string; tags?: string[]; color?: string },
  ) {
    const record = highlightsStore.highlights.find((item) => item.id === id);
    if (!record) return;
    const kind = getRecordKind(record);
    const payload: Partial<MyZRecord> = {
      id,
      kind,
      note: patch.note ?? record.note ?? "",
      tags: patch.tags ?? record.tags ?? [],
    };
    if (kind === RECORD_KINDS.HIGHLIGHT) {
      payload.color = patch.color ?? record.color ?? DEFAULT_COLOR;
    } else {
      payload.color = undefined;
      payload.range = undefined;
    }
    const updated = await invoke("myz:updateHighlight", payload);
    highlightsStore.applyUpdatedRecord(updated);
  }

  return {
    view,
    filters,
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
    updateRecord,
    renderHighlight: (record: MyZRecord) =>
      renderHighlightContent(record, searchTerms.value),
    formatNote: (value: string) => formatNote(value, searchTerms.value),
    formatInline: (value: string) => formatInline(value, searchTerms.value),
    formatDateTime,
    getRecordKind,
    updateRenderedCount,
  };
});
