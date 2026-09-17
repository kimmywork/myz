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
import { openPdfRecordInReader } from "@/pdf/open.js";

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
        "阅读器"
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
          <section class="rounded-panel border border-line bg-surface/90 p-6 text-text shadow-float dark:border-line dark:bg-surface dark:text-text">
            正在加载…
          </section>
        );
      }

      if (!record.value) {
        return (
          <section class="rounded-panel border border-line bg-surface/90 p-6 text-text shadow-float dark:border-line dark:bg-surface dark:text-text">
            <h2 class="text-heading font-semibold">未找到这条记录</h2>
            <p class="mt-2 text-compact text-muted">
              这条记录可能已被删除或尚未同步。
            </p>
            <button
              type="button"
              class="mt-4 rounded-full border border-line px-4 py-2 text-compact font-semibold text-muted hover:text-text dark:border-line dark:text-muted"
              onClick={() => router.push("/highlights")}
            >
              返回列表
            </button>
          </section>
        );
      }

      const pageUrl = record.value.sourceUrl || record.value.url || "";

      return (
        <section class="rounded-panel border border-line bg-surface/90 p-6 text-text shadow-float dark:border-line dark:bg-surface dark:text-text">
          <header class="flex flex-col gap-4 border-b border-line pb-4 dark:border-line lg:flex-row lg:items-center lg:justify-between">
            <div class="space-y-2">
              <button
                type="button"
                class="inline-flex items-center gap-2 text-compact text-muted hover:text-text dark:text-muted dark:hover:text-text"
                onClick={() => router.push("/highlights")}
              >
                返回划线列表
              </button>
              <div>
                <h2
                  class="max-w-full text-heading font-semibold text-text"
                  title={pageTitle.value}
                >
                  {pageTitleShort.value}
                </h2>
                <p class="text-compact text-muted">
                  {currentPageGroup.value?.count || 0} 条记录 ·
                  {pageUrl ? (
                    <a
                      class="ml-2 text-accent-text hover:text-accent-text dark:text-accent-text"
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
                class="inline-flex rounded-full border border-line bg-surface p-1 text-caption font-semibold text-muted dark:border-line dark:bg-surface dark:text-text"
                role="group"
                aria-label="排序切换"
              >
                <button
                  type="button"
                  class={[
                    "rounded-full px-4 py-1.5 transition",
                    uiStore.pageSortMode === "time"
                      ? "bg-accent text-on-accent "
                      : "text-muted dark:text-muted",
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
                      ? "bg-accent text-on-accent "
                      : "text-muted dark:text-muted",
                  ].join(" ")}
                  onClick={() => uiStore.setPageSortMode("range")}
                >
                  文中顺序
                </button>
              </div>
              <div class="inline-flex items-center gap-2">
                <button
                  type="button"
                  class="rounded-full border border-line px-3 py-1.5 text-caption text-muted hover:text-text disabled:opacity-40 dark:border-line dark:text-muted"
                  disabled={!previousPage.value}
                  onClick={goToPreviousPage}
                >
                  上一页
                </button>
                <button
                  type="button"
                  class="rounded-full border border-line px-3 py-1.5 text-caption text-muted hover:text-text disabled:opacity-40 dark:border-line dark:text-muted"
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
                    "cursor-pointer rounded-control border p-4 transition",
                    isActive
                      ? "border-accent bg-accent/10 "
                      : "border-line bg-surface hover:border-accent dark:border-line dark:bg-surface-2",
                    index % 2 === 0
                      ? "dark:bg-bg"
                      : "dark:bg-bg",
                  ].join(" ")}
                  onClick={() => navigateToRecord(item.id)}
                >
                  <div class="flex flex-wrap items-center justify-between gap-2 text-caption text-muted">
                    <div class="flex flex-wrap items-center gap-2">
                      <span class="inline-flex h-[22px] items-center rounded-tag bg-tag-bg px-2 text-tag font-semibold uppercase tracking-wide text-tag-fg">
                        {getRecordKindLabel(item)}
                      </span>
                      {(item.tags || []).length
                        ? (item.tags || []).map((tag) => (
                            <span
                              key={tag}
                              class="inline-flex h-[22px] items-center rounded-tag bg-tag-bg px-2 text-tag font-semibold text-tag-fg"
                            >
                              {tag}
                            </span>
                          ))
                        : null}
                    </div>
                    <div class="flex items-center gap-2">
                      {item.pdfLocator ? (
                        <span class="rounded-full bg-warn-bg px-2 py-0.5 text-tag font-semibold text-warn dark:bg-warn/20 dark:text-warn">
                          第 {item.pdfLocator.pageNumber} 页
                        </span>
                      ) : null}
                      {item.pdfLocator ? (
                        <button
                          type="button"
                          class="rounded-full border border-warn px-2 py-0.5 text-tag font-semibold text-warn hover:bg-warn-bg dark:border-warn/30 dark:text-warn dark:hover:bg-warn/10"
                          onClick={(event: Event) => {
                            event.stopPropagation();
                            void openPdfRecordInReader(item);
                          }}
                        >
                          在阅读器中打开
                        </button>
                      ) : null}
                      <span>{uiStore.formatDateTime(item.createdAt)}</span>
                    </div>
                  </div>

                  <div class="read-body mt-3 text-text">
                    {hasContent ? (
                      <div innerHTML={uiStore.renderHighlight(item)}></div>
                    ) : (
                      <p class="text-caption text-muted">
                        无可展示内容
                      </p>
                    )}
                  </div>

                  {hasNote ? (
                    <div class="mt-4 rounded-control border border-line bg-bg px-3 py-2 text-caption text-muted dark:border-line dark:bg-surface dark:text-muted">
                      <div class="font-semibold text-muted">
                        批注
                      </div>
                      <div
                        class="read-body mt-1 text-text"
                        innerHTML={uiStore.formatNote(item.note || "")}
                      ></div>
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>

          <footer class="mt-4 flex flex-wrap items-center justify-between gap-2 text-caption text-muted">
            <div>
              当前条目：{activeIndex.value + 1} / {pageRecords.value.length}
            </div>
            <div>
              {previousRecord.value ? (
                <button
                  type="button"
                  class="text-accent-text hover:text-accent-text dark:text-accent-text"
                  onClick={() => navigateToRecord(previousRecord.value!.id)}
                >
                  上一条
                </button>
              ) : null}
              {nextRecord.value ? (
                <button
                  type="button"
                  class="ml-3 text-accent-text hover:text-accent-text dark:text-accent-text"
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
