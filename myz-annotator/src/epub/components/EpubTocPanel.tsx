import { storeToRefs } from "pinia";
import { computed, defineComponent } from "vue";
import type { EpubTocEntry } from "../parse.js";
import { useEpubReaderStore } from "../stores/reader-store.js";
import { filterToc } from "../toc.js";
import ReaderOutlineList, {
  type ReaderOutlineItem,
} from "@/reader/ReaderOutlineList.js";

/**
 * EPUB table of contents: a search field over the spine outline. Expansion
 * state and the current section live in the store so the shell can expand the
 * path when a chapter loads or the reading position moves.
 */
export default defineComponent({
  name: "EpubTocPanel",
  setup() {
    const store = useEpubReaderStore();
    const { toc, tocQuery, expandedToc, currentTocHref } = storeToRefs(store);

    const query = computed(() => tocQuery.value.trim().toLowerCase());
    const list = computed(() =>
      query.value ? filterToc(toc.value, query.value) : toc.value,
    );

    // Only the first entry matching the current target is marked, so a parent
    // does not light up together with the child section that is active.
    function toItems(
      entries: EpubTocEntry[],
      state: { matched: boolean } = { matched: false },
    ): ReaderOutlineItem[] {
      return entries.map((entry) => {
        const isCurrent = !state.matched && entry.href === currentTocHref.value;
        if (isCurrent) {
          state.matched = true;
        }
        const hasChildren = entry.children.length > 0;
        const expanded =
          hasChildren &&
          (query.value.length > 0 || expandedToc.value.has(entry.href));
        return {
          key: `${entry.href}:${entry.label}`,
          label: entry.label || entry.href,
          depth: entry.depth,
          current: isCurrent,
          expandable: hasChildren,
          expanded,
          onToggle: () => store.toggleTocEntry(entry.href),
          onSelect: () => {
            store.openTocEntry(entry.href);
            store.expandTocPath(entry.href);
          },
          children: expanded ? toItems(entry.children, state) : undefined,
        };
      });
    }

    const items = computed(() => toItems(list.value));

    return () => {
      if (!toc.value.length) {
        return <p class="reader-sidebar__hint">这本 EPUB 没有目录</p>;
      }
      return (
        <div class="epub-toc-pane">
          <input
            class="reader-hl__search"
            type="search"
            placeholder="搜索目录…"
            aria-label="搜索目录"
            value={tocQuery.value}
            onInput={(event: Event) => {
              tocQuery.value = (event.target as HTMLInputElement).value;
            }}
          />
          {!items.value.length ? (
            <p class="reader-sidebar__hint">没有匹配的目录</p>
          ) : (
            <ReaderOutlineList items={items.value} indentUnit={12} />
          )}
        </div>
      );
    };
  },
});
