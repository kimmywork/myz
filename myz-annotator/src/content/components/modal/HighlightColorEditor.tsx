import { IconPencil } from "@myz/shared/icons";
import { handleRovingRadioKeydown } from "@myz/shared/rovingFocus";
import { colorName } from "@myz/shared/types";
import { defineComponent, ref } from "vue";
import type { PropType } from "vue";

/** Colour swatches with inline colour editing. */
export default defineComponent({
  name: "HighlightColorEditor",
  props: {
    palette: { type: Array as () => string[], required: true },
    activeColor: { type: String, required: true },
    onSelect: {
      type: Function as PropType<(index: number) => void>,
      required: true,
    },
    onEdit: {
      type: Function as PropType<(index: number, event: Event) => void>,
      required: true,
    },
  },
  setup(props) {
    const groupRef = ref<HTMLElement | null>(null);

    /** Arrow-key roving focus across the radiogroup (A11Y1). */
    function onKeydown(event: KeyboardEvent) {
      handleRovingRadioKeydown(groupRef.value, event, props.onSelect);
    }

    return () => (
      <div
        ref={groupRef}
        class="myz-color-palette"
        role="radiogroup"
        aria-label="划线颜色"
        onKeydown={onKeydown}
      >
        {props.palette.map((color, index) => {
          const isActive = color === props.activeColor;
          return (
            <div class="myz-color-swatch-wrapper" key={`${color}-${index}`}>
              <button
                type="button"
                class={["myz-color-swatch", isActive ? "is-active" : ""]}
                style={{ "--myz-swatch-color": color }}
                data-index={index}
                role="radio"
                aria-label={`选择${colorName(color)}色`}
                title={colorName(color)}
                aria-checked={isActive}
                tabindex={
                  isActive || (!props.activeColor && index === 0) ? 0 : -1
                }
                onClick={() => props.onSelect(index)}
              />
              <label
                class="myz-color-edit"
                aria-label={`编辑${colorName(color)}色`}
                title={`编辑${colorName(color)}色`}
              >
                <IconPencil size={12} aria-hidden="true" />
                <input
                  type="color"
                  class="myz-color-editor"
                  data-color-index={index}
                  value={color}
                  onInput={(event: Event) => props.onEdit(index, event)}
                />
              </label>
            </div>
          );
        })}
      </div>
    );
  },
});
