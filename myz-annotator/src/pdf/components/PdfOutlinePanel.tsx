import { BookOpen, TriangleAlert } from "@lucide/vue";
import { storeToRefs } from "pinia";
import { defineComponent } from "vue";
import type { PdfOutlineEntry } from "../pdf-document.js";
import { useReaderStore } from "../stores/reader-store.js";
import ReaderOutlineList, {
  type ReaderOutlineItem,
} from "@/reader/ReaderOutlineList.js";

export default defineComponent({
  name: "PdfOutlinePanel",
  setup() {
    const store = useReaderStore();
    const { outline, outlineStatus, outlineCount, currentOutlineId } =
      storeToRefs(store);

    function toItems(
      entries: PdfOutlineEntry[],
      level = 0,
    ): ReaderOutlineItem[] {
      return entries.map((entry) => {
        // §4.10 目录最多两层：只有顶层可展开，子项不再递归
        const canExpand = level === 0 && entry.children.length > 0;
        const expanded = store.expandedOutline.has(entry.id);
        return {
          key: entry.id,
          label: entry.title,
          title: entry.title,
          depth: Math.min(entry.depth, 1),
          pageNumber: entry.pageNumber || null,
          disabled: !entry.pageNumber,
          current: entry.id === currentOutlineId.value,
          expandable: canExpand,
          expanded,
          onToggle: () => store.toggleOutline(entry.id),
          onSelect: () => void store.goToOutline(entry),
          children:
            canExpand && expanded
              ? toItems(entry.children, level + 1)
              : undefined,
        };
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
      return (
        <ReaderOutlineList items={toItems(outline.value)} indentUnit={14} />
      );
    };
  },
});
