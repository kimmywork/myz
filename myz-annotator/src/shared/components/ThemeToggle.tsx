import { computed, defineComponent } from "vue";
import { IconMoon, IconSun } from "../icons.js";
import { useThemePreference } from "../theme.js";

export default defineComponent({
  name: "ThemeToggle",
  inheritAttrs: false,
  props: {
    size: {
      type: String,
      default: "md",
    },
    label: {
      type: String,
      default: "",
    },
    variant: {
      type: String,
      default: "pill", // pill | switch
    },
  },
  setup(props, { attrs }) {
    const { isDark, toggleTheme } = useThemePreference();
    const sizeClass = computed(() =>
      props.size === "sm" ? "px-2.5 py-1 text-[11px]" : "px-3 py-1.5 text-xs",
    );

    return () => {
      const { class: className, ...restAttrs } = attrs;
      const isSwitch = props.variant === "switch";
      const baseClass = isSwitch
        ? "inline-flex items-center rounded-full border border-slate-300 bg-white/80 px-3 py-1.5 text-slate-600 transition hover:border-indigo-400 hover:text-indigo-600 dark:border-white/20 dark:bg-slate-800/70 dark:text-slate-100"
        : "inline-flex items-center gap-1.5 rounded-2xl border border-slate-300 text-slate-700 transition hover:border-indigo-400 hover:text-indigo-600 dark:border-white/20 dark:text-slate-200 dark:hover:border-indigo-400 dark:hover:text-indigo-100";
      const classes = [baseClass, isSwitch ? "" : sizeClass.value, className]
        .filter(Boolean)
        .join(" ");
      const textLabel = props.label || (isDark.value ? "夜间模式" : "日间模式");

      const iconStack = (
        <span class="relative flex h-4 w-4 items-center justify-center">
          <IconSun
            size={16}
            class={[
              "transition-opacity duration-200",
              isDark.value ? "opacity-0" : "opacity-100",
            ].join(" ")}
          />
          <IconMoon
            size={16}
            class={[
              "absolute transition-opacity duration-200",
              isDark.value ? "opacity-100" : "opacity-0",
            ].join(" ")}
          />
        </span>
      );

      return (
        <button
          type="button"
          {...restAttrs}
          class={classes}
          aria-pressed={isDark.value ? "true" : "false"}
          aria-label={textLabel}
          onClick={toggleTheme}
        >
          {isSwitch ? (
            <span class="flex items-center gap-2">
              {iconStack}
              <span
                class={[
                  "relative inline-flex h-5 w-10 items-center rounded-full transition",
                  isDark.value ? "bg-slate-600" : "bg-slate-200",
                ].join(" ")}
              >
                <span
                  class={[
                    "inline-block h-4 w-4 rounded-full bg-white shadow transition",
                    isDark.value ? "translate-x-5" : "translate-x-1",
                  ].join(" ")}
                ></span>
              </span>
            </span>
          ) : (
            <>
              {iconStack}
              <span class="font-semibold">
                {isDark.value ? "夜间" : "日间"}
              </span>
            </>
          )}
        </button>
      );
    };
  },
});
