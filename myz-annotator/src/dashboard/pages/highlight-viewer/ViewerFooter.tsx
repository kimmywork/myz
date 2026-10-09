import { defineComponent } from "vue";
import type { PropType } from "vue";
import type { HighlightViewerApi } from "./useHighlightViewer.js";

const LINK = "text-accent-text hover:text-accent-text dark:text-accent-text";

/** Page position + previous/next record links. */
export default defineComponent({
  name: "ViewerFooter",
  props: {
    api: { type: Object as PropType<HighlightViewerApi>, required: true },
  },
  setup(props) {
    return () => {
      const a = props.api;
      return (
        <footer class="mt-4 flex flex-wrap items-center justify-between gap-2 text-caption text-muted">
          <div>
            当前条目：{a.activeIndex.value + 1} / {a.pageRecords.value.length}
          </div>
          <div>
            {a.previousRecord.value ? (
              <button
                type="button"
                class={LINK}
                onClick={() => a.navigateToRecord(a.previousRecord.value!.id)}
              >
                上一条
              </button>
            ) : null}
            {a.nextRecord.value ? (
              <button
                type="button"
                class={`ml-3 ${LINK}`}
                onClick={() => a.navigateToRecord(a.nextRecord.value!.id)}
              >
                下一条
              </button>
            ) : null}
          </div>
        </footer>
      );
    };
  },
});
