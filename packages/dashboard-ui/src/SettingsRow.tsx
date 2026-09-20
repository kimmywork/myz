import { defineComponent } from "vue"
import type { PropType } from "vue"

/**
 * Design-system §4.17: a settings item is label-left / control-right on one
 * line by default, so simple settings stay compact. Complex controls (textarea,
 * tag input, colour palette, scheme cards) pass `stacked` and take the full
 * width. Narrow screens fall back to a stacked layout.
 */
export default defineComponent({
  name: "SettingsRow",
  props: {
    label: {
      type: String,
      required: true,
    },
    hint: {
      type: String,
      default: "",
    },
    stacked: {
      type: Boolean,
      default: false,
    },
    controlWidth: {
      type: String as PropType<"field" | "auto">,
      default: "field",
    },
    class: {
      type: String,
      default: "",
    },
  },
  setup(props, { slots }) {
    const outer = props.stacked
      ? "flex flex-col gap-2"
      : "flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-6"
    const control = props.stacked
      ? "w-full"
      : props.controlWidth === "auto"
        ? "w-full sm:w-auto sm:shrink-0"
        : "w-full sm:w-72 sm:shrink-0"
    return () => (
      <div class={[outer, props.class].filter(Boolean).join(" ")}>
        <div class="min-w-0">
          <div class="text-compact text-text">{props.label}</div>
          {props.hint ? (
            <div class="mt-0.5 text-caption text-muted">{props.hint}</div>
          ) : null}
        </div>
        <div class={control}>{slots.default?.()}</div>
      </div>
    )
  },
})
