import { Moon, Monitor, Sun } from "@lucide/vue";
import { useThemePreference } from "@myz/shared/theme";
import { computed, defineComponent, ref } from "vue";

const THEME_OPTIONS = [
  { value: "light", label: "亮色", Icon: Sun },
  { value: "dark", label: "暗色", Icon: Moon },
  { value: "auto", label: "跟随系统", Icon: Monitor },
] as const;

type ThemeMode = (typeof THEME_OPTIONS)[number]["value"];

export default defineComponent({
  name: "SettingsAppearancePage",
  setup() {
    const { mode, setTheme, ready } = useThemePreference();
    const selected = computed({
      get: () => mode.value,
      set: (next: ThemeMode) => setTheme(next),
    });
    const menuOpen = ref(false);

    const activeOption = computed(
      () =>
        THEME_OPTIONS.find((option) => option.value === mode.value) ??
        THEME_OPTIONS[2],
    );

    function toggleMenu() {
      menuOpen.value = !menuOpen.value;
    }

    function choose(option: (typeof THEME_OPTIONS)[number]) {
      selected.value = option.value;
      menuOpen.value = false;
    }

    return () => (
      <div class="space-y-4">
        <div>
          <h3 class="text-base font-semibold text-slate-900 dark:text-white">
            外观设置
          </h3>
          <p class="text-sm text-slate-500 dark:text-slate-400">
            选择界面主题，或跟随操作系统的外观设置。
          </p>
        </div>
        <div class="flex items-center gap-3">
          <div class="relative">
            <button
              type="button"
              onClick={toggleMenu}
              class="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:border-indigo-400 hover:text-indigo-600 dark:border-white/10 dark:bg-slate-900 dark:text-slate-200"
            >
              <span class="flex h-6 w-6 items-center justify-center rounded-full bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                <activeOption.value.Icon size={14} />
              </span>
              {ready.value ? activeOption.value.label : "加载中…"}
            </button>
            {menuOpen.value ? (
              <div class="absolute left-0 top-full z-10 mt-2 w-48 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl dark:border-white/10 dark:bg-slate-900">
                {THEME_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => choose(option)}
                    class={[
                      "flex w-full items-center gap-2 px-3 py-2 text-sm transition",
                      option.value === mode.value
                        ? "text-indigo-600 dark:text-indigo-300"
                        : "text-slate-700 hover:text-indigo-600 dark:text-slate-200 dark:hover:text-indigo-300",
                    ].join(" ")}
                  >
                    <span class="flex h-6 w-6 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800">
                      <option.Icon size={14} />
                    </span>
                    {option.label}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          <span class="text-xs text-slate-500 dark:text-slate-400">
            {ready.value
              ? mode.value === "auto"
                ? "当前跟随系统"
                : mode.value === "light"
                  ? "当前为亮色模式"
                  : "当前为暗色模式"
              : "正在读取主题设置…"}
          </span>
        </div>
      </div>
    );
  },
});
