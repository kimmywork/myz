import { computed, defineComponent, ref, watch } from "vue";
import { useSettingsStore } from "../../../stores/settings.js";
import {
  normalizeColor,
  normalizeHighlightStyle,
  normalizePalette,
} from "@/shared/highlightUtils.js";
import {
  DEFAULT_COLORS,
  DEFAULT_HIGHLIGHT_STYLE,
  HIGHLIGHT_STYLE_OPTIONS,
  HIGHLIGHT_STYLES,
} from "@/shared/types.js";

const styleOptions = Object.entries(HIGHLIGHT_STYLE_OPTIONS) as [
  HIGHLIGHT_STYLES,
  { label: string },
][];

export default defineComponent({
  name: "HighlightPreferencesPage",
  setup() {
    const store = useSettingsStore();
    const palette = ref<string[]>([]);
    const defaultColor = ref(DEFAULT_COLORS[0]);
    const defaultStyle = ref<HIGHLIGHT_STYLES>(DEFAULT_HIGHLIGHT_STYLE);
    const saveNotice = ref("");
    const status = ref("");
    const isSaving = ref(false);

    const applyFromStore = () => {
      const normalizedPalette = normalizePalette(
        DEFAULT_COLORS,
        store.settings.colorPalette,
      );
      palette.value = normalizedPalette;
      defaultColor.value = normalizedPalette.includes(
        store.settings.lastUsedColor,
      )
        ? store.settings.lastUsedColor
        : normalizedPalette[0];
      defaultStyle.value = normalizeHighlightStyle(
        store.settings.lastUsedStyle,
      );
    };

    watch(
      () => store.settings,
      () => applyFromStore(),
      { deep: true, immediate: true },
    );

    const isDirty = computed(() => {
      return (
        JSON.stringify(palette.value) !==
          JSON.stringify(store.settings.colorPalette) ||
        defaultColor.value !== store.settings.lastUsedColor ||
        defaultStyle.value !== store.settings.lastUsedStyle
      );
    });

    const setTimedNotice = (message: string) => {
      saveNotice.value = message;
      setTimeout(() => {
        if (saveNotice.value === message) saveNotice.value = "";
      }, 2500);
    };

    const updatePaletteColor = (index: number, value: string) => {
      const next = [...palette.value];
      next[index] = normalizeColor(value, next[index] || DEFAULT_COLORS[0]);
      const normalized = normalizePalette(DEFAULT_COLORS, next);
      palette.value = normalized;
      if (!normalized.includes(defaultColor.value)) {
        defaultColor.value = normalized[0];
      }
    };

    const resetDefaults = () => {
      const normalized = normalizePalette(DEFAULT_COLORS, DEFAULT_COLORS);
      palette.value = normalized;
      defaultColor.value = normalized[0];
      defaultStyle.value = DEFAULT_HIGHLIGHT_STYLE;
    };

    const save = async () => {
      if (isSaving.value) return;
      isSaving.value = true;
      status.value = "保存中…";
      try {
        await store.saveSettings({
          colorPalette: [...palette.value],
          lastUsedColor: defaultColor.value,
          lastUsedStyle: defaultStyle.value,
        });
        setTimedNotice("已保存");
        status.value = "";
      } catch (error) {
        status.value = `保存失败：${(error as Error).message}`;
      } finally {
        isSaving.value = false;
      }
    };

    return () => (
      <section class="settings__group">
        <div class="settings__group-header">
          <div>
            <h3>标注偏好</h3>
            <p class="settings__hint">设置高亮调色盘与默认样式</p>
          </div>
          <button
            type="button"
            class="btn btn-secondary"
            onClick={resetDefaults}
          >
            恢复默认
          </button>
        </div>

        <div class="settings__fields">
          <div class="settings__fields--compact">
            <p class="text-sm font-medium text-slate-900 dark:text-white">
              调色盘
            </p>
            <div class="grid gap-3 sm:grid-cols-2">
              {palette.value.map((color, index) => (
                <label key={`${color}-${index}`} class="field">
                  <span>颜色 {index + 1}</span>
                  <div class="flex items-center gap-2">
                    <input
                      type="color"
                      class="h-9 w-12 rounded-xl border border-slate-200 bg-white p-1 dark:border-white/10 dark:bg-slate-900"
                      value={color}
                      onInput={(event: InputEvent) =>
                        updatePaletteColor(
                          index,
                          (event.target as HTMLInputElement).value,
                        )
                      }
                    />
                    <input
                      type="text"
                      class="flex-1"
                      value={color}
                      onInput={(event: InputEvent) =>
                        updatePaletteColor(
                          index,
                          (event.target as HTMLInputElement).value,
                        )
                      }
                    />
                  </div>
                </label>
              ))}
            </div>
          </div>

          <div class="settings__fields--compact">
            <p class="text-sm font-medium text-slate-900 dark:text-white">
              默认样式
            </p>
            <div
              class="inline-flex rounded-full border border-slate-200 bg-white p-1 text-xs font-semibold text-slate-600 dark:border-white/10 dark:bg-slate-900/60 dark:text-slate-200"
              role="group"
              aria-label="默认样式"
            >
              {styleOptions.map(([value, meta]) => (
                <button
                  key={value}
                  type="button"
                  class={[
                    "rounded-full px-4 py-1.5 transition",
                    defaultStyle.value === value
                      ? "bg-indigo-600 text-white shadow"
                      : "text-slate-500 dark:text-slate-300",
                  ].join(" ")}
                  onClick={() => (defaultStyle.value = value)}
                >
                  {meta.label}
                </button>
              ))}
            </div>
          </div>

          <div class="settings__fields--compact">
            <p class="text-sm font-medium text-slate-900 dark:text-white">
              默认颜色
            </p>
            <div class="flex flex-wrap items-center gap-2">
              {palette.value.map((color) => (
                <button
                  key={color}
                  type="button"
                  class={[
                    "h-9 w-9 rounded-full border border-slate-200 transition",
                    defaultColor.value === color
                      ? "ring-2 ring-indigo-500"
                      : "hover:ring-2 hover:ring-indigo-300",
                  ].join(" ")}
                  style={{ backgroundColor: color }}
                  aria-label={`选择默认颜色 ${color}`}
                  onClick={() => (defaultColor.value = color)}
                />
              ))}
              <span class="text-xs text-slate-500 dark:text-slate-400">
                当前：{defaultColor.value}
              </span>
            </div>
          </div>

          <div class="settings__actions">
            <button
              class="btn btn-primary"
              type="button"
              disabled={isSaving.value}
              onClick={save}
            >
              保存设置
            </button>
            {isDirty.value ? (
              <span class="text-xs text-amber-600">未保存</span>
            ) : null}
            {saveNotice.value ? (
              <span class="text-xs text-emerald-600">{saveNotice.value}</span>
            ) : null}
            {status.value ? (
              <span class="text-xs text-slate-500">{status.value}</span>
            ) : null}
          </div>
        </div>
      </section>
    );
  },
});
