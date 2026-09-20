import { defineComponent } from "vue";
import type { PropType } from "vue";

export default defineComponent({
  name: "ToggleSwitch",
  props: {
    checked: { type: Boolean, required: true },
    disabled: { type: Boolean, default: false },
    ariaLabel: { type: String, default: "切换" },
    onChange: {
      type: Function as PropType<(event: Event) => void>,
      required: true,
    },
  },
  setup(props) {
    return () => (
      <label class="inline-flex items-center">
        <input
          type="checkbox"
          class="peer sr-only"
          checked={props.checked}
          disabled={props.disabled}
          aria-label={props.ariaLabel}
          onChange={props.onChange}
        />
        <span
          class={[
            "relative inline-flex h-6 w-11 items-center rounded-full border transition peer-focus-visible:ring-2 peer-focus-visible:ring-accent peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-bg peer-disabled:opacity-45",
            props.checked
              ? "border-accent bg-accent"
              : "border-line bg-surface-2 dark:border-line dark:bg-surface-2",
          ].join(" ")}
          aria-hidden="true"
        >
          <span
            class={[
              "inline-block h-4 w-4 rounded-full bg-surface transition",
              props.checked ? "translate-x-5" : "translate-x-1",
            ].join(" ")}
          ></span>
        </span>
      </label>
    );
  },
});
