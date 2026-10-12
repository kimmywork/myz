import { COLOR_SCHEMES, HIGHLIGHT_STYLES } from "@myz/shared/types";
import { DEFAULT_S3_SETTINGS } from "@myz/sync-core/settings";
import type { Settings } from "./settings.js";

export const STORAGE_KEY = "myz::highlights";
export const SETTINGS_KEY = "myz::settings";
export const DEFAULT_STATE = {
  highlights: {},
  order: [],
};
export const DEFAULT_SETTINGS: Settings = {
  colorScheme: COLOR_SCHEMES.PAPER,
  colorPalette: [
    // amber / warm highlight
    "#b58900",
    // pink / coral
    "#ef476f",
    // muted purple
    "#9f7aea",
    // sky blue
    "#38bdf8",
    // teal / mint
    "#34d399",
  ],
  lastUsedColor: "#b58900",
  lastUsedStyle: HIGHLIGHT_STYLES.PAINT,
  dashboardView: "cards",
  syncSetupSeen: false,
  inboxEnabled: true,
  inboxReminderEnabled: true,
  // E2EE sync
  sync: {
    enabled: false,
    s3: { ...DEFAULT_S3_SETTINGS },
  },
};
