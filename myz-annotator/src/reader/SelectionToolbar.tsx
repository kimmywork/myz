import { X } from "@lucide/vue";
import { defineComponent, type PropType, type VNode } from "vue";

export interface SelectionToolbarAction {
  key: string;
  label: string;
  icon: VNode;
  onSelect: () => void;
}

/**
 * Presentational capture bar shared by the PDF and EPUB readers. The host
 * supplies the selection anchor and the actions; this component only renders
 * them with the shared `.selection-toolbar` chrome and a close button.
 */
export default defineComponent({
  name: "SelectionToolbar",
  props: {
    top: { type: Number, required: true },
    left: { type: Number, required: true },
    actions: {
      type: Array as PropType<SelectionToolbarAction[]>,
      required: true,
    },
    onClose: { type: Function as PropType<() => void>, required: true },
  },
  setup(props) {
    return () => (
      <div
        class="selection-toolbar"
        style={{
          top: `${props.top}px`,
          left: `${props.left}px`,
        }}
      >
        {props.actions.map((action) => (
          <button
            key={action.key}
            type="button"
            aria-label={action.label}
            title={action.label}
            onClick={action.onSelect}
          >
            {action.icon}
          </button>
        ))}
        <button
          type="button"
          aria-label="取消"
          title="取消"
          onClick={props.onClose}
        >
          <X size={16} aria-hidden="true" />
        </button>
      </div>
    );
  },
});
