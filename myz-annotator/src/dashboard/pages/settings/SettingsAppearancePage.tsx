import { SettingsRow } from "@myz/dashboard-ui";
import { useColorScheme } from "@myz/shared/colorScheme";
import ThemeToggle from "@myz/shared/components/ThemeToggle";
import { useThemePreference } from "@myz/shared/theme";
import { computed, defineComponent, ref } from "vue";

export default defineComponent({
  name: "SettingsAppearancePage",
  setup() {
    const { mode, ready } = useThemePreference();
    const { scheme, options, setScheme, ready: schemeReady } = useColorScheme();
    const groupRef = ref<HTMLElement | null>(null);

    /** Arrow-key roving focus across the scheme radiogroup (A11Y1). */
    function onSchemeKeydown(event: KeyboardEvent) {
      const handled = [
        "ArrowRight",
        "ArrowDown",
        "ArrowLeft",
        "ArrowUp",
        "Home",
        "End",
      ];
      if (!handled.includes(event.key)) return;
      const buttons = Array.from(
        groupRef.value?.querySelectorAll<HTMLElement>('[role="radio"]') ?? [],
      );
      const count = buttons.length;
      if (!count) return;
      event.preventDefault();
      const current = buttons.indexOf(event.target as HTMLElement);
      let next = current < 0 ? 0 : current;
      if (event.key === "Home") next = 0;
      else if (event.key === "End") next = count - 1;
      else if (event.key === "ArrowRight" || event.key === "ArrowDown")
        next = (current + 1 + count) % count;
      else next = (current - 1 + count) % count;
      const option = options.value[next];
      if (option) setScheme(option.value);
      buttons[next]?.focus();
    }

    const themeCaption = computed(() => {
      if (!ready.value) {
        return "正在读取主题设置…";
      }
      if (mode.value === "auto") {
        return "当前跟随系统";
      }
      return mode.value === "light" ? "当前为亮色模式" : "当前为暗色模式";
    });

    return () => (
      <div class="space-y-6">
        <div class="space-y-4">
          <div>
            <h3 class="text-title font-semibold text-text">外观设置</h3>
            <p class="text-compact text-muted">
              选择界面主题，或跟随操作系统的外观设置。
            </p>
          </div>
          <SettingsRow
            label="主题"
            hint={themeCaption.value}
            controlWidth="auto"
          >
            <ThemeToggle variant="switch" aria-label="切换主题" />
          </SettingsRow>
        </div>

        <div class="space-y-3 border-t border-line pt-5">
          <div>
            <h3 class="text-title font-semibold text-text">配色方案</h3>
            <p class="text-compact text-muted">
              选择产品外框的配色。划线五色与语义色不随方案变化。
            </p>
          </div>
          <div
            ref={groupRef}
            class="grid grid-cols-2 gap-3 sm:grid-cols-4"
            role="radiogroup"
            aria-label="配色方案"
            onKeydown={onSchemeKeydown}
          >
            {options.value.map((option, index) => {
              const active = option.value === scheme.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  tabindex={active || (!scheme.value && index === 0) ? 0 : -1}
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
