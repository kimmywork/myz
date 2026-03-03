import { computed, defineComponent, onBeforeUnmount, onMounted, ref, Ref } from "vue";
import { useHighlightsStore } from "../stores/highlights.js";
import { useUIStore } from "../stores/ui.js";
import HighlightGroups from "./HighlightGroups.jsx";

export default defineComponent({
  name: "HighlightsPane",
  setup() {
    const highlightsStore = useHighlightsStore();
    const uiStore = useUIStore();
    const exportMenuOpen = ref(false);
    const exportMenuRef: Ref<HTMLElement | null> = ref(null);
    const isPageFiltered = computed(() => Boolean(uiStore.pageSidebarOpen));
    const currentPageLabel = computed(() => {
      if (!uiStore.pageFilter) {
        return "";
      }
      const matched = uiStore.pageGroups.find(
        (group) => group.url === uiStore.pageFilter,
      );
      return matched?.title || matched?.hostname || uiStore.pageFilter;
    });
    const currentPageLabelShort = computed(() => {
      const label = currentPageLabel.value;
      if (!label) {
        return "";
      }
      return label.length > 10 ? `${label.slice(0, 10)}…` : label;
    });

    function toggleExportMenu() {
      exportMenuOpen.value = !exportMenuOpen.value;
    }

    function handleExport(format: "json" | "markdown") {
      highlightsStore.handleExport(format);
      exportMenuOpen.value = false;
    }

    function handleDocumentClick(event: MouseEvent) {
      if (!exportMenuOpen.value) {
        return;
      }
      if (exportMenuRef.value?.contains(event.target as Node)) {
        return;
      }
      exportMenuOpen.value = false;
    }

    onMounted(() => {
      document.addEventListener("click", handleDocumentClick);
    });

    onBeforeUnmount(() => {
      document.removeEventListener("click", handleDocumentClick);
    });

    const panelClasses = computed(() => {
      const classes = [
        "rounded-3xl border border-slate-200 bg-white/90 p-5 shadow-2xl transition dark:border-white/10 dark:bg-slate-900/60",
      ];
      if (isPageFiltered.value) {
        classes.push(
          "flex h-[calc(100vh-160px)] min-h-0 flex-col overflow-hidden",
        );
      }
      return classes.join(" ");
    });

    const listClasses = computed(() => {
      const classes = ["mt-4"];
      if (isPageFiltered.value) {
        classes.push("flex-1 min-h-0 overflow-y-auto pr-1");
      }
      return classes.join(" ");
    });

    return () => (
      <section
        id="highlights-view"
        class={panelClasses.value}
        aria-labelledby="highlights-title"
      >
        <header class="flex flex-col gap-4 border-b border-slate-200 pb-4 lg:flex-row lg:items-center lg:justify-between dark:border-white/5">
          <div class="min-w-0 space-y-1">
            <h2
              class="text-xl font-semibold text-slate-900 dark:text-white"
              id="highlights-title"
            >
              全部记录
            </h2>
            <p class="text-sm text-slate-500 dark:text-slate-400">
              {uiStore.summaryText}
            </p>
            {uiStore.pageFilter ? (
              <div class="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                <span>页面筛选：</span>
                <span
                  class="max-w-[180px] truncate rounded-full border border-slate-200 px-3 py-1 text-xs text-slate-700 dark:border-white/10 dark:text-slate-200"
                  title={currentPageLabel.value}
                >
                  {currentPageLabelShort.value}
                </span>
                <button
                  type="button"
                  class="text-indigo-600 hover:text-indigo-500 dark:text-indigo-300"
                  onClick={uiStore.clearPageFilter}
                >
                  清除
                </button>
              </div>
            ) : null}
          </div>
          <div class="flex flex-nowrap items-center gap-3 overflow-x-auto lg:overflow-visible">
            <div
              class="inline-flex rounded-full border border-slate-200 bg-white p-1 text-xs font-semibold text-slate-600 dark:border-white/10 dark:bg-slate-900/60 dark:text-slate-200"
              role="group"
              aria-label="视图切换"
            >
              <button
                type="button"
                class={[
                  "rounded-full px-4 py-1.5 transition",
                  uiStore.view === "cards"
                    ? "bg-indigo-600 text-white shadow"
                    : "text-slate-500 dark:text-slate-300",
                ].join(" ")}
                onClick={() => uiStore.setView("cards")}
              >
                卡片
              </button>
              <button
                type="button"
                class={[
                  "rounded-full px-4 py-1.5 transition",
                  uiStore.view === "list"
                    ? "bg-indigo-600 text-white shadow"
                    : "text-slate-500 dark:text-slate-300",
                ].join(" ")}
                onClick={() => uiStore.setView("list")}
              >
                列表
              </button>
            </div>
            {uiStore.pageFilter ? (
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
            ) : null}
            <button
              type="button"
              class="inline-flex items-center rounded-full border border-slate-200 px-4 py-1.5 text-sm font-semibold text-slate-600 transition hover:border-indigo-400 hover:text-indigo-600 dark:border-white/20 dark:text-slate-200"
              onClick={uiStore.togglePageSidebar}
            >
              {uiStore.pageSidebarOpen ? "收起页面" : "页面筛选"}
            </button>
            <div class="relative" ref={exportMenuRef}>
              <button
                type="button"
                class="inline-flex items-center rounded-full border border-slate-200 px-4 py-1.5 text-sm font-semibold text-slate-600 transition hover:border-indigo-400 hover:text-indigo-600 dark:border-white/20 dark:text-slate-200"
                aria-haspopup="menu"
                aria-expanded={exportMenuOpen.value ? "true" : "false"}
                onClick={(event) => {
                  event.stopPropagation();
                  toggleExportMenu();
                }}
              >
                导出
                <span class="ml-1 text-xs text-slate-400">▼</span>
              </button>
              {exportMenuOpen.value ? (
                <div class="absolute right-0 z-20 mt-2 w-44 rounded-2xl border border-slate-200 bg-white py-1 text-sm shadow-xl dark:border-white/10 dark:bg-slate-900/80">
                  <button
                    type="button"
                    class="flex w-full items-center justify-between px-4 py-2 text-left text-slate-700 transition hover:bg-indigo-50 dark:text-slate-200 dark:hover:bg-indigo-500/10"
                    onClick={() => handleExport("json")}
                  >
                    导出 JSON
                  </button>
                  <button
                    type="button"
                    class="flex w-full items-center justify-between px-4 py-2 text-left text-slate-700 transition hover:bg-indigo-50 dark:text-slate-200 dark:hover:bg-indigo-500/10"
                    onClick={() => handleExport("markdown")}
                  >
                    导出 Markdown
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </header>
        <div class={listClasses.value}>
          <HighlightGroups />
        </div>
      </section>
    );
  },
});
