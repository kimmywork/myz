import { ChevronDown } from "@lucide/vue"
import { defineComponent } from "vue"
import type { PropType } from "vue"

export interface SelectOption {
  value: string
  label: string
}

/**
 * Design-system §4.6: a native `<select>` styled to match the text inputs.
 * `appearance-none` removes the OS control; the chevron is a Lucide icon so
 * every host renders the same thing.
 */
export default defineComponent({
  name: "SelectInput",
  props: {
    modelValue: {
      type: String,
      default: "",
    },
    options: {
      type: Array as PropType<SelectOption[]>,
      default: () => [],
    },
    disabled: {
      type: Boolean,
      default: false,
    },
    ariaLabel: {
      type: String,
      default: "",
    },
    testId: {
      type: String,
      default: "",
    },
    onChange: {
      type: Function as PropType<(value: string) => void>,
      default: undefined,
    },
    class: {
      type: String,
      default: "",
    },
  },
  setup(props) {
    return () => (
      <span
        class={["relative inline-flex w-full", props.class]
          .filter(Boolean)
          .join(" ")}
      >
        <select
          class="h-9 w-full appearance-none rounded-control border border-control-border bg-control-bg pl-3 pr-9 text-compact text-text transition focus:border-accent focus:outline-none focus:ring-[3px] focus:ring-accent/20 disabled:cursor-not-allowed disabled:opacity-45 dark:text-text"
          value={props.modelValue}
          disabled={props.disabled}
          aria-label={props.ariaLabel || undefined}
          data-testid={props.testId || undefined}
          onChange={(event: Event) =>
            props.onChange?.((event.target as HTMLSelectElement).value)
          }
        >
          {props.options.map((option) => (
            <option value={option.value} key={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <ChevronDown
          size={16}
          class="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted"
          aria-hidden="true"
        />
      </span>
    )
  },
})
