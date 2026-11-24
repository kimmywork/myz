import { resolveReaderLocator } from "@myz/core/source";
import { computed, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useHighlightsStore } from "../../stores/highlights.js";
import { useUIStore } from "../../stores/ui.js";
import {
  openEpubInWorkspace,
  openPdfInWorkspace,
} from "@/dashboard/utils/open-reader.js";
import {
  groupRecordsByPage,
  sortRecordsForPage,
} from "@/dashboard/utils/records.js";

/**
 * State/navigation/logic for the highlight detail page.
 *
 * The detail page shows the page's snapshot only (2026-11-23): no record
 * cards, no record column. Records are switched by clicking their marks in
 * the snapshot. Page view always sorts in document order — the old
 * 「时间/文中顺序」 toggle is gone; the list sorts by collection time unless a
 * page filter is on (see `stores/ui.ts`).
 */
export function useHighlightViewer() {
  const route = useRoute();
  const router = useRouter();
  const highlightsStore = useHighlightsStore();
  const uiStore = useUIStore();

  const recordId = computed(() => String(route.params.id || ""));
  const record = computed(() =>
    highlightsStore.highlights.find((item) => item.id === recordId.value),
  );

  const editing = ref(false);
  const noteDraft = ref("");
  const tagsDraft = ref<string[]>([]);
  const saving = ref(false);
  const saveError = ref("");
  const availableTags = computed(() => highlightsStore.availableTags);

  function startEditing() {
    const current = record.value;
    if (!current) return;
    noteDraft.value = current.note || "";
    tagsDraft.value = Array.isArray(current.tags) ? [...current.tags] : [];
    editing.value = true;
  }

  function stopEditing() {
    editing.value = false;
    if (route.query.edit) {
      router.replace(`/highlights/${recordId.value}`);
    }
  }

  async function saveEditing() {
    const current = record.value;
    if (!current || saving.value) return;
    saving.value = true;
    saveError.value = "";
    try {
      await uiStore.updateRecord(current.id, {
        note: noteDraft.value.trim(),
        tags: [...tagsDraft.value],
      });
      stopEditing();
    } catch (error) {
      saveError.value = `保存失败：${(error as Error).message}`;
    } finally {
      saving.value = false;
    }
  }

  watch(
    () => route.query.edit,
    () => {
      if (route.query.edit === "1") startEditing();
      else editing.value = false;
    },
    { immediate: true },
  );

  watch(record, (current) => {
    if (current && route.query.edit === "1") startEditing();
  });

  // PDF/EPUB 划线不是「页面」，没有快照：详情入口一律改为打开原文档
  // （2026-11-23）。直连详情地址也归到阅读器，不落在快照页上。
  // 用 replace：Back 不会再落回详情、被再次重定向（CodeRabbit #136）。
  // `?edit=1` 留在详情页——编辑面板就在详情页顶条里，重定向到阅读器会把
  // 编辑意图整个丢掉（CodeRabbit #136）。
  watch(
    record,
    (current) => {
      if (!current || route.query.edit === "1") return;
      const locator = resolveReaderLocator(current);
      if (!locator) return;
      // 权限询问可能在这期间一直挂着；用户已经离开这条记录时不要再导航。
      const detailPath = `/highlights/${current.id}`;
      const stillWanted = () => router.currentRoute.value.path === detailPath;
      if (locator.kind === "epub") {
        void openEpubInWorkspace(router, current, {
          replace: true,
          stillWanted,
        });
      } else if (locator.kind === "pdf-page-rect") {
        void openPdfInWorkspace(router, current, {
          replace: true,
          stillWanted,
        });
      }
    },
    { immediate: true },
  );

  const pageGroups = computed(() =>
    groupRecordsByPage(highlightsStore.highlights),
  );

  const currentPageGroup = computed(() => {
    if (!record.value) return null;
    const key = record.value.url || record.value.sourceUrl || "";
    return pageGroups.value.find((group) => group.url === key) || null;
  });

  // 页面视图永远按页面顺序（文中顺序）。
  const pageRecords = computed(() =>
    sortRecordsForPage(currentPageGroup.value?.records || [], "range"),
  );

  const pageTitle = computed(
    () =>
      currentPageGroup.value?.title ||
      currentPageGroup.value?.hostname ||
      record.value?.title ||
      record.value?.hostname ||
      "阅读器",
  );

  const pageTitleShort = computed(() => {
    const title = pageTitle.value;
    if (!title) return "";
    return title.length > 10 ? `${title.slice(0, 10)}…` : title;
  });

  const currentPageIndex = computed(() => {
    if (!currentPageGroup.value) return -1;
    return pageGroups.value.findIndex(
      (group) => group.url === currentPageGroup.value?.url,
    );
  });

  const previousPage = computed(() =>
    currentPageIndex.value > 0
      ? pageGroups.value[currentPageIndex.value - 1]
      : null,
  );

  const nextPage = computed(() =>
    currentPageIndex.value >= 0 &&
    currentPageIndex.value + 1 < pageGroups.value.length
      ? pageGroups.value[currentPageIndex.value + 1]
      : null,
  );

  function navigateToRecord(targetId: string) {
    if (!targetId) return;
    router.push(`/highlights/${targetId}`);
  }

  function goToPage(page: (typeof pageGroups.value)[number] | null) {
    if (!page) return;
    const records = sortRecordsForPage(page.records, "range");
    if (records.length) navigateToRecord(records[0].id);
  }

  const goToPreviousPage = () => goToPage(previousPage.value);
  const goToNextPage = () => goToPage(nextPage.value);

  const backToList = () => router.push("/highlights");

  return {
    record,
    recordId,
    editing,
    noteDraft,
    tagsDraft,
    saving,
    saveError,
    availableTags,
    pageRecords,
    pageTitle,
    pageTitleShort,
    currentPageGroup,
    previousPage,
    nextPage,
    startEditing,
    stopEditing,
    saveEditing,
    navigateToRecord,
    goToPreviousPage,
    goToNextPage,
    backToList,
  };
}

export type HighlightViewerApi = ReturnType<typeof useHighlightViewer>;
