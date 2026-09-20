import { RECORD_KINDS } from "@myz/shared/types";
import { storeToRefs } from "pinia";
import { defineComponent } from "vue";
import { useReaderStore } from "../stores/reader-store.js";
import ReaderSelectionTools from "@/reader/ReaderSelectionTools.js";

/**
 * PDF selection toolbar. A thin wiring layer over the shared
 * `ReaderSelectionTools`; the store owns the selection text and anchor.
 */
export default defineComponent({
  name: "PdfSelectionToolbar",
  setup() {
    const store = useReaderStore();
    const { selection, selectionPos } = storeToRefs(store);

    return () =>
      selection.value ? (
        <ReaderSelectionTools
          top={selectionPos.value.top}
          left={selectionPos.value.left}
          bottom={selectionPos.value.bottom}
          text={selection.value.text}
          onHighlight={() => store.createAnnotation(RECORD_KINDS.HIGHLIGHT)}
          onClip={() => store.createAnnotation(RECORD_KINDS.CLIP)}
          onClose={store.clearSelection}
        />
      ) : null;
  },
});
