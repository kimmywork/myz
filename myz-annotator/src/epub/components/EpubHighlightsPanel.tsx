import type { MyZRecord } from "@myz/shared/types";
import { computed, defineComponent, ref, watch, type PropType } from "vue";
import { useEpubReaderStore } from "../stores/reader-store.js";
import ReaderHighlightRow from "@/reader/ReaderHighlightRow.js";

const PAGE_SIZE = 60;

/**
 * Flat list of EPUB highlights/clips, ordered by chapter. Selecting a row
 * asks the shell to jump to it (which needs the iframe document).
 */
export default defineComponent({
  name: "EpubHighlightsPanel",
  props: {
    activeId: { type: String as PropType<string | null>, default: null },
    onFocus: {
      type: Function as PropType<(record: MyZRecord) => void>,
      required: true,
    },
  },
  setup(props) {
    const store = useEpubReaderStore();
    const query = ref("");
    const visibleCount = ref(PAGE_SIZE);

    watch(query, () => {
      visibleCount.value = PAGE_SIZE;
    });

    const filtered = computed(() => {
      const needle = query.value.trim().toLowerCase();
      if (!needle) return store.highlightList;
      return store.highlightList.filter((record) =>
        [record.text, record.note, record.tags?.join(" ")]
          .filter(Boolean)
          .some((field) => String(field).toLowerCase().includes(needle)),
      );
    });

    return () =>
      store.highlightList.length ? (
        [
          <input
            key="search"
            type="search"
            class="reader-hl__search"
            placeholder="搜索划线、批注、标签…"
            aria-label="搜索标注"
            value={query.value}
            onInput={(event: Event) =>
              (query.value = (event.target as HTMLInputElement).value)
            }
          />,
          filtered.value.length ? (
            <ul class="reader-hl__list" key="list">
              {filtered.value.slice(0, visibleCount.value).map((record) => (
                <li key={record.id}>
                  <ReaderHighlightRow
                    record={record}
                    active={record.id === props.activeId}
                    text={record.text}
                    note={record.note || ""}
                    chapter={`第 ${(record.epubLocator?.spineIndex ?? 0) + 1} 章`}
                    onSelect={() => props.onFocus(record)}
                  />
                </li>
              ))}
              {visibleCount.value < filtered.value.length ? (
                <li>
                  <button
                    type="button"
                    class="reader-hl__filter"
                    onClick={() => (visibleCount.value += PAGE_SIZE)}
                  >
                    显示更多（{visibleCount.value} / {filtered.value.length}）
                  </button>
                </li>
              ) : null}
            </ul>
          ) : (
            <p class="reader-sidebar__hint" key="no-match">
              没有匹配的记录
            </p>
          ),
        ]
      ) : (
        <p class="reader-sidebar__hint">这里还没有记录</p>
      );
  },
});
