import { ColorPalette, SettingsRow } from "@myz/dashboard-ui";
import {
  normalizeColor,
  normalizeHighlightStyle,
  normalizePalette,
} from "@myz/shared/highlightUtils";
import {
  colorName,
  DEFAULT_COLORS,
  DEFAULT_HIGHLIGHT_STYLE,
  HIGHLIGHT_STYLE_OPTIONS,
  HIGHLIGHT_STYLES,
} from "@myz/shared/types";
import { computed, defineComponent, ref, watch } from "vue";
import { useSettingsStore } from "../../../stores/settings.js";

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
            <h3>划线偏好</h3>
            <p class="settings__hint">设置划线调色盘与默认样式</p>
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
          <SettingsRow label="调色盘" hint="点色块选默认色，点铅笔改色" stacked>
            <ColorPalette
              colors={palette.value}
              activeColor={defaultColor.value}
              disabled={isSaving.value}
              onSelect={(color) => (defaultColor.value = color)}
              onUpdate={(index, value) => updatePaletteColor(index, value)}
            />
            <p class="mt-2 flex items-center gap-2 text-caption text-muted">
              <span
                class="inline-block h-4 w-4 rounded-full border border-line"
                style={{ backgroundColor: defaultColor.value }}
              />
              默认色：{colorName(defaultColor.value)} · {defaultColor.value}
            </p>
          </SettingsRow>

          <SettingsRow label="默认样式" controlWidth="auto">
            <div
              class="inline-flex rounded-full border border-line bg-surface p-1 text-caption font-semibold text-muted dark:border-line dark:bg-surface dark:text-text"
              role="group"
              aria-label="默认样式"
            >
              {styleOptions.map(([value, meta]) => (
                <button
                  key={value}
                  type="button"
                  class={[
                    "h-8 rounded-full px-4 transition",
                    defaultStyle.value === value
                      ? "bg-accent text-on-accent "
                      : "text-muted dark:text-muted",
                  ].join(" ")}
                  onClick={() => (defaultStyle.value = value)}
                >
                  {meta.label}
                </button>
              ))}
            </div>
          </SettingsRow>

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
              <span class="text-caption text-warn">未保存</span>
            ) : null}
            {saveNotice.value ? (
              <span class="text-caption text-success">{saveNotice.value}</span>
            ) : null}
            {status.value ? (
              <span class="text-caption text-muted">{status.value}</span>
            ) : null}
          </div>
        </div>
      </section>
    );
  },
});
