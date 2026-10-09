import { normalizeHighlightStyle } from "@myz/shared/highlightUtils";
import { sendMessage } from "@myz/shared/messaging";
import { HIGHLIGHT_STYLES } from "@myz/shared/types";
import type { Ref } from "vue";

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
    try {
      const settings = await sendMessage<
        undefined,
        {
          colorPalette?: unknown;
          lastUsedColor?: unknown;
          lastUsedStyle?: unknown;
        }
      >("myz:getSettings");
      const palette = settings?.colorPalette;
      if (Array.isArray(palette) && palette.length) {
        const normalized = palette.filter(
          (color): color is string =>
            typeof color === "string" && Boolean(color.trim()),
        );
        if (normalized.length) deps.colorPalette.value = normalized;
      }
      if (typeof settings?.lastUsedColor === "string") {
        deps.lastColor.value = settings.lastUsedColor;
      }
      if (typeof settings?.lastUsedStyle === "string") {
        deps.lastStyle.value = normalizeHighlightStyle(settings.lastUsedStyle);
      }
    } catch {
      // Keep the bundled defaults when settings are unavailable.
    }
  };
}
