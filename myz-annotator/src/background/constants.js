export const STORAGE_KEY = "myz::highlights";
export const SETTINGS_KEY = "myz::settings";
export const DEFAULT_STATE = {
  highlights: {},
  order: [],
  archives: {},
  archiveQueue: [],
  archiveHistory: [],
};
export const DEFAULT_LOGSEQ_ENDPOINT = "http://127.0.0.1:12315/api";
export const DEFAULT_LOGSEQ_PAGE = "MyZ Inbox";

export const DEFAULT_SETTINGS = {
  logseqEndpoint: "",
  logseqAuthToken: "",
  logseqGraph: "",
  logseqPage: DEFAULT_LOGSEQ_PAGE,
  logseqSyncEnabled: false,
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
  internetArchiveEnabled: false,
  internetArchiveAccessKey: "",
  internetArchiveAccessSecret: "",
  // AI Assistant settings
  aiAssistantEnabled: false,
  aiApiEndpoint: "",
  aiApiKey: "",
  aiModel: "gpt-4",
  aiCustomModel: "",
  aiContextSize: "32K",
  aiMaxTokens: 32768,
  aiRequestHeaders: "",
  aiMcpServers: [],
};
