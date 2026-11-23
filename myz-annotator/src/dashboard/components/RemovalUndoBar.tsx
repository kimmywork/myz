import { UndoBar } from "@myz/dashboard-ui";
import { defineComponent } from "vue";
import type { PropType } from "vue";
import type { RowRemoval } from "../composables/useRowRemoval.js";

type RemovalUndoSession = Pick<
  RowRemoval<unknown>,
  "undoMessage" | "undo" | "pause" | "resume"
>;

/**
 * The undo bar a removal session drives (§4.30). Renders nothing while no
 * delete is pending — no disabled placeholder, just absence.
 */
export default defineComponent({
  name: "RemovalUndoBar",
  props: {
    session: {
      type: Object as PropType<RemovalUndoSession>,
      required: true,
    },
  },
  setup(props) {
    return () => {
      const message = props.session.undoMessage.value;
      if (!message) return null;
      return (
        <UndoBar
          message={message}
          onUndo={() => void props.session.undo()}
          onPause={props.session.pause}
          onResume={props.session.resume}
        />
      );
    };
  },
});
