import type { MyZRecord } from "@myz/shared/types";
import { defineComponent, type PropType } from "vue";
import { useEpubReaderStore } from "../stores/reader-store.js";
import ReaderHighlightRow from "@/reader/ReaderHighlightRow.js";

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
    return () =>
      store.highlightList.length ? (
        <ul class="reader-hl__list">
          {store.highlightList.map((record) => (
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
        </ul>
      ) : (
        <p class="reader-sidebar__hint">这里还没有记录</p>
      );
  },
});
