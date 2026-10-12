import type { HIGHLIGHT_STYLES } from "@myz/shared/types";
import type { Settings } from "./settings.js";

/**
 * The subset of Settings that content scripts are allowed to read. It carries
 * only highlight preferences and deliberately excludes the sync bundle (which
 * holds sealed S3 credentials) and every other privileged field.
 */
export interface PublicSettings {
  colorPalette: string[];
  lastUsedColor: string;
  lastUsedStyle: HIGHLIGHT_STYLES;
}

/**
 * Project the full settings object down to the content-script-safe fields.
 * The palette array is copied so callers cannot mutate stored settings.
 */
export function pickPublicSettings(settings: Settings): PublicSettings {
  return {
    colorPalette: Array.isArray(settings.colorPalette)
      ? [...settings.colorPalette]
      : [],
    lastUsedColor: settings.lastUsedColor,
    lastUsedStyle: settings.lastUsedStyle,
  };
}
