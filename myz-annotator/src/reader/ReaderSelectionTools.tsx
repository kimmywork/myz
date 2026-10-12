import { Highlighter, Languages, Paperclip } from "@lucide/vue";
import { defineComponent, type PropType } from "vue";
import ConnectedTranslationPopover from "./ConnectedTranslationPopover.js";
import SelectionToolbar from "./SelectionToolbar.js";
import { useTranslation } from "./translate/useTranslation.js";

/**
 * Shared reader selection tools: the capture bar plus the translation popover.
 *
 * Both readers render the same actions (划线 / 摘录 / 翻译) and the same
 * popover. The host only supplies the selection anchor, the selected text and
 * the record actions, so PDF and EPUB stay visually and behaviourally equal.
 */
export default defineComponent({
  name: "ReaderSelectionTools",
  props: {
    top: { type: Number, required: true },
    left: { type: Number, required: true },
    bottom: { type: Number, required: true },
    /** Selected text as paragraph blocks, so translation keeps the structure. */
    blocks: { type: Array as PropType<string[]>, required: true },
    onHighlight: { type: Function as PropType<() => void>, required: true },
    onClip: { type: Function as PropType<() => void>, required: true },
    onClose: { type: Function as PropType<() => void>, required: true },
  },
  setup(props) {
    const translation = useTranslation();

    function translateSelection() {
      if (!props.blocks.length) {
        return;
      }
      translation.openFor(props.blocks, {
        position: { top: props.top, left: props.left, bottom: props.bottom },
      });
    }

    return () => {
      const actions = [
        {
          key: "highlight",
          label: "划线",
          icon: <Highlighter size={16} aria-hidden="true" />,
          onSelect: props.onHighlight,
        },
        {
          key: "clip",
          label: "摘录",
          icon: <Paperclip size={16} aria-hidden="true" />,
          onSelect: props.onClip,
        },
        {
          key: "translate",
          label: "翻译",
          icon: <Languages size={16} aria-hidden="true" />,
          onSelect: translateSelection,
        },
      ];

      return (
        <>
          {translation.open.value ? null : (
            <SelectionToolbar
              top={props.top}
              left={props.left}
              actions={actions}
              onClose={props.onClose}
            />
          )}
          {translation.open.value ? (
            <ConnectedTranslationPopover translation={translation} />
          ) : null}
        </>
      );
    };
  },
});
