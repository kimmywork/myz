import { DEFAULT_COLOR, RECORD_KINDS } from "@myz/shared/types";
import { storeToRefs } from "pinia";
import { computed, defineComponent } from "vue";
import {
  useReaderStore,
  type HighlightFilter,
} from "../stores/reader-store.js";

const FILTERS: { value: HighlightFilter; label: string }[] = [
  { value: "all", label: "全部" },
  { value: "highlight", label: "高亮" },
  { value: "clip", label: "文字" },
];

function excerpt(text: string, max = 72): string {
  const collapsed = (text || "").replace(/\s+/g, " ").trim();
  return collapsed.length > max ? `${collapsed.slice(0, max)}…` : collapsed;
}

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

    const emptyLabel = computed(() => {
      if (!highlightCounts.value.all) {
        return "还没有标注，选中文字即可创建";
      }
      if (highlightQuery.value.trim()) {
        return "没有匹配的标注";
      }
      return "没有符合筛选的标注";
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
        placeholder="搜索标注、批注、标签…"
        aria-label="搜索标注"
        value={highlightQuery.value}
        onInput={(event: Event) => {
          store.highlightQuery = (event.target as HTMLInputElement).value;
        }}
      />,
      !highlightGroups.value.length ? (
        <p class="reader-sidebar__hint" key="empty">
          {emptyLabel.value}
        </p>
      ) : (
        <div class="reader-hl__groups" key="groups">
          {highlightGroups.value.map((group) => (
            <section class="reader-hl__group" key={group.pageNumber}>
              <h4 class="reader-hl__page">第 {group.pageNumber} 页</h4>
              <ul class="reader-hl__list">
                {group.records.map((record) => (
                  <li key={record.id}>
                    <button
                      type="button"
                      class={
                        "reader-hl__item" +
                        (record.id === activeId.value ? " is-active" : "")
                      }
                      onClick={() => void store.focusAnnotation(record)}
                    >
                      <span
                        class="reader-hl__mark"
                        data-kind={record.kind}
                        style={{
                          background:
                            record.kind === RECORD_KINDS.CLIP
                              ? "transparent"
                              : record.color || DEFAULT_COLOR,
                        }}
                      />
                      <span class="reader-hl__body">
                        <span class="reader-hl__text">
                          {excerpt(record.text)}
                        </span>
                        {record.note ? (
                          <span class="reader-hl__note">
                            📝 {excerpt(record.note, 48)}
                          </span>
                        ) : null}
                        {record.tags?.length ? (
                          <span class="reader-hl__tags">
                            {record.tags.join(" · ")}
                          </span>
                        ) : null}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      ),
    ];
  },
});
