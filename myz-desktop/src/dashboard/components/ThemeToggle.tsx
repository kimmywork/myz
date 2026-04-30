import { computed, defineComponent } from "vue";
import { useThemePreference } from "../composables/useThemePreference";

const SunIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.8"
    stroke-linecap="round"
    stroke-linejoin="round"
  >
    <circle cx="12" cy="12" r="4"></circle>
    <path d="M12 2v2"></path>
    <path d="M12 20v2"></path>
    <path d="M4.93 4.93l1.41 1.41"></path>
    <path d="M17.66 17.66l1.41 1.41"></path>
    <path d="M2 12h2"></path>
    <path d="M20 12h2"></path>
    <path d="M4.93 19.07l1.41-1.41"></path>
    <path d="M17.66 6.34l1.41-1.41"></path>
  </svg>
);

const MoonIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.8"
    stroke-linecap="round"
    stroke-linejoin="round"
  >
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
  </svg>
);

export default defineComponent({
  name: "ThemeToggle",
  inheritAttrs: false,
  props: {
    variant: {
      type: String,
      default: "switch",
    },
  },
  setup(props, { attrs }) {
    const { isDark, toggleTheme } = useThemePreference();
    const label = computed(() => (isDark.value ? "夜间模式" : "日间模式"));

    return () => {
      const { class: className, ...restAttrs } = attrs;
      const isSwitch = props.variant === "switch";
      return (
        <button
          type="button"
          {...restAttrs}
          class={[
            isSwitch
              ? "inline-flex items-center rounded-full border border-slate-300 bg-white/80 px-3 py-1.5 text-slate-600 transition hover:border-indigo-400 hover:text-indigo-600 dark:border-white/20 dark:bg-slate-800/70 dark:text-slate-100"
              : "inline-flex items-center gap-1.5 rounded-2xl border border-slate-300 px-3 py-1.5 text-xs text-slate-700 transition hover:border-indigo-400 hover:text-indigo-600 dark:border-white/20 dark:text-slate-200",
            className,
          ]
            .filter(Boolean)
            .join(" ")}
          aria-pressed={isDark.value ? "true" : "false"}
          aria-label={label.value}
          onClick={toggleTheme}
        >
          {isSwitch ? (
            <span class="flex items-center gap-2">
              <span class="relative flex h-4 w-4 items-center justify-center">
                <span
                  class={[
                    "transition-opacity duration-200",
                    isDark.value ? "opacity-0" : "opacity-100",
                  ].join(" ")}
                >
                  <SunIcon />
                </span>
                <span
                  class={[
                    "absolute transition-opacity duration-200",
                    isDark.value ? "opacity-100" : "opacity-0",
                  ].join(" ")}
                >
                  <MoonIcon />
                </span>
              </span>
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
              {isDark.value ? <MoonIcon /> : <SunIcon />}
              <span class="font-semibold">{isDark.value ? "夜间" : "日间"}</span>
            </>
          )}
        </button>
      );
    };
  },
});
