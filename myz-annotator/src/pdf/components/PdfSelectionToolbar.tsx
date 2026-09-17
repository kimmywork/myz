import { RECORD_KINDS } from "@myz/shared/types";
import { Highlighter, Paperclip, X } from "@lucide/vue";
import { storeToRefs } from "pinia";
import { defineComponent } from "vue";
import { useReaderStore } from "../stores/reader-store.js";

export default defineComponent({
  name: "PdfSelectionToolbar",
  setup() {
    const store = useReaderStore();
    const { selection, selectionPos } = storeToRefs(store);

    return () =>
      selection.value ? (
        <div
          class="selection-toolbar"
          style={{
            top: `${selectionPos.value.top}px`,
            left: `${selectionPos.value.left}px`,
          }}
        >
          <button
            type="button"
            aria-label="划线"
            title="划线"
            onClick={() => store.createAnnotation(RECORD_KINDS.HIGHLIGHT)}
          >
            <Highlighter size={16} aria-hidden="true" />
          </button>
          <button
            type="button"
            aria-label="摘录"
            title="摘录"
            onClick={() => store.createAnnotation(RECORD_KINDS.CLIP)}
          >
            <Paperclip size={16} aria-hidden="true" />
          </button>
          <button
            type="button"
            aria-label="取消"
            title="取消"
            onClick={store.clearSelection}
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>
      ) : null;
  },
});
