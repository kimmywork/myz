import { Moon, Monitor, Sun } from "@lucide/vue";
import { useColorScheme } from "@myz/shared/colorScheme";
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
    const { scheme, options, setScheme, ready: schemeReady } = useColorScheme();
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
      <div class="space-y-6">
        <div class="space-y-4">
          <div>
            <h3 class="text-title font-semibold text-text">外观设置</h3>
            <p class="text-compact text-muted">
              选择界面主题，或跟随操作系统的外观设置。
            </p>
          </div>
          <div class="flex items-center gap-3">
            <div class="relative">
              <button
                type="button"
                onClick={toggleMenu}
                class="inline-flex items-center gap-2 rounded-pill border border-line bg-control-bg px-3 py-2 text-compact font-medium text-text transition hover:border-accent hover:text-accent-text"
              >
                <span class="flex h-6 w-6 items-center justify-center rounded-full bg-surface-2 text-text">
                  <activeOption.value.Icon size={14} />
                </span>
                {ready.value ? activeOption.value.label : "加载中…"}
              </button>
              {menuOpen.value ? (
                <div class="absolute left-0 top-full z-10 mt-2 w-48 overflow-hidden rounded-panel border border-control-border bg-surface py-1 shadow-float">
                  {THEME_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => choose(option)}
                      class={[
                        "flex h-8 w-full items-center gap-2 rounded-tag px-2.5 text-label transition",
                        option.value === mode.value
                          ? "bg-surface-2 text-accent-text"
                          : "text-text hover:bg-surface-2",
                      ].join(" ")}
                    >
                      <span class="flex h-6 w-6 items-center justify-center rounded-full bg-surface-2">
                        <option.Icon size={14} />
                      </span>
                      {option.label}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
            <span class="text-caption text-muted">
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

        <div class="space-y-3 border-t border-line pt-5">
          <div>
            <h3 class="text-title font-semibold text-text">配色方案</h3>
            <p class="text-compact text-muted">
              选择产品外框的配色。划线五色与语义色不随方案变化。
            </p>
          </div>
          <div
            class="grid grid-cols-2 gap-3 sm:grid-cols-4"
            role="radiogroup"
            aria-label="配色方案"
          >
            {options.value.map((option) => {
              const active = option.value === scheme.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  title={option.description}
                  onClick={() => setScheme(option.value)}
                  class={[
                    "flex flex-col gap-2 rounded-panel border p-3 text-left transition",
                    active
                      ? "border-accent ring-2 ring-accent/20"
                      : "border-line hover:border-accent",
                  ].join(" ")}
                >
                  <span
                    class="flex h-12 w-full items-center justify-center overflow-hidden rounded-control border border-line"
                    style={`background:${option.swatch.bg}`}
                  >
                    <span
                      class="flex h-7 w-11 items-center justify-center rounded-tag"
                      style={`background:${option.swatch.surface};border:1px solid ${option.swatch.accent}33`}
                    >
                      <span
                        class="h-2.5 w-2.5 rounded-full"
                        style={`background:${option.swatch.accent}`}
                      />
                    </span>
                  </span>
                  <span class="text-caption font-semibold text-text">
                    {option.label}
                  </span>
                </button>
              );
            })}
          </div>
          <p class="text-caption text-muted">
            {schemeReady.value
              ? `当前方案：${options.value.find((item) => item.value === scheme.value)?.label ?? ""}`
              : "正在读取配色方案…"}
          </p>
        </div>
      </div>
    );
  },
});
