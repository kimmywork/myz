export enum RECORD_KINDS {
  HIGHLIGHT = "highlight",
  CLIP = "clip",
  BOOKMARK = "bookmark",
}

export enum SOURCE_TYPES {
  WEB = "web",
  PDF = "pdf",
}

/** Prefix for synthetic source urls that identify a local PDF by fingerprint. */
export const PDF_SOURCE_URL_PREFIX = "myz-pdf:"

export const DEFAULT_COLOR = "#b58900"

export const DEFAULT_COLORS = [
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
]

export enum HIGHLIGHT_STYLES {
  PAINT = "paint",
  UNDERLINE = "underline",
  WAVY = "wavy",
}

export enum CONTENT_TYPES {
  HTML = "text/html",
  MARKDOWN = "text/markdown",
  PLAIN = "text/plain",
}

export interface HighlightStyleOption {
  icon: HIGHLIGHT_STYLES[keyof HIGHLIGHT_STYLES]
  label: string
}

export const DEFAULT_HIGHLIGHT_STYLE: HIGHLIGHT_STYLES = HIGHLIGHT_STYLES.PAINT
export const HIGHLIGHT_STYLE_OPTIONS: Record<
  HIGHLIGHT_STYLES,
  HighlightStyleOption
> = {
  [HIGHLIGHT_STYLES.PAINT]: { icon: "paint", label: "高亮" },
  [HIGHLIGHT_STYLES.UNDERLINE]: { icon: "underline", label: "下划线" },
  [HIGHLIGHT_STYLES.WAVY]: { icon: "wavy", label: "波浪线" },
}
