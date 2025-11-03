import { normalizeHighlightStyle } from "../shared/highlightUtils.js";
import { extractHostname } from "../shared/url.js";

export function normalizeImportStrategy(value) {
  const normalized = typeof value === "string" ? value.toLowerCase() : "";
  if (normalized === "overwrite") {
    return "overwrite";
  }
  if (normalized === "latest" || normalized === "keep-latest") {
    return "latest";
  }
  return "skip";
}

export function sanitizeImportedHighlight(raw) {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const url = sanitizeUrl(raw.url || raw.sourceUrl);
  if (!url) {
    return null;
  }

  const kind = raw.kind === "clip" ? "clip" : "highlight";

  let range = null;
  if (kind === "highlight") {
    range = sanitizeImportedRange(raw.range);
    if (!range) {
      return null;
    }
  }

  const result = {
    id: typeof raw.id === "string" ? raw.id.trim() : "",
    url,
    sourceUrl: sanitizeUrl(raw.sourceUrl) || url,
    title: sanitizeNullableString(raw.title),
    text: sanitizeNullableString(raw.text),
    html: sanitizeNullableString(raw.html),
    note: sanitizeNullableString(raw.note),
    tags: sanitizeTags(raw.tags),
    hostname: sanitizeHostname(raw.hostname, url),
    kind,
  };

  if (kind === "highlight") {
    result.range = range;
    const color = sanitizeColor(raw.color);
    if (color) {
      result.color = color;
    }
    result.style = normalizeHighlightStyle(raw.style);
  }

  const createdAt = coerceIsoTimestamp(raw.createdAt);
  if (createdAt) {
    result.createdAt = createdAt;
  }
  const updatedAt = coerceIsoTimestamp(raw.updatedAt);
  if (updatedAt) {
    result.updatedAt = updatedAt;
  }

  const logseqUuid =
    typeof raw.logseqBlockUuid === "string" ? raw.logseqBlockUuid.trim() : "";
  if (logseqUuid) {
    result.logseqBlockUuid = logseqUuid;
  }

  const syncedAt = coerceIsoTimestamp(raw.logseqSyncedAt);
  if (syncedAt) {
    result.logseqSyncedAt = syncedAt;
  }

  if (!result.text && !result.html) {
    return null;
  }

  if (!result.html) {
    delete result.html;
  }
  if (!result.note) {
    delete result.note;
  }
  if (!result.color) {
    delete result.color;
  }
  if (!result.tags || !result.tags.length) {
    delete result.tags;
  }
  if (!result.title) {
    delete result.title;
  }
  if (!result.text) {
    delete result.text;
  }
  if (!result.hostname) {
    delete result.hostname;
  }
  if (result.kind === "clip") {
    delete result.range;
    delete result.style;
  }

  return result;
}

export function buildHighlightSignature(record) {
  if (!record || typeof record !== "object") {
    return "";
  }
  const url =
    typeof record.url === "string" && record.url
      ? record.url
      : record.sourceUrl;
  if (!url || !record.range) {
    return "";
  }
  try {
    return `${url}::${JSON.stringify(record.range)}`;
  } catch (error) {
    return "";
  }
}

export function resolveImportConflict(strategy, existing, incoming) {
  if (strategy === "overwrite") {
    return true;
  }
  if (strategy === "skip") {
    return false;
  }
  const incomingTime = getRecordTimestamp(incoming);
  if (!incomingTime) {
    return false;
  }
  const existingTime = getRecordTimestamp(existing);
  if (!existingTime) {
    return true;
  }
  return incomingTime > existingTime;
}

export function applyTimestampFallback(target, fallback) {
  const nowIso = new Date().toISOString();
  if (!target.createdAt) {
    target.createdAt = fallback?.createdAt || fallback?.updatedAt || nowIso;
  }
  if (!target.updatedAt) {
    target.updatedAt = fallback?.updatedAt || target.createdAt || nowIso;
  }
}

export function dedupeOrder(order, highlights) {
  if (!Array.isArray(order)) {
    return [];
  }
  const result = [];
  const seen = new Set();
  order.forEach((id) => {
    if (!id || seen.has(id)) {
      return;
    }
    if (!highlights[id]) {
      return;
    }
    seen.add(id);
    result.push(id);
  });
  return result;
}

function sanitizeUrl(value) {
  if (!value || typeof value !== "string") {
    return "";
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }
  try {
    const url = new URL(trimmed);
    if (!/^https?:$/i.test(url.protocol)) {
      return "";
    }
    return url.toString();
  } catch (error) {
    return trimmed.startsWith("http://") || trimmed.startsWith("https://")
      ? trimmed
      : "";
  }
}

function sanitizeNullableString(value) {
  if (typeof value !== "string") {
    return "";
  }
  const trimmed = value.trim();
  return trimmed;
}

function sanitizeColor(value) {
  if (typeof value !== "string") {
    return "";
  }
  const trimmed = value.trim();
  return /^#[0-9a-fA-F]{6}$/.test(trimmed) ? trimmed : "";
}

function sanitizeTags(tags) {
  if (!Array.isArray(tags)) {
    return [];
  }
  const normalized = tags.map((tag) => normalizeTagValue(tag)).filter(Boolean);
  const unique = Array.from(new Set(normalized));
  return unique;
}

function sanitizeHostname(candidate, fallbackUrl) {
  if (typeof candidate === "string" && candidate.trim()) {
    return candidate.trim();
  }
  if (fallbackUrl) {
    return extractHostname(fallbackUrl);
  }
  return "";
}

function sanitizeImportedRange(range) {
  if (!range || typeof range !== "object") {
    return null;
  }
  const start = sanitizeRangeEdge(range.start);
  const end = sanitizeRangeEdge(range.end);
  if (!start || !end) {
    return null;
  }
  return { start, end };
}

function sanitizeRangeEdge(edge) {
  if (!edge || typeof edge !== "object") {
    return null;
  }
  const path = Array.isArray(edge.path)
    ? edge.path.map(sanitizeRangeSegment).filter(Boolean)
    : [];
  if (!path.length) {
    return null;
  }
  const offset =
    typeof edge.offset === "number" ? edge.offset : parseInt(edge.offset, 10);
  const normalizedOffset = Number.isFinite(offset) && offset >= 0 ? offset : 0;
  return { path, offset: normalizedOffset };
}

function sanitizeRangeSegment(segment) {
  if (!segment || typeof segment !== "object") {
    return null;
  }
  const name = typeof segment.name === "string" ? segment.name.trim() : "";
  const indexRaw =
    typeof segment.index === "number"
      ? segment.index
      : parseInt(segment.index, 10);
  if (!name) {
    return null;
  }
  const index = Number.isFinite(indexRaw) && indexRaw >= 0 ? indexRaw : 0;
  return { name, index };
}

function coerceIsoTimestamp(value) {
  if (!value || typeof value !== "string") {
    return "";
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }
  const timestamp = Date.parse(trimmed);
  if (Number.isNaN(timestamp)) {
    return "";
  }
  return new Date(timestamp).toISOString();
}

function getRecordTimestamp(record) {
  if (!record || typeof record !== "object") {
    return 0;
  }
  const source =
    record.updatedAt ||
    record.updated_at ||
    record.createdAt ||
    record.created_at;
  if (!source || typeof source !== "string") {
    return 0;
  }
  const parsed = Date.parse(source);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeTagValue(tag) {
  return typeof tag === "string" ? tag.trim() : "";
}
