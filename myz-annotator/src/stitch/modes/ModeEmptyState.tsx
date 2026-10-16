import { defineComponent } from "vue";
import DropZone from "../components/DropZone";
import { useAssetsStore } from "../stores/assets";

/**
 * Shared empty state for the three editors: a drop/pick zone plus a numbered
 * "how to use" list. Pass the `<li>` items through the default slot.
 */
export default defineComponent({
  name: "ModeEmptyState",
  props: {
    title: { type: String, required: true },
  },
  setup(props, { slots }) {
    const store = useAssetsStore();
    return () => (
      <div class="stage-empty">
        <DropZone
          onFiles={(files: FileList | File[] | null) =>
            void store.addFiles(files)
          }
        />
        <div class="tips">
          <h3>{props.title}</h3>
          <ol>{slots.default?.()}</ol>
        </div>
      </div>
    );
  },
});
