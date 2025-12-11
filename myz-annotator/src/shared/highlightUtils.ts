import {
  getRecordKind,
  normalizeRecord as normalizeBaseRecord,
  RECORD_KINDS,
} from "../dashboard/utils/records.js";

import type { MyZRecord } from "../dashboard/utils/records.js";


// Default single color and palette tuned for better visibility on dark
// backgrounds. These are slightly more saturated / deeper than the old
// pastel values so highlights remain readable when the page uses a dark
// color scheme.
export const DEFAULT_COLOR = "#b58900";

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
];


export enum HIGHLIGHT_STYLES {
  PAINT = "paint",
  UNDERLINE = "underline",
  WAVY = "wavy",
};

export interface HighlightStyleOption {
  icon: HIGHLIGHT_STYLES[keyof HIGHLIGHT_STYLES];
  label: string;
}


export const DEFAULT_HIGHLIGHT_STYLE: HIGHLIGHT_STYLES = HIGHLIGHT_STYLES.PAINT;
export const HIGHLIGHT_STYLE_OPTIONS: Record<HIGHLIGHT_STYLES, HighlightStyleOption> = {
  [HIGHLIGHT_STYLES.PAINT]: { icon: "paint", label: "高亮" },
  [HIGHLIGHT_STYLES.UNDERLINE]: { icon: "underline", label: "下划线" },
  [HIGHLIGHT_STYLES.WAVY]: { icon: "wavy", label: "波浪线" },
};

export function normalizeHighlightStyle(style: any): HIGHLIGHT_STYLES {
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

export function describeHighlightStyle(style: HIGHLIGHT_STYLES): string {
  const normalized = normalizeHighlightStyle(style);
  if (normalized === HIGHLIGHT_STYLES.UNDERLINE) {
    return "下划线";
  }
  if (normalized === HIGHLIGHT_STYLES.WAVY) {
    return "波浪线";
  }
  return "高亮";
}

export function normalizeRecord(record: MyZRecord | null | undefined): MyZRecord | null {
  if (!record) {
    return null;
  }
  const base = normalizeBaseRecord(record);
  if (!base) {
    return base;
  }
  if (base.kind === RECORD_KINDS.HIGHLIGHT) {
    return { ...base, style: normalizeHighlightStyle(base.style) };
  }
  return { ...base, style: undefined };
}

export function isHighlightRecord(record: MyZRecord) {
  return getRecordKind(record) === RECORD_KINDS.HIGHLIGHT;
}

export function isClipRecord(record: MyZRecord) {
  return getRecordKind(record) === RECORD_KINDS.CLIP;
}

export function normalizeColor(value: string, fallback: string): string {
  if (typeof value !== "string") {
    return fallback;
  }
  const trimmed = value.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(trimmed)) {
    return trimmed.toLowerCase();
  }
  return fallback;
}

export function normalizePalette(defaults: string[], incoming: string[]): string[] {
  const base =
    Array.isArray(incoming) && incoming.length ? [...incoming] : [...defaults];
  const filled: string[] = [];
  for (let index = 0; index < 5; index += 1) {
    const fallback: string = defaults[index] ?? defaults[0] ?? "#fde68a";
    const candidate = base[index] ?? fallback;
    filled.push(normalizeColor(candidate, fallback));
  }
  return filled;
}

export function normalizeWhitespace(value: string): string {
  if (!value) {
    return "";
  }
  return String(value).replace(/\s+/g, " ").trim();
}

export function truncateContent(value: string, maxLength: number): string {
  const normalized = normalizeWhitespace(value);
  if (!normalized) {
    return "";
  }
  if (typeof maxLength !== "number" || normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, maxLength)}…`;
}

export function formatNote(value: string): string {
  return truncateContent(value, 120);
}

export function extractPlainText(html?: string): string {
  if (!html) {
    return "";
  }
  const container = document.createElement("div");
  container.innerHTML = html;
  return container.textContent || container.innerText || "";
}

export function getRecordPlainText(record: MyZRecord): string {
  if (!record) {
    return "";
  }
  const text = normalizeWhitespace(record.text);
  if (text) {
    return text;
  }
  return normalizeWhitespace(extractPlainText(record.html));
}

export function buildMeta(record: MyZRecord): string {
  const created = record.createdAt
    ? new Date(record.createdAt).toLocaleString()
    : "";
  const tags =
    Array.isArray(record.tags) && record.tags.length
      ? `#${record.tags.join(" #")}`
      : "";
  return [created, tags].filter(Boolean).join(" · ");
}
