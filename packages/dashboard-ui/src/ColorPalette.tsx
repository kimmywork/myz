import { Pencil } from "@lucide/vue"
import { colorName } from "@myz/shared"
import { defineComponent } from "vue"
import type { PropType } from "vue"

/**
 * Design-system §4.14 colour palette.
 *
 * Centred 32px swatches, 8 apart. Selecting and editing are separate actions:
 * clicking a swatch selects it (text-coloured ring, no check mark), the small
 * pencil at the corner opens the native colour picker. Swatches carry readable
 * names, not just hex.
 */
export default defineComponent({
  name: "ColorPalette",
  props: {
    colors: {
      type: Array as PropType<string[]>,
      required: true,
    },
    activeColor: {
      type: String,
      default: "",
    },
    onSelect: {
      type: Function as PropType<(color: string, index: number) => void>,
      default: undefined,
    },
    onUpdate: {
      type: Function as PropType<
        (index: number, color: string, event: Event) => void
      >,
      default: undefined,
    },
    disabled: {
      type: Boolean,
      default: false,
    },
    class: {
      type: String,
      default: "",
    },
  },
  setup(props) {
    const swatchBase =
      "h-8 w-8 rounded-full border transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg disabled:opacity-45"

    return () => (
      <div
        class={[
          "flex items-center justify-center gap-2",
          props.class,
        ]
          .filter(Boolean)
          .join(" ")}
      >
        {props.colors.map((color, index) => {
          const name = colorName(color)
          const active =
            Boolean(props.activeColor) &&
            props.activeColor.toLowerCase() === color.toLowerCase()
          return (
            <span class="relative inline-flex" key={`${color}-${index}`}>
              <button
                type="button"
                role="radio"
                aria-checked={active}
                aria-label={`选择${name}色`}
                title={name}
                disabled={props.disabled}
                class={[
                  swatchBase,
                  active
                    ? "border-transparent outline outline-2 outline-offset-2 outline-text"
                    : "border-line hover:outline hover:outline-2 hover:outline-offset-2 hover:outline-accent",
                ].join(" ")}
                style={{ backgroundColor: color }}
                onClick={() => props.onSelect?.(color, index)}
              />
              <label
                class="absolute -bottom-1 -right-1 inline-flex h-[18px] w-[18px] cursor-pointer items-center justify-center rounded-tag border border-control-border bg-surface text-muted transition hover:text-text focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-accent"
                title={`编辑${name}色`}
              >
                <Pencil size={11} aria-hidden="true" />
                <input
                  type="color"
                  class="sr-only"
                  value={color}
                  disabled={props.disabled}
                  aria-label={`编辑${name}色`}
                  onInput={(event: Event) =>
                    props.onUpdate?.(
                      index,
                      (event.target as HTMLInputElement).value,
                      event,
                    )
                  }
                />
              </label>
            </span>
          )
        })}
      </div>
    )
  },
})
