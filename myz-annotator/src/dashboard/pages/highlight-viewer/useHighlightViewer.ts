import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
} from "vue";
import { useRoute, useRouter } from "vue-router";
import { useHighlightsStore } from "../../stores/highlights.js";
import { useUIStore } from "../../stores/ui.js";
import {
  groupRecordsByPage,
  sortRecordsForPage,
} from "@/dashboard/utils/records.js";

/** State/navigation/logic for the highlight reader page. */
export function useHighlightViewer() {
  const route = useRoute();
  const router = useRouter();
  const highlightsStore = useHighlightsStore();
  const uiStore = useUIStore();
  const scrollRef = ref<HTMLElement | null>(null);
  const autoAdvanceLock = ref(false);

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

  const pageGroups = computed(() =>
    groupRecordsByPage(highlightsStore.highlights),
  );

  const currentPageGroup = computed(() => {
    if (!record.value) return null;
    const key = record.value.url || record.value.sourceUrl || "";
    return pageGroups.value.find((group) => group.url === key) || null;
  });

  const pageRecords = computed(() =>
    sortRecordsForPage(
      currentPageGroup.value?.records || [],
      uiStore.pageSortMode,
    ),
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

  const activeIndex = computed(() =>
    pageRecords.value.findIndex((item) => item.id === recordId.value),
  );

  const previousRecord = computed(() =>
    activeIndex.value > 0 ? pageRecords.value[activeIndex.value - 1] : null,
  );

  const nextRecord = computed(() =>
    activeIndex.value >= 0 && activeIndex.value + 1 < pageRecords.value.length
      ? pageRecords.value[activeIndex.value + 1]
      : null,
  );

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

  function goToNextRecord(): boolean {
    if (nextRecord.value) {
      navigateToRecord(nextRecord.value.id);
      return true;
    }
    if (nextPage.value) {
      const records = sortRecordsForPage(
        nextPage.value.records,
        uiStore.pageSortMode,
      );
      if (records.length) {
        navigateToRecord(records[0].id);
        return true;
      }
    }
    return false;
  }

  function goToPage(page: (typeof pageGroups.value)[number] | null) {
    if (!page) return;
    const records = sortRecordsForPage(page.records, uiStore.pageSortMode);
    if (records.length) navigateToRecord(records[0].id);
  }

  const goToPreviousPage = () => goToPage(previousPage.value);
  const goToNextPage = () => goToPage(nextPage.value);

  function handleScroll() {
    const el = scrollRef.value;
    if (!el || autoAdvanceLock.value) return;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (distance < 80) {
      autoAdvanceLock.value = true;
      const didNavigate = goToNextRecord();
      if (!didNavigate) {
        setTimeout(() => {
          autoAdvanceLock.value = false;
        }, 300);
      }
    }
  }

  async function focusActiveRecord() {
    autoAdvanceLock.value = true;
    await nextTick();
    const el = scrollRef.value?.querySelector(
      `[data-record-id="${recordId.value}"]`,
    ) as HTMLElement | null;
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
    setTimeout(() => {
      autoAdvanceLock.value = false;
    }, 400);
  }

  onMounted(() => focusActiveRecord());
  onBeforeUnmount(() => {
    autoAdvanceLock.value = false;
  });
  watch(recordId, () => focusActiveRecord());
  watch(
    () => uiStore.pageSortMode,
    () => focusActiveRecord(),
  );

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
    activeIndex,
    previousRecord,
    nextRecord,
    previousPage,
    nextPage,
    scrollRef,
    startEditing,
    stopEditing,
    saveEditing,
    navigateToRecord,
    goToPreviousPage,
    goToNextPage,
    handleScroll,
    backToList,
  };
}

export type HighlightViewerApi = ReturnType<typeof useHighlightViewer>;
