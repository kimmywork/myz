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
  dashboardView: "cards"
};

export const HIGHLIGHT_STYLES = {
  PAINT: "paint",
  UNDERLINE: "underline",
  WAVY: "wavy"
};

export const DEFAULT_HIGHLIGHT_STYLE = HIGHLIGHT_STYLES.PAINT;

export function normalizeHighlightStyle(style) {
  if (!style) {
    return DEFAULT_HIGHLIGHT_STYLE;
  }
  const value = String(style).toLowerCase();
  if (value === HIGHLIGHT_STYLES.UNDERLINE) {
    return HIGHLIGHT_STYLES.UNDERLINE;
  }
  if (value === HIGHLIGHT_STYLES.WAVY) {
    return HIGHLIGHT_STYLES.WAVY;
  }
  return DEFAULT_HIGHLIGHT_STYLE;
}

export function describeHighlightStyle(style) {
  const normalized = normalizeHighlightStyle(style);
  if (normalized === HIGHLIGHT_STYLES.UNDERLINE) {
    return "下划线";
  }
  if (normalized === HIGHLIGHT_STYLES.WAVY) {
    return "波浪线";
  }
  return "高亮";
}
