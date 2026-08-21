import {
  normalizeHighlightStyle,
  normalizeColor,
  normalizePalette,
} from "@myz/shared/highlightUtils";
import { sendMessage } from "@myz/shared/messaging";
import {
  DEFAULT_COLORS,
  DEFAULT_HIGHLIGHT_STYLE,
  HIGHLIGHT_STYLES,
} from "@myz/shared/types";
import { defineStore } from "pinia";
import { ref } from "vue";
import type { Settings } from "@/background/settings.js";

interface HightlightPreference {
  colorPalette?: string[];
  lastUsedColor?: string;
  lastUsedStyle?: HIGHLIGHT_STYLES;
}

function filterUndefined(
  patch: Partial<HightlightPreference>,
): Partial<HightlightPreference> | null {
  const payload = {} as Record<string, unknown>;
  Object.entries(patch || {}).forEach(([key, value]) => {
    if (value === undefined) {
      return;
    }
    payload[key] = Array.isArray(value) ? [...value] : value;
  });
  return Object.keys(payload).length ? payload : null;
}

async function persistSettings(patch: Partial<HightlightPreference>) {
  const payload = filterUndefined(patch);
  if (!payload) {
    return;
  }
  try {
    await sendMessage<Partial<Settings>, Settings>(
      "myz:updateSettings",
      payload,
    );
  } catch (error) {
    console.warn("Failed to persist highlight preferences", error);
  }
}

export const usePreferenceStore = defineStore("preference", () => {
  const normalizedDefaults = normalizePalette(
    DEFAULT_COLORS,
    DEFAULT_COLORS,
  ).map((color) => normalizeColor(color, "#fde68a"));
  const defaultColors = Object.freeze([...normalizedDefaults]);
  const defaultStyle =
    typeof DEFAULT_HIGHLIGHT_STYLE === "string"
      ? DEFAULT_HIGHLIGHT_STYLE
      : HIGHLIGHT_STYLES.PAINT;
  const normalizeStyle = (style: unknown) => normalizeHighlightStyle(style);

  const palette = ref(normalizePalette(defaultColors, defaultColors));
  const lastUsedColor = ref(palette.value[0]);
  const lastUsedStyle = ref(defaultStyle);
  const isLoaded = ref(false);

  function persistColor(color: string) {
    const normalized = normalizeColor(color, palette.value[0]);
    lastUsedColor.value = normalized;
    persistSettings({
      lastUsedColor: normalized,
    });
    return normalized;
  }

  function persistStyle(style: unknown) {
    const normalized = normalizeStyle(style);
    lastUsedStyle.value = normalized;
    persistSettings({ lastUsedStyle: lastUsedStyle.value });
    return normalized;
  }

  // Load persisted settings from background/storage via message bus.
  // This will apply settings and set `isLoaded` when complete.
  async function loadSettings() {
    try {
      const settings = await sendMessage<undefined, Settings>(
        "myz:getSettings",
      );
      if (settings) {
        applySettings(settings);
      } else {
        // No persisted settings; still mark loaded so callers don't wait indefinitely
        isLoaded.value = true;
      }
    } catch (error) {
      console.warn("Failed to load highlight preferences", error);
      // Mark loaded even on error to avoid blocking callers
      isLoaded.value = true;
    }
  }
  loadSettings();

  function updatePaletteEntry(
    index: number,
    value: string,
    { persist = false } = {},
  ) {
    if (
      typeof index !== "number" ||
      index < 0 ||
      index >= palette.value.length
    ) {
      return false;
    }
    const normalized = normalizeColor(value, palette.value[index]);
    const next = [...palette.value];
    next[index] = normalized;
    palette.value = normalizePalette(defaultColors, next);
    if (persist) {
      persistSettings({
        colorPalette: [...palette.value],
        lastUsedColor: lastUsedColor.value,
      });
    }
    return true;
  }

  function applySettings(settings: HightlightPreference) {
    const normalizedPalette = normalizePalette(
      defaultColors,
      settings.colorPalette ?? Array.from(defaultColors),
    );
    palette.value = normalizedPalette;
    const color = normalizeColor(settings.lastUsedColor, normalizedPalette[0]);
    const style = normalizeStyle(settings.lastUsedStyle);
    lastUsedColor.value = color;
    lastUsedStyle.value = style;
    isLoaded.value = true;
  }

  function resetToDefaults() {
    applySettings({
      colorPalette: [...defaultColors],
      lastUsedColor: defaultColors[0],
      lastUsedStyle: defaultStyle,
    });
  }

  return {
    resetToDefaults,
    applySettings,
    updatePaletteEntry,
    persistStyle,
    persistColor,
    lastUsedStyle,
    lastUsedColor,
    getPaletteSnapshot: () => [...palette.value],
    palette,
    defaultStyle,
    defaultColors,
  };
});
