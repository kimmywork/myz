import type { HIGHLIGHT_STYLES } from "@myz/shared/types";
import type { Ref } from "vue";
import { loadHighlightPreferences } from "../../reader/load-preferences.js";

interface PreferenceDeps {
  colorPalette: Ref<string[]>;
  lastColor: Ref<string>;
  lastStyle: Ref<HIGHLIGHT_STYLES>;
}

/**
 * Load the user's highlight palette and last-used colour/style, so an EPUB
 * highlight matches the rest of the product. Without this the reader would also
 * write the hardcoded amber/paint back as the global default, because
 * `myz:saveHighlight` persists the record's colour/style as the preference.
 */
export function createLoadPreferences(deps: PreferenceDeps) {
  return async function loadPreferences() {
    const preferences = await loadHighlightPreferences();
    if (preferences.colorPalette.length) {
      deps.colorPalette.value = preferences.colorPalette;
    }
    if (preferences.lastUsedColor) {
      deps.lastColor.value = preferences.lastUsedColor;
    }
    if (preferences.lastUsedStyle) {
      deps.lastStyle.value = preferences.lastUsedStyle;
    }
  };
}
