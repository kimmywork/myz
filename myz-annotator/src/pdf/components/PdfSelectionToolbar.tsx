import { RECORD_KINDS } from "@myz/shared/types";
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
            onClick={() => store.createAnnotation(RECORD_KINDS.HIGHLIGHT)}
          >
            高亮
          </button>
          <button
            type="button"
            onClick={() => store.createAnnotation(RECORD_KINDS.CLIP)}
          >
            保存文字
          </button>
          <button type="button" onClick={store.clearSelection}>
            取消
          </button>
        </div>
      ) : null;
  },
});
