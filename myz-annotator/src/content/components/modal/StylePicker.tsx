import type { LucideIcon } from "@lucide/vue";
import { highlightStyleIconMap } from "@myz/shared/icons";
import { handleRovingRadioKeydown } from "@myz/shared/rovingFocus";
import {
  HIGHLIGHT_STYLE_OPTIONS,
  HIGHLIGHT_STYLES,
  type HighlightStyleOption,
} from "@myz/shared/types";
import { defineComponent, ref } from "vue";
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
    const groupRef = ref<HTMLElement | null>(null);

    /** Arrow-key roving focus across the radiogroup (A11Y1). */
    function onKeydown(event: KeyboardEvent) {
      handleRovingRadioKeydown(groupRef.value, event, (index) => {
        const [value] = styleOptions[index];
        if (value) props.onSelect(value);
      });
    }

    return () => (
      <div
        ref={groupRef}
        class="myz-style-picker"
        role="radiogroup"
        aria-label="高亮样式"
        onKeydown={onKeydown}
      >
        {styleOptions.map(([value, meta], index) => {
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
              aria-checked={isActive}
              aria-label={meta.label}
              tabindex={isActive || (!props.active && index === 0) ? 0 : -1}
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
