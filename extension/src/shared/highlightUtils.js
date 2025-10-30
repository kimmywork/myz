import { getRecordKind, RECORD_KINDS } from "../dashboard/utils/records.js";

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

export const HIGHLIGHT_STYLES = {
  PAINT: "paint",
  UNDERLINE: "underline",
  WAVY: "wavy",
};
export const DEFAULT_HIGHLIGHT_STYLE = HIGHLIGHT_STYLES.PAINT;
export const HIGHLIGHT_STYLE_OPTIONS = {
  [HIGHLIGHT_STYLES.PAINT]: { icon: "🖍️", label: "高亮" },
  [HIGHLIGHT_STYLES.UNDERLINE]: { icon: "✏️", label: "下划线" },
  [HIGHLIGHT_STYLES.WAVY]: { icon: "〰️", label: "波浪线" },
};

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

export function normalizeRecord(record) {
  if (!record) {
    return record;
  }
  const kind = getRecordKind(record);
  const normalized = { ...record, kind };
  if (kind === RECORD_KINDS.HIGHLIGHT) {
    normalized.style = normalizeHighlightStyle(record.style);
  } else {
    normalized.style = null;
  }
  return normalized;
}

export function isHighlightRecord(record) {
  return getRecordKind(record) === RECORD_KINDS.HIGHLIGHT;
}

export function isClipRecord(record) {
  return getRecordKind(record) === RECORD_KINDS.CLIP;
}

export function normalizeColor(value, fallback) {
  if (typeof value !== "string") {
    return fallback || null;
  }
  const trimmed = value.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(trimmed)) {
    return trimmed.toLowerCase();
  }
  return fallback || null;
}

export function normalizePalette(defaults, incoming) {
  const base =
    Array.isArray(incoming) && incoming.length ? [...incoming] : [...defaults];
  const filled = [];
  for (let index = 0; index < 5; index += 1) {
    const fallback = defaults[index] ?? defaults[0] ?? "#fde68a";
    const candidate = base[index] ?? fallback;
    filled.push(normalizeColor(candidate, fallback));
  }
  return filled;
}

export function normalizeWhitespace(value) {
  if (!value) {
    return "";
  }
  return String(value).replace(/\s+/g, " ").trim();
}

export function truncateContent(value, maxLength) {
  const normalized = normalizeWhitespace(value);
  if (!normalized) {
    return "";
  }
  if (typeof maxLength !== "number" || normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, maxLength)}…`;
}

export function formatNote(value) {
  return truncateContent(value, 120);
}

export function extractPlainText(html) {
  if (!html) {
    return "";
  }
  const container = document.createElement("div");
  container.innerHTML = html;
  return container.textContent || container.innerText || "";
}

export function getRecordPlainText(record) {
  if (!record) {
    return "";
  }
  const text = normalizeWhitespace(record.text);
  if (text) {
    return text;
  }
  return normalizeWhitespace(extractPlainText(record.html));
}

export function recordToMarkdown(record) {
  const tags =
    Array.isArray(record.tags) && record.tags.length
      ? ` #${record.tags.join(" #")}`
      : "";
  const quote = (record.text || "")
    .split("\n")
    .map((line) => `> ${line}`)
    .join("\n");
  const note = record.note ? `\n\n${record.note}` : "";
  const link = record.sourceUrl || record.url;
  return `- **${record.title || record.hostname || "页面"}**${tags} ([链接](${link}))\n${quote}${note}`;
}

export function buildMeta(record) {
  const created = record.createdAt
    ? new Date(record.createdAt).toLocaleString()
    : "";
  const tags =
    Array.isArray(record.tags) && record.tags.length
      ? `#${record.tags.join(" #")}`
      : "";
  return [created, tags].filter(Boolean).join(" · ");
}
