import {
  BookOpen,
  ChevronDown,
  ChevronRight,
  TriangleAlert,
} from "@lucide/vue";
import { storeToRefs } from "pinia";
import { defineComponent, type VNode } from "vue";
import type { PdfOutlineEntry } from "../pdf-document.js";
import { useReaderStore } from "../stores/reader-store.js";

export default defineComponent({
  name: "PdfOutlinePanel",
  setup() {
    const store = useReaderStore();
    const { outline, outlineStatus, outlineCount, currentOutlineId } =
      storeToRefs(store);

    function renderItems(items: PdfOutlineEntry[], level = 0): VNode[] {
      return items.map((entry) => {
        // §4.10 目录最多两层：只有顶层可展开，子项不再递归
        const canExpand = level === 0 && entry.children.length > 0;
        const expanded = store.expandedOutline.has(entry.id);
        const isCurrent = entry.id === currentOutlineId.value;
        return (
          <li class="reader-outline__item" key={entry.id}>
            <div
              class={
                "reader-outline__row" +
                (isCurrent ? " is-current" : "") +
                (entry.pageNumber ? "" : " is-disabled")
              }
              style={{ paddingLeft: `${6 + Math.min(entry.depth, 1) * 14}px` }}
            >
              {canExpand ? (
                <button
                  type="button"
                  class="reader-outline__toggle"
                  aria-label={expanded ? "折叠" : "展开"}
                  onClick={() => store.toggleOutline(entry.id)}
                >
                  {expanded ? (
                    <ChevronDown size={12} aria-hidden="true" />
                  ) : (
                    <ChevronRight size={12} aria-hidden="true" />
                  )}
                </button>
              ) : (
                <span class="reader-outline__toggle reader-outline__toggle--leaf" />
              )}
              <button
                type="button"
                class="reader-outline__title"
                disabled={!entry.pageNumber}
                title={entry.title}
                onClick={() => void store.goToOutline(entry)}
              >
                <span class="reader-outline__label">{entry.title}</span>
                {entry.pageNumber ? (
                  <span class="reader-outline__page">{entry.pageNumber}</span>
                ) : null}
              </button>
            </div>
            {canExpand && expanded ? (
              <ul class="reader-outline__children">
                {renderItems(entry.children, level + 1)}
              </ul>
            ) : null}
          </li>
        );
      });
    }

    return () => {
      if (outlineStatus.value === "loading") {
        return (
          <div class="reader-state">
            <div style="width: 100%">
              <div class="reader-skeleton reader-skeleton--w1" />
              <div class="reader-skeleton reader-skeleton--w2" />
            </div>
            <span>目录加载中…</span>
          </div>
        );
      }
      if (outlineStatus.value === "error") {
        return (
          <div class="reader-state reader-state--error">
            <TriangleAlert size={20} aria-hidden="true" />
            <span class="reader-state__title">目录读取失败</span>
            <span>重新打开这份 PDF 试试</span>
          </div>
        );
      }
      if (!outlineCount.value) {
        return (
          <div class="reader-state">
            <BookOpen size={20} aria-hidden="true" />
            <span class="reader-state__title">该 PDF 没有目录</span>
          </div>
        );
      }
      return <ul class="reader-outline">{renderItems(outline.value)}</ul>;
    };
  },
});
