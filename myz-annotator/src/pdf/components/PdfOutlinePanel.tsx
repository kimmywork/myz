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

    function renderItems(items: PdfOutlineEntry[]): VNode[] {
      return items.map((entry) => {
        const hasChildren = entry.children.length > 0;
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
              style={{ paddingLeft: `${6 + entry.depth * 14}px` }}
            >
              {hasChildren ? (
                <button
                  type="button"
                  class="reader-outline__toggle"
                  aria-label={expanded ? "折叠" : "展开"}
                  onClick={() => store.toggleOutline(entry.id)}
                >
                  {expanded ? "▾" : "▸"}
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
            {hasChildren && expanded ? (
              <ul class="reader-outline__children">
                {renderItems(entry.children)}
              </ul>
            ) : null}
          </li>
        );
      });
    }

    return () => {
      if (outlineStatus.value === "loading") {
        return <p class="reader-sidebar__hint">目录加载中…</p>;
      }
      if (outlineStatus.value === "error") {
        return <p class="reader-sidebar__hint">目录读取失败</p>;
      }
      if (!outlineCount.value) {
        return <p class="reader-sidebar__hint">该 PDF 没有目录</p>;
      }
      return <ul class="reader-outline">{renderItems(outline.value)}</ul>;
    };
  },
});
