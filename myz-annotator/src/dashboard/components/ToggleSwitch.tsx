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
          class="sr-only"
          checked={props.checked}
          disabled={props.disabled}
          aria-label={props.ariaLabel}
          onChange={props.onChange}
        />
        <span
          class={[
            "relative inline-flex h-6 w-11 items-center rounded-full border transition",
            props.checked
              ? "border-indigo-600 bg-indigo-600"
              : "border-slate-300 bg-slate-200 dark:border-slate-600 dark:bg-slate-700",
            props.disabled ? "opacity-60" : "",
          ].join(" ")}
          aria-hidden="true"
        >
          <span
            class={[
              "inline-block h-4 w-4 rounded-full bg-white shadow transition",
              props.checked ? "translate-x-5" : "translate-x-1",
            ].join(" ")}
          ></span>
        </span>
      </label>
    );
  },
});
