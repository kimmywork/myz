import { defineComponent } from "vue";
import type { PropType } from "vue";
import { useUIStore } from "../../stores/ui.js";
import type { HighlightViewerApi } from "./useHighlightViewer.js";

const PAGER_BTN =
  "rounded-full border border-line px-3 py-1.5 text-caption text-muted hover:text-text disabled:opacity-45 dark:border-line dark:text-muted";

/** Title, sort toggle, edit toggle and page navigation. */
export default defineComponent({
  name: "ViewerHeader",
  props: {
    api: { type: Object as PropType<HighlightViewerApi>, required: true },
  },
  setup(props) {
    const uiStore = useUIStore();
    return () => {
      const a = props.api;
      const pageUrl = a.record.value?.sourceUrl || a.record.value?.url || "";
      return (
        <header class="flex flex-col gap-4 border-b border-line pb-4 dark:border-line min-[900px]:flex-row min-[900px]:items-center min-[900px]:justify-between">
          <div class="space-y-2">
            <button
              type="button"
              class="inline-flex items-center gap-2 text-compact text-muted hover:text-text dark:text-muted dark:hover:text-text"
              onClick={a.backToList}
            >
              返回划线列表
            </button>
            <div>
              <h2
                class="max-w-full text-heading font-semibold text-text"
                title={a.pageTitle.value}
              >
                {a.pageTitleShort.value}
              </h2>
              <p class="text-compact text-muted">
                {a.currentPageGroup.value?.count || 0} 条记录 ·
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
            <button
              type="button"
              class="btn btn-secondary"
              onClick={() =>
                a.editing.value ? a.stopEditing() : a.startEditing()
              }
            >
              {a.editing.value ? "取消编辑" : "编辑"}
            </button>
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
                class={PAGER_BTN}
                disabled={!a.previousPage.value}
                onClick={a.goToPreviousPage}
              >
                上一页
              </button>
              <button
                type="button"
                class={PAGER_BTN}
                disabled={!a.nextPage.value}
                onClick={a.goToNextPage}
              >
                下一页
              </button>
            </div>
          </div>
        </header>
      );
    };
  },
});
