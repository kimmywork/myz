import { type Ref, ref } from "vue";
import {
  normalizeHighlightStyle,
  normalizeColor,
  normalizePalette,
} from "../../shared/highlightUtils.js";
import { sendMessage } from "../../shared/messaging.js";

import {
  DEFAULT_COLORS,
  DEFAULT_HIGHLIGHT_STYLE,
  HIGHLIGHT_STYLES,
} from "../../shared/types.js";

let storeInstance: HightlightPreferencesStore | null = null;

interface HightlightPreferencesStore {
  defaultColors: readonly string[];
  defaultStyle: HIGHLIGHT_STYLES;
  palette: Ref<string[]>;
  lastUsedColor: Ref<string>;
  lastUsedStyle: Ref<HIGHLIGHT_STYLES>;
  isLoaded: Ref<boolean>;
  applySettings: (settings: any) => void;
  resetToDefaults: () => void;
  persistColor: (color: string) => string;
  persistStyle: (style: string) => string;
  updatePaletteEntry: (
    index: number,
    value: string,
    options?: { persist?: boolean },
  ) => boolean;
  getPaletteSnapshot: () => string[];
  ensureLoaded: () => Promise<void>;
}

interface HightlightPreference {
  colorPalette?: string[];
  lastUsedColor?: string;
  lastUsedStyle?: HIGHLIGHT_STYLES;
}

interface HightlightStoreOptions {}

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
    await sendMessage("myz:updateSettings", payload);
  } catch (error) {
    console.warn("Failed to persist highlight preferences", error);
  }
}

function createStore(
  _options?: HightlightStoreOptions,
): HightlightPreferencesStore {
  const normalizedDefaults = normalizePalette(
    DEFAULT_COLORS,
    DEFAULT_COLORS,
  ).map((color) => normalizeColor(color, "#fde68a"));
  const defaultColors = Object.freeze([...normalizedDefaults]);
  const defaultStyle =
    typeof DEFAULT_HIGHLIGHT_STYLE === "string"
      ? DEFAULT_HIGHLIGHT_STYLE
      : HIGHLIGHT_STYLES.PAINT;
  const normalizeStyle = (style: any) => normalizeHighlightStyle(style);

  const palette = ref(normalizePalette(defaultColors, defaultColors));
  const lastUsedColor = ref(palette.value[0]);
  const lastUsedStyle = ref(defaultStyle);
  const isLoaded = ref(false);
  // Promise that resolves when initial settings load completes
  let _loadPromise: Promise<void> | null = null;

  function persistColor(color: string) {
    const normalized = normalizeColor(color, palette.value[0]);
    lastUsedColor.value = normalized;
    persistSettings({
      lastUsedColor: normalized,
    });
    return normalized;
  }

  function persistStyle(style: any) {
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
    })();
    return _loadPromise;
  }

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

export function useHighlightPreferences(
  options: HightlightStoreOptions = {},
): HightlightPreferencesStore {
  if (!storeInstance) {
    storeInstance = createStore(options || {});
  }
  return storeInstance;
}
