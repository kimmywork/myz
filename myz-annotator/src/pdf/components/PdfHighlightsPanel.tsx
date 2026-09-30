import { Highlighter } from "@lucide/vue";
import { storeToRefs } from "pinia";
import { computed, defineComponent, ref, watch } from "vue";
import {
  useReaderStore,
  type HighlightFilter,
} from "../stores/reader-store.js";
import ReaderHighlightRow from "@/reader/ReaderHighlightRow.js";
import { excerpt } from "@/reader/text.js";

const FILTERS: { value: HighlightFilter; label: string }[] = [
  { value: "all", label: "全部" },
  { value: "highlight", label: "划线" },
  { value: "clip", label: "摘录" },
];

const PAGE_SIZE = 60;

export default defineComponent({
  name: "PdfHighlightsPanel",
  setup() {
    const store = useReaderStore();
    const {
      highlightCounts,
      highlightGroups,
      highlightFilter,
      highlightQuery,
      activeId,
    } = storeToRefs(store);

    const visibleCount = ref(PAGE_SIZE);
    watch([highlightFilter, highlightQuery], () => {
      visibleCount.value = PAGE_SIZE;
    });

    const totalRecords = computed(() =>
      highlightGroups.value.reduce(
        (sum, group) => sum + group.records.length,
        0,
      ),
    );
    const limitedGroups = computed(() => {
      let remaining = visibleCount.value;
      const groups: typeof highlightGroups.value = [];
      for (const group of highlightGroups.value) {
        if (remaining <= 0) break;
        const records = group.records.slice(0, remaining);
        remaining -= records.length;
        groups.push({ ...group, records });
      }
      return groups;
    });

    const emptyLabel = computed(() => {
      if (!highlightCounts.value.all) {
        return "还没有划线，选中文字即可创建";
      }
      if (highlightQuery.value.trim()) {
        return "没有匹配的划线";
      }
      return "没有符合筛选的划线";
    });

    return () => [
      <div class="reader-hl__filters" key="filters">
        {FILTERS.map((filter) => (
          <button
            type="button"
            key={filter.value}
            class={
              "reader-hl__filter" +
              (highlightFilter.value === filter.value ? " is-active" : "")
            }
            disabled={!highlightCounts.value[filter.value]}
            onClick={() => (store.highlightFilter = filter.value)}
          >
            {filter.label}
            {highlightCounts.value[filter.value]
              ? ` ${highlightCounts.value[filter.value]}`
              : ""}
          </button>
        ))}
      </div>,
      <input
        key="search"
        type="search"
        class="reader-hl__search"
        placeholder="搜索划线、批注、标签…"
        aria-label="搜索划线"
        value={highlightQuery.value}
        onInput={(event: Event) => {
          store.highlightQuery = (event.target as HTMLInputElement).value;
        }}
      />,
      !highlightGroups.value.length ? (
        <div class="reader-state" key="empty">
          <Highlighter size={20} aria-hidden="true" />
          <span class="reader-state__title">{emptyLabel.value}</span>
        </div>
      ) : (
        <div class="reader-hl__groups" key="groups">
          {limitedGroups.value.map((group) => (
            <section class="reader-hl__group" key={group.pageNumber}>
              <h4 class="reader-hl__page">第 {group.pageNumber} 页</h4>
              <ul class="reader-hl__list">
                {group.records.map((record) => (
                  <li key={record.id}>
                    <ReaderHighlightRow
                      record={record}
                      active={record.id === activeId.value}
                      text={excerpt(record.text)}
                      note={record.note ? excerpt(record.note, 48) : ""}
                      showTags
                      onSelect={() => void store.focusAnnotation(record)}
                    />
                  </li>
                ))}
              </ul>
            </section>
          ))}
          {visibleCount.value < totalRecords.value ? (
            <button
              type="button"
              class="reader-hl__filter"
              onClick={() => (visibleCount.value += PAGE_SIZE)}
            >
              显示更多（{visibleCount.value} / {totalRecords.value}）
            </button>
          ) : null}
        </div>
      ),
    ];
  },
});
