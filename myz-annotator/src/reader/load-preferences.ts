import { normalizeHighlightStyle } from "@myz/shared/highlightUtils";
import { sendMessage } from "@myz/shared/messaging";
import { DEFAULT_COLORS, type HIGHLIGHT_STYLES } from "@myz/shared/types";

/** Highlight preferences both readers load before they can be edited. */
export interface LoadedHighlightPreferences {
  colorPalette: string[];
  lastUsedColor?: string;
  lastUsedStyle?: HIGHLIGHT_STYLES;
}

/**
 * Load the user's highlight palette and last-used colour/style via the
 * content-safe `myz:getPublicSettings` message, so the PDF and EPUB readers
 * share one loader (and never request the full, credential-bearing settings).
 * Falls back to the bundled palette when settings are unavailable.
 */
export async function loadHighlightPreferences(): Promise<LoadedHighlightPreferences> {
  try {
    const settings = await sendMessage<
      undefined,
      {
        colorPalette?: unknown;
        lastUsedColor?: unknown;
        lastUsedStyle?: unknown;
      }
    >("myz:getPublicSettings");
    const palette = Array.isArray(settings?.colorPalette)
      ? settings.colorPalette.filter(
          (color): color is string =>
            typeof color === "string" && Boolean(color.trim()),
        )
      : [];
    return {
      colorPalette: palette.length ? palette : [...DEFAULT_COLORS],
      lastUsedColor:
        typeof settings?.lastUsedColor === "string"
          ? settings.lastUsedColor
          : undefined,
      lastUsedStyle:
        typeof settings?.lastUsedStyle === "string"
          ? normalizeHighlightStyle(settings.lastUsedStyle)
          : undefined,
    };
  } catch {
    // Keep the bundled defaults when settings are unavailable.
    return { colorPalette: [...DEFAULT_COLORS] };
  }
}
