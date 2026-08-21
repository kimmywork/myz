import { Monitor, Moon, Sun } from "@lucide/vue";
import { computed, defineComponent, ref, Teleport } from "vue";
import { useThemePreference } from "../theme.js";

const OPTIONS = [
  { value: "light", label: "亮色", Icon: Sun },
  { value: "dark", label: "暗色", Icon: Moon },
  { value: "auto", label: "跟随系统", Icon: Monitor },
] as const;

function getEffectiveOption(mode: string, effectiveTheme: string) {
  if (mode === "light") {
    return OPTIONS[0];
  }
  if (mode === "dark") {
    return OPTIONS[1];
  }
  return effectiveTheme === "light" ? OPTIONS[0] : OPTIONS[1];
}

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
    const { mode, effectiveTheme, setTheme, ready } = useThemePreference();
    const menuOpen = ref(false);
    const triggerRef = ref<HTMLElement | null>(null);

    const activeOption = computed(() =>
      getEffectiveOption(mode.value, effectiveTheme.value),
    );

    const dropdownPosition = computed(() => {
      if (!triggerRef.value) {
        return { top: 0, left: 0 };
      }
      const rect = triggerRef.value.getBoundingClientRect();
      return {
        top: rect.bottom + 8,
        left: rect.right - 144, // align right edge with button (w-36 = 144px)
      };
    });

    const sizeClass = computed(() =>
      props.size === "sm" ? "px-2.5 py-1 text-[11px]" : "px-3 py-1.5 text-xs",
    );

    function toggleMenu() {
      menuOpen.value = !menuOpen.value;
    }

    function choose(option: (typeof OPTIONS)[number]) {
      setTheme(option.value);
      menuOpen.value = false;
    }

    return () => {
      const { class: className, ...restAttrs } = attrs;
      const isSwitch = props.variant === "switch";
      const baseClass = isSwitch
        ? "inline-flex items-center rounded-full border border-slate-300 bg-white/80 px-3 py-1.5 text-slate-600 transition hover:border-indigo-400 hover:text-indigo-600 dark:border-white/20 dark:bg-slate-800/70 dark:text-slate-100"
        : `inline-flex items-center gap-1.5 rounded-2xl border border-slate-300 text-slate-700 transition hover:border-indigo-400 hover:text-indigo-600 dark:border-white/20 dark:text-slate-200 dark:hover:border-indigo-400 dark:hover:text-indigo-100 ${sizeClass.value}`;

      const Icon = activeOption.value.Icon;
      const pos = dropdownPosition.value;

      return (
        <span class="relative inline-flex">
          <button
            ref={triggerRef}
            type="button"
            {...restAttrs}
            class={[baseClass, className].filter(Boolean).join(" ")}
            aria-haspopup="listbox"
            aria-expanded={menuOpen.value}
            aria-label={props.label || "切换主题"}
            onClick={toggleMenu}
          >
            <span class="flex items-center gap-2">
              <span class="flex h-4 w-4 items-center justify-center">
                <Icon size={16} />
              </span>
              <span class="text-xs font-medium">
                {ready.value ? activeOption.value.label : "加载中…"}
              </span>
            </span>
          </button>
          {menuOpen.value ? (
            <Teleport to="body">
              <div
                role="listbox"
                class="fixed z-[9999] w-36 overflow-hidden rounded-2xl border border-slate-200 bg-white py-1 text-sm shadow-xl dark:border-white/20 dark:bg-slate-900"
                style={`top:${pos.top}px;left:${pos.left}px`}
              >
                {OPTIONS.map((option) => {
                  const OptionIcon = option.Icon;
                  const isActive = option.value === mode.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      role="option"
                      aria-selected={isActive}
                      onClick={() => choose(option)}
                      class={[
                        "flex w-full items-center gap-2 px-3 py-2 text-left transition",
                        isActive
                          ? "text-indigo-600 dark:text-indigo-300"
                          : "text-slate-700 hover:text-indigo-600 dark:text-slate-200 dark:hover:text-indigo-300",
                      ].join(" ")}
                    >
                      <span class="flex h-5 w-5 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800">
                        <OptionIcon size={14} />
                      </span>
                      {option.label}
                    </button>
                  );
                })}
              </div>
            </Teleport>
          ) : null}
        </span>
      );
    };
  },
});
