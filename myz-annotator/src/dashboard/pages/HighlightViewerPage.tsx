import {
  computed,
  defineComponent,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
} from "vue";
import { useRoute, useRouter } from "vue-router";
import { useHighlightsStore } from "../stores/highlights.js";
import { useUIStore } from "../stores/ui.js";
import {
  getRecordKindLabel,
  groupRecordsByPage,
  sortRecordsForPage,
} from "@/dashboard/utils/records.js";

export default defineComponent({
  name: "HighlightViewerPage",
  setup() {
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

    const pageGroups = computed(() =>
      groupRecordsByPage(highlightsStore.highlights),
    );

    const currentPageGroup = computed(() => {
      if (!record.value) {
        return null;
      }
      const key = record.value.url || record.value.sourceUrl || "";
      return pageGroups.value.find((group) => group.url === key) || null;
    });

    const pageRecords = computed(() =>
      sortRecordsForPage(
        currentPageGroup.value?.records || [],
        uiStore.pageSortMode,
      ),
    );

    const pageTitle = computed(() => {
      return (
        currentPageGroup.value?.title ||
        currentPageGroup.value?.hostname ||
        record.value?.title ||
        record.value?.hostname ||
        "查看器"
      );
    });

    const pageTitleShort = computed(() => {
      const title = pageTitle.value;
      if (!title) {
        return "";
      }
      return title.length > 10 ? `${title.slice(0, 10)}…` : title;
    });

    const activeIndex = computed(() =>
      pageRecords.value.findIndex((item) => item.id === recordId.value),
    );

    const previousRecord = computed(() => {
      if (activeIndex.value <= 0) {
        return null;
      }
      return pageRecords.value[activeIndex.value - 1] || null;
    });

    const nextRecord = computed(() => {
      if (activeIndex.value < 0) {
        return null;
      }
      return pageRecords.value[activeIndex.value + 1] || null;
    });

    const currentPageIndex = computed(() => {
      if (!currentPageGroup.value) {
        return -1;
      }
      return pageGroups.value.findIndex(
        (group) => group.url === currentPageGroup.value?.url,
      );
    });

    const previousPage = computed(() => {
      if (currentPageIndex.value <= 0) {
        return null;
      }
      return pageGroups.value[currentPageIndex.value - 1] || null;
    });

    const nextPage = computed(() => {
      if (currentPageIndex.value < 0) {
        return null;
      }
      return pageGroups.value[currentPageIndex.value + 1] || null;
    });

    function navigateToRecord(targetId: string) {
      if (!targetId) {
        return;
      }
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

    function goToPreviousPage() {
      if (!previousPage.value) {
        return;
      }
      const records = sortRecordsForPage(
        previousPage.value.records,
        uiStore.pageSortMode,
      );
      if (records.length) {
        navigateToRecord(records[0].id);
      }
    }

    function goToNextPage() {
      if (!nextPage.value) {
        return;
      }
      const records = sortRecordsForPage(
        nextPage.value.records,
        uiStore.pageSortMode,
      );
      if (records.length) {
        navigateToRecord(records[0].id);
      }
    }

    function isNearBottom(el: HTMLElement) {
      const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
      return distance < 80;
    }

    function handleScroll() {
      const el = scrollRef.value;
      if (!el || autoAdvanceLock.value) {
        return;
      }
      if (isNearBottom(el)) {
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

    onMounted(() => {
      focusActiveRecord();
    });

    onBeforeUnmount(() => {
      autoAdvanceLock.value = false;
    });

    watch(recordId, () => {
      focusActiveRecord();
    });

    watch(
      () => uiStore.pageSortMode,
      () => {
        focusActiveRecord();
      },
    );

    return () => {
      if (highlightsStore.loadingHighlights) {
        return (
          <section class="rounded-3xl border border-slate-200 bg-white/90 p-6 text-slate-800 shadow-2xl dark:border-white/10 dark:bg-slate-900/60 dark:text-slate-100">
            正在加载…
          </section>
        );
      }

      if (!record.value) {
        return (
          <section class="rounded-3xl border border-slate-200 bg-white/90 p-6 text-slate-800 shadow-2xl dark:border-white/10 dark:bg-slate-900/60 dark:text-slate-100">
            <h2 class="text-xl font-semibold">未找到标注</h2>
            <p class="mt-2 text-sm text-slate-500 dark:text-slate-400">
              该标注可能已被删除或尚未同步。
            </p>
            <button
              type="button"
              class="mt-4 rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:text-slate-900 dark:border-white/10 dark:text-slate-300"
              onClick={() => router.push("/highlights")}
            >
              返回列表
            </button>
          </section>
        );
      }

      const pageUrl = record.value.sourceUrl || record.value.url || "";

      return (
        <section class="rounded-3xl border border-slate-200 bg-white/90 p-6 text-slate-800 shadow-2xl dark:border-white/10 dark:bg-slate-900/60 dark:text-slate-100">
          <header class="flex flex-col gap-4 border-b border-slate-200 pb-4 dark:border-white/10 lg:flex-row lg:items-center lg:justify-between">
            <div class="space-y-2">
              <button
                type="button"
                class="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-700 dark:text-slate-300 dark:hover:text-white"
                onClick={() => router.push("/highlights")}
              >
                返回高亮列表
              </button>
              <div>
                <h2
                  class="max-w-full text-xl font-semibold text-slate-900 dark:text-white"
                  title={pageTitle.value}
                >
                  {pageTitleShort.value}
                </h2>
                <p class="text-sm text-slate-500 dark:text-slate-400">
                  {currentPageGroup.value?.count || 0} 条标注 ·
                  {pageUrl ? (
                    <a
                      class="ml-2 text-indigo-600 hover:text-indigo-500 dark:text-indigo-300"
                      href={pageUrl}
                      target="_blank"
                      rel="noopener"
                    >
                      打开原网页
                    </a>
                  ) : null}
                </p>
              </div>
            </div>
            <div class="flex flex-wrap items-center gap-3">
              <div
                class="inline-flex rounded-full border border-slate-200 bg-white p-1 text-xs font-semibold text-slate-600 dark:border-white/10 dark:bg-slate-900/60 dark:text-slate-200"
                role="group"
                aria-label="排序切换"
              >
                <button
                  type="button"
                  class={[
                    "rounded-full px-4 py-1.5 transition",
                    uiStore.pageSortMode === "time"
                      ? "bg-indigo-600 text-white shadow"
                      : "text-slate-500 dark:text-slate-300",
                  ].join(" ")}
                  onClick={() => uiStore.setPageSortMode("time")}
                >
                  时间
                </button>
                <button
                  type="button"
                  class={[
                    "rounded-full px-4 py-1.5 transition",
                    uiStore.pageSortMode === "range"
                      ? "bg-indigo-600 text-white shadow"
                      : "text-slate-500 dark:text-slate-300",
                  ].join(" ")}
                  onClick={() => uiStore.setPageSortMode("range")}
                >
                  Range
                </button>
              </div>
              <div class="inline-flex items-center gap-2">
                <button
                  type="button"
                  class="rounded-full border border-slate-200 px-3 py-1.5 text-xs text-slate-600 hover:text-slate-900 disabled:opacity-40 dark:border-white/10 dark:text-slate-300"
                  disabled={!previousPage.value}
                  onClick={goToPreviousPage}
                >
                  上一页
                </button>
                <button
                  type="button"
                  class="rounded-full border border-slate-200 px-3 py-1.5 text-xs text-slate-600 hover:text-slate-900 disabled:opacity-40 dark:border-white/10 dark:text-slate-300"
                  disabled={!nextPage.value}
                  onClick={goToNextPage}
                >
                  下一页
                </button>
              </div>
            </div>
          </header>

          <div
            ref={scrollRef}
            class="mt-5 max-h-[70vh] space-y-4 overflow-y-auto pr-1"
            onScroll={handleScroll}
          >
            {pageRecords.value.map((item, index) => {
              const isActive = item.id === recordId.value;
              const hasContent = Boolean(item.text || item.html);
              const hasNote = Boolean(item.note);
              return (
                <article
                  key={item.id}
                  data-record-id={item.id}
                  class={[
                    "cursor-pointer rounded-2xl border p-4 transition",
                    isActive
                      ? "border-indigo-400 bg-indigo-50/70 shadow"
                      : "border-slate-200 bg-white hover:border-indigo-200 dark:border-white/10 dark:bg-slate-950/40",
                    index % 2 === 0
                      ? "dark:bg-slate-950/30"
                      : "dark:bg-slate-950/50",
                  ].join(" ")}
                  onClick={() => navigateToRecord(item.id)}
                >
                  <div class="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
                    <div class="flex flex-wrap items-center gap-2">
                      <span class="rounded-full border border-slate-200 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide dark:border-white/10">
                        {getRecordKindLabel(item)}
                      </span>
                      {(item.tags || []).length
                        ? (item.tags || []).map((tag) => (
                            <span
                              key={tag}
                              class="rounded-full border border-slate-200 px-2 py-0.5 text-[11px] text-slate-600 dark:border-white/10 dark:text-slate-300"
                            >
                              {tag}
                            </span>
                          ))
                        : null}
                    </div>
                    <span>{uiStore.formatDateTime(item.createdAt)}</span>
                  </div>

                  <div class="mt-3 text-sm text-slate-800 dark:text-slate-100">
                    {hasContent ? (
                      <div innerHTML={uiStore.renderHighlight(item)}></div>
                    ) : (
                      <p class="text-xs text-slate-400 dark:text-slate-500">
                        无可展示内容
                      </p>
                    )}
                  </div>

                  {hasNote ? (
                    <div class="mt-4 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600 dark:border-white/10 dark:bg-slate-900/60 dark:text-slate-300">
                      <div class="font-semibold text-slate-500 dark:text-slate-400">
                        批注
                      </div>
                      <div
                        class="mt-1 text-sm text-slate-700 dark:text-slate-200"
                        innerHTML={uiStore.formatNote(item.note || "")}
                      ></div>
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>

          <footer class="mt-4 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
            <div>
              当前条目：{activeIndex.value + 1} / {pageRecords.value.length}
            </div>
            <div>
              {previousRecord.value ? (
                <button
                  type="button"
                  class="text-indigo-600 hover:text-indigo-500 dark:text-indigo-300"
                  onClick={() => navigateToRecord(previousRecord.value!.id)}
                >
                  上一条
                </button>
              ) : null}
              {nextRecord.value ? (
                <button
                  type="button"
                  class="ml-3 text-indigo-600 hover:text-indigo-500 dark:text-indigo-300"
                  onClick={() => navigateToRecord(nextRecord.value!.id)}
                >
                  下一条
                </button>
              ) : null}
            </div>
          </footer>
        </section>
      );
    };
  },
});
