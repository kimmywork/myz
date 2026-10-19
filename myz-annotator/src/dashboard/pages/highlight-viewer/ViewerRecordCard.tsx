import { resolveReaderLocator } from "@myz/core/source";
import type { MyZRecord } from "@myz/shared/types";
import { defineComponent } from "vue";
import type { PropType } from "vue";
import { useUIStore } from "../../stores/ui.js";
import type { HighlightViewerApi } from "./useHighlightViewer.js";
import { getRecordKindLabel } from "@/dashboard/utils/records.js";
import { openEpubRecordInReader } from "@/reader/open.js";
import { openPdfRecordInReader } from "@/reader/open.js";

/** One record card inside the scroll list. */
export default defineComponent({
  name: "ViewerRecordCard",
  props: {
    api: { type: Object as PropType<HighlightViewerApi>, required: true },
    item: { type: Object as PropType<MyZRecord>, required: true },
    isActive: { type: Boolean, default: false },
  },
  setup(props) {
    const uiStore = useUIStore();
    return () => {
      const a = props.api;
      const item = props.item;
      // Reader actions need the source-specific locator (PDF page / EPUB
      // chapter); PDF/EPUB records also carry a generic text `range`.
      const locator = resolveReaderLocator(item);
      const hasContent = Boolean(item.text || item.html);
      const hasNote = Boolean(item.note);
      return (
        <article
          data-record-id={item.id}
          class={[
            "cursor-pointer rounded-control border p-4 transition",
            props.isActive
              ? "border-line bg-surface-2 text-accent-text "
              : "border-line bg-surface hover:border-accent dark:border-line dark:bg-surface-2",
          ].join(" ")}
          onClick={() => a.navigateToRecord(item.id)}
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
              {locator?.kind === "pdf-page-rect" ? (
                <span class="rounded-full bg-warn-bg px-2 py-0.5 text-tag font-semibold text-warn dark:bg-warn/20 dark:text-warn">
                  第 {locator.value.pageNumber} 页
                </span>
              ) : locator?.kind === "epub" ? (
                <span class="rounded-full bg-warn-bg px-2 py-0.5 text-tag font-semibold text-warn dark:bg-warn/20 dark:text-warn">
                  第 {locator.value.spineIndex + 1} 章
                </span>
              ) : null}
              {locator?.kind === "pdf-page-rect" || locator?.kind === "epub" ? (
                <button
                  type="button"
                  class="rounded-full border border-warn px-2 py-0.5 text-tag font-semibold text-warn hover:bg-warn-bg dark:border-warn/30 dark:text-warn dark:hover:bg-warn/10"
                  onClick={(event: Event) => {
                    event.stopPropagation();
                    if (locator.kind === "epub") {
                      void openEpubRecordInReader(item);
                    } else {
                      void openPdfRecordInReader(item);
                    }
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
              <p class="text-caption text-muted">这里还没有内容</p>
            )}
          </div>

          {hasNote ? (
            <div class="mt-4 rounded-control border border-line bg-bg px-3 py-2 text-caption text-muted dark:border-line dark:bg-surface dark:text-muted">
              <div class="font-semibold text-muted">批注</div>
              <div
                class="read-body mt-1 text-text"
                innerHTML={uiStore.formatNote(item.note || "")}
              ></div>
            </div>
          ) : null}
        </article>
      );
    };
  },
});
