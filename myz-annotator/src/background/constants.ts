export const STORAGE_KEY = "myz::highlights";
export const SETTINGS_KEY = "myz::settings";
export const DEFAULT_STATE = {
  highlights: {},
  order: [],
};
export const DEFAULT_SETTINGS = {
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
  lastUsedStyle: "paint",
  dashboardView: "cards",
  // AI Assistant settings
  aiAssistantEnabled: false,
  aiProviders: [],
  aiAgents: {
    conversation: { target: null, temperature: 0.7 },
    insights: { target: null, temperature: 0.7 },
  },
  aiMcpServers: [],
  // Vector search / Vectoria
  vectorSearchEnabled: false,
  vectorModelReady: false,
  vectorUseLocalModel: true,
  vectorOpenAiEndpoint: "",
  vectorOpenAiApiKey: "",
  vectorOpenAiModel: "text-embedding-3-small",
  vectorMaxChars: 500,
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
