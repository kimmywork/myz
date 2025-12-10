import { defineComponent, PropType } from "vue";
import McpServerForm, { McpServerFormModel } from "./McpServerForm";

type NewDraft = McpServerFormModel;

export default defineComponent({
  name: "McpServerAddForm",
  props: {
    model: {
      type: Object as PropType<NewDraft>,
      required: true,
    },
    visible: {
      type: Boolean,
      required: true,
    },
    saving: {
      type: Boolean,
      default: false,
    },
    onSave: {
      type: Function as PropType<() => void>,
      required: true,
    },
    onCancel: {
      type: Function as PropType<() => void>,
      required: true,
    },
  },
  setup(props) {
    return () =>
      props.visible ? (
        <McpServerForm
          mode="create"
          model={props.model}
          saving={props.saving}
          running={false}
          onSave={props.onSave}
          onCancel={props.onCancel}
        />
      ) : null;
  },
});
