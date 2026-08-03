import type { Settings } from "./settings.js";
import { HIGHLIGHT_STYLES } from "@/shared/types";

export const STORAGE_KEY = "myz::highlights";
export const SETTINGS_KEY = "myz::settings";
export const DEFAULT_STATE = {
  highlights: {},
  order: [],
};
export const DEFAULT_SETTINGS: Settings = {
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
  // E2EE sync
  sync: {
    enabled: false,
    s3: {
      endpoint: "",
      region: "",
      bucket: "",
      accessKeyId: "",
      secretAccessKey: "",
      sessionToken: "",
      prefix: "",
    },
  },
};
