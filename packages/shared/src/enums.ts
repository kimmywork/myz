export enum RECORD_KINDS {
  HIGHLIGHT = "highlight",
  CLIP = "clip",
  BOOKMARK = "bookmark",
}

export enum SOURCE_TYPES {
  WEB = "web",
  PDF = "pdf",
  EPUB = "epub",
}

/** Prefix for synthetic source urls that identify a local PDF by fingerprint. */
export const PDF_SOURCE_URL_PREFIX = "myz-pdf:"

/** Prefix for synthetic source urls that identify a local EPUB by fingerprint. */
export const EPUB_SOURCE_URL_PREFIX = "myz-epub:"

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

/** Readable names for the default five pens, keyed by lowercase hex. */
export const DEFAULT_COLOR_NAMES: Record<string, string> = {
  "#b58900": "琥珀",
  "#ef476f": "珊瑚",
  "#9f7aea": "紫",
  "#38bdf8": "天蓝",
  "#34d399": "青绿",
}

/** Human-readable name for a highlight colour; falls back to the hex itself. */
export function colorName(color: string): string {
  if (typeof color !== "string") {
    return ""
  }
  return DEFAULT_COLOR_NAMES[color.trim().toLowerCase()] ?? color.trim()
}

export enum HIGHLIGHT_STYLES {
  PAINT = "paint",
  UNDERLINE = "underline",
  WAVY = "wavy",
}

/** Product chrome color schemes. Orthogonal to light/dark mode. */
export enum COLOR_SCHEMES {
  PAPER = "paper",
  SLATE = "slate",
  CELADON = "celadon",
  OCHRE = "ochre",
}

export const DEFAULT_COLOR_SCHEME: COLOR_SCHEMES = COLOR_SCHEMES.PAPER

export interface ColorSchemeOption {
  value: COLOR_SCHEMES
  label: string
  description: string
  /** Representative light-mode hexes for a preview swatch. */
  swatch: { bg: string; surface: string; accent: string }
}

export const COLOR_SCHEME_OPTIONS: ColorSchemeOption[] = [
  {
    value: COLOR_SCHEMES.PAPER,
    label: "米纸",
    description: "暖米 + 油墨蓝，长时间阅读不刺眼",
    swatch: { bg: "#f5f4ed", surface: "#faf9f5", accent: "#1b365d" },
  },
  {
    value: COLOR_SCHEMES.SLATE,
    label: "冷灰",
    description: "中性冷灰 + 靛蓝，接近系统默认观感",
    swatch: { bg: "#f8fafc", surface: "#ffffff", accent: "#4f46e5" },
  },
  {
    value: COLOR_SCHEMES.CELADON,
    label: "青瓷",
    description: "极浅青绿 + 深绿",
    swatch: { bg: "#f2f4ee", surface: "#f8faf4", accent: "#2f5d4a" },
  },
  {
    value: COLOR_SCHEMES.OCHRE,
    label: "赭石",
    description: "暖沙 + 铁锈红，更旧的纸感",
    swatch: { bg: "#f6f0e6", surface: "#fbf6ee", accent: "#8a4b24" },
  },
]


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
  [HIGHLIGHT_STYLES.PAINT]: { icon: "paint", label: "涂色" },
  [HIGHLIGHT_STYLES.UNDERLINE]: { icon: "underline", label: "下划线" },
  [HIGHLIGHT_STYLES.WAVY]: { icon: "wavy", label: "波浪线" },
}
