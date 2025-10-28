import { ref } from "vue";
import { sendMessage } from "../../dashboard/utils/messaging.js";

export const DEFAULT_COLORS = ["#fde68a", "#fca5a5", "#c4b5fd", "#93c5fd", "#a7f3d0"];
export const HIGHLIGHT_STYLES = {
  PAINT: "paint",
  UNDERLINE: "underline",
  WAVY: "wavy"
};
export const DEFAULT_HIGHLIGHT_STYLE = HIGHLIGHT_STYLES.PAINT;
export const HIGHLIGHT_STYLE_OPTIONS = {
  [HIGHLIGHT_STYLES.PAINT]: { icon: "🖍️", label: "高亮" },
  [HIGHLIGHT_STYLES.UNDERLINE]: { icon: "✏️", label: "下划线" },
  [HIGHLIGHT_STYLES.WAVY]: { icon: "〰️", label: "波浪线" }
};


export function normalizeHighlightStyle(style) {
  if (!style) {
    return DEFAULT_HIGHLIGHT_STYLE;
  }
  const value = String(style).toLowerCase();
  if (value === HIGHLIGHT_STYLES.UNDERLINE) {
    return HIGHLIGHT_STYLES.UNDERLINE;
  }
  if (value === HIGHLIGHT_STYLES.WAVY) {
    return HIGHLIGHT_STYLES.WAVY;
  }
  return DEFAULT_HIGHLIGHT_STYLE;
}

let storeInstance = null;

function normalizeColor(value, fallback) {
  if (typeof value !== "string") {
    return fallback || null;
  }
  const trimmed = value.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(trimmed)) {
    return trimmed.toLowerCase();
  }
  return fallback || null;
}

function normalizePalette(defaults, incoming) {
  const base = Array.isArray(incoming) && incoming.length ? [...incoming] : [...defaults];
  const filled = [];
  for (let index = 0; index < 5; index += 1) {
    const fallback = defaults[index] ?? defaults[0] ?? "#fde68a";
    const candidate = base[index] ?? fallback;
    filled.push(normalizeColor(candidate, fallback));
  }
  return filled;
}

function filterUndefined(patch) {
  const payload = {};
  Object.entries(patch || {}).forEach(([key, value]) => {
    if (value === undefined) {
      return;
    }
    payload[key] = Array.isArray(value) ? [...value] : value;
  });
  return Object.keys(payload).length ? payload : null;
}

async function persistSettings(patch) {
  const payload = filterUndefined(patch);
  if (!payload) {
    return;
  }
  try {
    await sendMessage("myz:updateSettings", payload);
  } catch (error) {
    console.warn("Failed to persist highlight preferences", error);
  }
}

function createStore(options) {
  const normalizedDefaults = normalizePalette(DEFAULT_COLORS, DEFAULT_COLORS).map((color) =>
    normalizeColor(color, "#fde68a")
  );
  const defaultColors = Object.freeze([...normalizedDefaults]);
  const defaultStyle = typeof DEFAULT_HIGHLIGHT_STYLE === "string" ? DEFAULT_HIGHLIGHT_STYLE : "paint";
  const normalizeStyle = (style) => normalizeHighlightStyle(style);

  const palette = ref(normalizePalette(defaultColors, defaultColors));
  const lastUsedColor = ref(palette.value[0]);
  const lastUsedStyle = ref(defaultStyle);
  const isLoaded = ref(false);

  function persistColor(color) {
    const normalized = normalizeColor(color, palette.value[0]);
    lastUsedColor.value = normalized;
    persistSettings({
      lastUsedColor: lastUsedColor.value,
    });
    return normalized;
  }

  function persistStyle(style) {
    const normalized = normalizeStyle(style);
    lastUsedStyle.value = normalized;
    persistSettings({ lastUsedStyle: lastUsedStyle.value });
    return normalized;
  }

  function updatePaletteEntry(index, value, { persist = false } = {}) {
    if (typeof index !== "number" || index < 0 || index >= palette.value.length) {
      return false;
    }
    const normalized = normalizeColor(value, palette.value[index]);
    const next = [...palette.value];
    next[index] = normalized;
    palette.value = normalizePalette(defaultColors, next);
    if (persist) {
      persistSettings({
        colorPalette: [...palette.value],
        lastUsedColor: lastUsedColor.value
      });
    }
    return true;
  }

  function applySettings(settings = {}) {
    const normalizedPalette = normalizePalette(defaultColors, settings.colorPalette);
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
      lastUsedStyle: defaultStyle
    });
  }

  return {
    defaultColors,
    defaultStyle,
    palette,
    lastUsedColor,
    lastUsedStyle,
    isLoaded,
    applySettings,
    resetToDefaults,
    persistColor,
    persistStyle,
    updatePaletteEntry,
    getPaletteSnapshot: () => [...palette.value]
  };
}

export function useHighlightPreferences(options) {
  if (!storeInstance) {
    storeInstance = createStore(options || {});
  }
  return storeInstance;
}
