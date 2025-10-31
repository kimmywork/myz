export const STORAGE_KEY = "myz::highlights";
export const SETTINGS_KEY = "myz::settings";
export const DEFAULT_STATE = { highlights: {}, order: [] };
export const DEFAULT_LOGSEQ_ENDPOINT = "http://127.0.0.1:12315/api";
export const DEFAULT_LOGSEQ_PAGE = "MyZ Inbox";

export const DEFAULT_SETTINGS = {
  logseqEndpoint: "",
  logseqAuthToken: "",
  logseqGraph: "",
  logseqPage: DEFAULT_LOGSEQ_PAGE,
  logseqSyncEnabled: false,
  colorPalette: ["#fde68a", "#fca5a5", "#c4b5fd", "#93c5fd", "#a7f3d0"],
  lastUsedColor: "#fde68a",
  lastUsedStyle: "paint",
  dashboardView: "cards",
};
