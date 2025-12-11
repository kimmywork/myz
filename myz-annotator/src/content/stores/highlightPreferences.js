import { ref } from "vue";
import { sendMessage } from "../../shared/messaging.js";

import {
  DEFAULT_COLORS,
  DEFAULT_HIGHLIGHT_STYLE,
} from "../../shared/highlightUtils.js";
import {
  normalizeHighlightStyle,
  normalizeColor,
  normalizePalette,
} from "../../shared/highlightUtils.js";

let storeInstance = null;

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
  const normalizedDefaults = normalizePalette(
    DEFAULT_COLORS,
    DEFAULT_COLORS,
  ).map((color) => normalizeColor(color, "#fde68a"));
  const defaultColors = Object.freeze([...normalizedDefaults]);
  const defaultStyle =
    typeof DEFAULT_HIGHLIGHT_STYLE === "string"
      ? DEFAULT_HIGHLIGHT_STYLE
      : "paint";
  const normalizeStyle = (style) => normalizeHighlightStyle(style);

  const palette = ref(normalizePalette(defaultColors, defaultColors));
  const lastUsedColor = ref(palette.value[0]);
  const lastUsedStyle = ref(defaultStyle);
  const isLoaded = ref(false);
  // Promise that resolves when initial settings load completes
  let _loadPromise = null;

  function persistColor(color) {
    const normalized = normalizeColor(color, palette.value[0]);
    lastUsedColor.value = normalized;
    persistSettings({
      lastUsedColor: normalized,
    });
    return normalized;
  }

  function persistStyle(style) {
    const normalized = normalizeStyle(style);
    lastUsedStyle.value = normalized;
    persistSettings({ lastUsedStyle: lastUsedStyle.value });
    return normalized;
  }

  // Load persisted settings from background/storage via message bus.
  // This will apply settings and set `isLoaded` when complete.
  async function loadSettings() {
    // If already loading, return the existing promise
    if (_loadPromise) return _loadPromise;
    _loadPromise = (async () => {
      try {
        const settings = await sendMessage("myz:getSettings");
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
      return null;
    })();
    return _loadPromise;
  }

  function updatePaletteEntry(index, value, { persist = false } = {}) {
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

  function applySettings(settings = {}) {
    const normalizedPalette = normalizePalette(
      defaultColors,
      settings.colorPalette,
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

  // Kick off an initial load of persisted settings. Non-blocking.
  // Consumers can await `ensureLoaded()` if they need to wait for values to be applied.
  loadSettings().catch(() => {});

  // Allow callers to await the initial load if they need the persisted values synchronously.
  function ensureLoaded() {
    return loadSettings();
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
    getPaletteSnapshot: () => [...palette.value],
    ensureLoaded,
  };
}

export function useHighlightPreferences(options) {
  if (!storeInstance) {
    storeInstance = createStore(options || {});
  }
  return storeInstance;
}
