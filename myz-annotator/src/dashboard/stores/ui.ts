import { recordIdForHighlight } from "@myz/core/identity";
import { parseInboxRecordId } from "@myz/shared/inbox";
import {
  DEFAULT_COLOR,
  MyZRecord,
  RECORD_KINDS,
  getRecordKind,
} from "@myz/shared/types";
import { defineStore } from "pinia";
import { computed, reactive, ref, watch } from "vue";
import { PAGINATION_BATCH } from "../constants.js";
import {
  DEFAULT_SETTINGS_SECTION,
  type SettingsSectionKey,
} from "../pages/settings/settings-sections.js";
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
} from "@/dashboard/utils/records.js";
import { changeBus } from "@/messaging/changes";
import { invoke } from "@/messaging/invoke";

export type { SearchFilters } from "./ui/filters.js";

export const useUIStore = defineStore("ui", () => {
  const highlightsStore = useHighlightsStore();

  // The settings surface is a modal opened from the rail footer (§4.17), not
  // a route: the current workspace page stays mounted underneath it.
  const settingsOpen = ref(false);
  const settingsSection = ref<SettingsSectionKey>(DEFAULT_SETTINGS_SECTION);
  const pageFilter = ref("");
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

  /**
   * Inbox workflow status lives in `inbox_state`, not on the record. The
   * library only shows kept records (a missing status row counts as kept), but
   * the store keeps every record so direct detail/viewer links still work.
   */
  const nonKeptTargets = ref<ReadonlySet<string>>(new Set());
  async function loadInboxStatuses() {
    try {
      const states = await invoke("myz:inboxListStates");
      const targets = new Set<string>();
      for (const row of states ?? []) {
        const parsed = parseInboxRecordId(row.recordId);
        if (parsed?.kind !== "status") continue;
        const status = (row.payload as { status?: unknown } | null)?.status;
        if (typeof status === "string" && status !== "kept") {
          targets.add(parsed.targetId);
        }
      }
      nonKeptTargets.value = targets;
    } catch {
      nonKeptTargets.value = new Set();
    }
  }
  let inboxUnsubscribe: (() => void) | null = null;
  function initializeInboxStatus() {
    void loadInboxStatuses();
    if (inboxUnsubscribe) return;
    inboxUnsubscribe = changeBus.subscribe((event) => {
      if (event.domain === "inbox" || event.domain === "sync") {
        void loadInboxStatuses();
      }
    });
  }

  const filteredHighlightsBase = computed(() =>
    highlightsStore.highlights.filter(
      (item) =>
        !nonKeptTargets.value.has(recordIdForHighlight(item.id)) &&
        matchesFilters(item, filters, searchNeedle.value),
    ),
  );

  const pageGroups = computed(() =>
    groupRecordsByPage(filteredHighlightsBase.value),
  );

  const filteredHighlights = computed(() => {
    // 排序规则（2026-11-23，取代「时间/文中顺序」切换）：选中页面 = 页面顺序
    // （文中顺序）；没有页面筛选 = 采集时间倒序。进入详情（页面视图）同理
    // 走页面顺序，见 useHighlightViewer。
    if (pageFilter.value) {
      const items = filteredHighlightsBase.value.filter(
        (item) => (item.url || item.sourceUrl || "") === pageFilter.value,
      );
      return sortRecordsForPage(items, "range");
    }
    return sortRecordsForPage(filteredHighlightsBase.value, "time");
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

  function setPageFilter(nextUrl: string) {
    pageFilter.value = nextUrl;
    updateRenderedCount();
  }

  function clearPageFilter() {
    pageFilter.value = "";
    updateRenderedCount();
  }

  /** Opens the settings modal at one section (rail footer / deep link). */
  function openSettings(
    section: SettingsSectionKey = DEFAULT_SETTINGS_SECTION,
  ) {
    settingsSection.value = section;
    settingsOpen.value = true;
  }

  function closeSettings() {
    settingsOpen.value = false;
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
    filters,
    pageFilter,
    quickSearch,
    settingsOpen,
    settingsSection,
    openSettings,
    closeSettings,
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
    initializeInboxStatus,
    setPageFilter,
    clearPageFilter,
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
