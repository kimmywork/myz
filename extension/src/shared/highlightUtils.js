export const RECORD_KINDS = {
  HIGHLIGHT: "highlight",
  CLIP: "clip"
};

export function normalizeRecord(record) {
  if (!record) {
    return { kind: RECORD_KINDS.HIGHLIGHT };
  }
  const kind = record.kind === RECORD_KINDS.CLIP ? RECORD_KINDS.CLIP : RECORD_KINDS.HIGHLIGHT;
  return { ...record, kind };
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
  const tags = Array.isArray(record.tags) && record.tags.length ? ` #${record.tags.join(" #")}` : "";
  const quote = (record.text || "")
    .split("\n")
    .map((line) => `> ${line}`)
    .join("\n");
  const note = record.note ? `\n\n${record.note}` : "";
  const link = record.sourceUrl || record.url;
  return `- **${record.title || record.hostname || "页面"}**${tags} ([链接](${link}))\n${quote}${note}`;
}

export function buildMeta(record) {
  const created = record.createdAt ? new Date(record.createdAt).toLocaleString() : "";
  const tags = Array.isArray(record.tags) && record.tags.length ? `#${record.tags.join(" #")}` : "";
  return [created, tags].filter(Boolean).join(" · ");
}
