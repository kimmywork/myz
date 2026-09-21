import { ChevronDown, ChevronRight } from "@lucide/vue";
import { defineComponent, type PropType, type VNode } from "vue";

export interface ReaderOutlineItem {
  key: string;
  label: string;
  /** Indentation level; callers cap it when the spec limits nesting. */
  depth: number;
  /** Trailing page label (PDF). Omitted by readers without pages (EPUB). */
  pageNumber?: number | string | null;
  /** Native title attribute for truncated labels. */
  title?: string;
  current?: boolean;
  disabled?: boolean;
  expandable?: boolean;
  expanded?: boolean;
  onToggle?: () => void;
  onSelect: () => void;
  children?: ReaderOutlineItem[];
}

/**
 * Recursive outline/tree shared by the PDF outline and the EPUB TOC. Callers
 * normalise their own entry shape into `ReaderOutlineItem`, which also keeps
 * the "only the first current item wins" logic where the data lives.
 */
export default defineComponent({
  name: "ReaderOutlineList",
  props: {
    items: { type: Array as PropType<ReaderOutlineItem[]>, required: true },
    /** Horizontal indent per depth step; PDF uses 14, EPUB 12. */
    indentUnit: { type: Number, default: 12 },
  },
  setup(props) {
    function renderItems(items: ReaderOutlineItem[]): VNode[] {
      return items.map((item) => (
        <li class="reader-outline__item" key={item.key}>
          <div
            class={
              "reader-outline__row" +
              (item.current ? " is-current" : "") +
              (item.disabled ? " is-disabled" : "")
            }
            style={{ paddingLeft: `${6 + item.depth * props.indentUnit}px` }}
          >
            {item.expandable ? (
              <button
                type="button"
                class="reader-outline__toggle"
                aria-label={item.expanded ? "折叠" : "展开"}
                onClick={item.onToggle}
              >
                {item.expanded ? (
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
              disabled={item.disabled}
              title={item.title}
              onClick={item.onSelect}
            >
              <span class="reader-outline__label">{item.label}</span>
              {item.pageNumber !== undefined && item.pageNumber !== null ? (
                <span class="reader-outline__page">{item.pageNumber}</span>
              ) : null}
            </button>
          </div>
          {item.expandable && item.expanded && item.children?.length ? (
            <ul class="reader-outline__children">
              {renderItems(item.children)}
            </ul>
          ) : null}
        </li>
      ));
    }

    return () => <ul class="reader-outline">{renderItems(props.items)}</ul>;
  },
});
