import type { Settings } from "./settings.js";
import { HIGHLIGHT_STYLES } from "@/shared/types";
import { LOCAL_TOOL_NAMES } from "./ai/tools/localDefinitions.js";

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
  // AI Assistant settings
  aiAssistantEnabled: false,
  aiProviders: [],
  aiAgents: {
    conversation: { target: null, temperature: 0.7, compressImages: false },
    insights: { target: null, temperature: 0.7 },
  },
  aiMcpServers: [],
  aiLocalTools: {
    enabledToolNames: LOCAL_TOOL_NAMES.slice(),
    mode: "manual",
    autoSelectorTarget: null,
  },
  // Vector search / Vectoria
  vectorSearch: {
    enabled: false,
    target: null,
    lastTest: null,
    matchThreshold: 0.5,
  },
  // Social import (extensible)
  socialImport: {
    twitter: {
      profileUrl: "",
    },
    mastodon: {
      profileUrl: "",
    },
  },
};
