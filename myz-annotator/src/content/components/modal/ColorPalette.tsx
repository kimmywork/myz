import { IconPencil } from "@myz/shared/icons";
import { colorName } from "@myz/shared/types";
import { defineComponent } from "vue";
import type { PropType } from "vue";

/** Colour swatches with inline colour editing. */
export default defineComponent({
  name: "ModalColorPalette",
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
    return () => (
      <div class="myz-color-palette" role="radiogroup">
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
                aria-pressed={isActive ? "true" : "false"}
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
