import type { LucideIcon } from "@lucide/vue";
import { highlightStyleIconMap } from "@myz/shared/icons";
import {
  HIGHLIGHT_STYLE_OPTIONS,
  HIGHLIGHT_STYLES,
  type HighlightStyleOption,
} from "@myz/shared/types";
import { defineComponent } from "vue";
import type { PropType } from "vue";

/** Highlight style radio group. */
export default defineComponent({
  name: "ModalStylePicker",
  props: {
    active: { type: String, required: true },
    onSelect: {
      type: Function as PropType<(style: HIGHLIGHT_STYLES) => void>,
      required: true,
    },
  },
  setup(props) {
    const styleOptions = Object.entries(HIGHLIGHT_STYLE_OPTIONS) as [
      HIGHLIGHT_STYLES,
      HighlightStyleOption,
    ][];
    return () => (
      <div class="myz-style-picker" role="radiogroup">
        {styleOptions.map(([value, meta]) => {
          const isActive = value === props.active;
          const IconComponent: LucideIcon =
            highlightStyleIconMap[meta.icon as HIGHLIGHT_STYLES] ||
            highlightStyleIconMap.paint;
          return (
            <button
              key={value}
              type="button"
              class={["myz-style-picker__option", isActive ? "is-active" : ""]}
              data-style={value}
              role="radio"
              aria-pressed={isActive ? "true" : "false"}
              aria-label={meta.label}
              onClick={() => props.onSelect(value)}
            >
              <IconComponent
                class="myz-style-picker__icon"
                size={18}
                aria-hidden="true"
              />
              <span class="myz-style-picker__label">{meta.label}</span>
            </button>
          );
        })}
      </div>
    );
  },
});
