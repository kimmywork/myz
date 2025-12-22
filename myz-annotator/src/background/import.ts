import { normalizeHighlightStyle } from "@/shared/highlightUtils.js";
import { PathSegment, SerializedRange } from "@/shared/serializer";
import { MyZRecord, RECORD_KINDS } from "@/shared/types";
import { extractHostname } from "@/shared/url.js";

export type ImportStrategy = "skip" | "overwrite" | "latest";

export function normalizeImportStrategy(value: unknown): ImportStrategy {
  const normalized = typeof value === "string" ? value.toLowerCase() : "";
  if (normalized === "overwrite") {
    return "overwrite";
  }
  if (normalized === "latest" || normalized === "keep-latest") {
    return "latest";
  }
  return "skip";
}

export function sanitizeImportedHighlight(raw: unknown): MyZRecord | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const url = sanitizeUrl((raw as any).url || (raw as any).sourceUrl);
  if (!url) {
    return null;
  }

  const kind: RECORD_KINDS =
    (raw as any).kind === "clip" ? RECORD_KINDS.CLIP : RECORD_KINDS.HIGHLIGHT;

  const rawRecord = raw as MyZRecord;

  let range = null;
  if (kind === RECORD_KINDS.HIGHLIGHT) {
    range = sanitizeImportedRange(rawRecord.range);
    if (!range) {
      return null;
    }
  }

  const result: Partial<MyZRecord> = {
    id: typeof rawRecord.id === "string" ? rawRecord.id.trim() : "",
    url,
    sourceUrl: sanitizeUrl(rawRecord.sourceUrl) || url,
    title: sanitizeNullableString(rawRecord.title),
    text: sanitizeNullableString(rawRecord.text),
    html: sanitizeNullableString(rawRecord.html),
    note: sanitizeNullableString(rawRecord.note),
    tags: sanitizeTags(rawRecord.tags),
    hostname: sanitizeHostname(rawRecord.hostname, url),
    kind,
  };

  if (kind === RECORD_KINDS.HIGHLIGHT) {
    result.range = range!;
    const color = sanitizeColor(rawRecord.color);
    if (color) {
      result.color = color;
    }
    result.style = normalizeHighlightStyle(rawRecord.style);
  }

  const createdAt = coerceIsoTimestamp(rawRecord.createdAt);
  if (createdAt) {
    result.createdAt = createdAt;
  }
  const updatedAt = coerceIsoTimestamp(rawRecord.updatedAt);
  if (updatedAt) {
    result.updatedAt = updatedAt;
  }

  const logseqUuid =
    typeof rawRecord.logseqBlockUuid === "string" ? rawRecord.logseqBlockUuid.trim() : "";
  if (logseqUuid) {
    result.logseqBlockUuid = logseqUuid;
  }

  const syncedAt = coerceIsoTimestamp(rawRecord.logseqSyncedAt);
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

  return result as MyZRecord;
}

export function buildHighlightSignature(record: MyZRecord): string {
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

export function resolveImportConflict(strategy: ImportStrategy, existing: MyZRecord, incoming: MyZRecord): boolean {
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

export function applyTimestampFallback(target: Partial<MyZRecord>, fallback: Partial<MyZRecord>) {
  const nowIso = new Date().toISOString();
  if (!target.createdAt) {
    target.createdAt = fallback?.createdAt || fallback?.updatedAt || nowIso;
  }
  if (!target.updatedAt) {
    target.updatedAt = fallback?.updatedAt || target.createdAt || nowIso;
  }
}

export function dedupeOrder(order: string[], highlights: Record<string, MyZRecord>): string[] {
  if (!Array.isArray(order)) {
    return [];
  }
  const result: string[] = [];
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

function sanitizeUrl(value: unknown): string {
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

function sanitizeNullableString(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }
  const trimmed = value.trim();
  return trimmed;
}

function sanitizeColor(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }
  const trimmed = value.trim();
  return /^#[0-9a-fA-F]{6}$/.test(trimmed) ? trimmed : "";
}

function sanitizeTags(tags: unknown): string[] {
  if (!Array.isArray(tags)) {
    return [];
  }
  const normalized = tags.map((tag) => normalizeTagValue(tag)).filter(Boolean);
  const unique = Array.from(new Set(normalized));
  return unique;
}

function sanitizeHostname(candidate: unknown, fallbackUrl: string): string {
  if (typeof candidate === "string" && candidate.trim()) {
    return candidate.trim();
  }
  if (fallbackUrl) {
    return extractHostname(fallbackUrl);
  }
  return "";
}

function sanitizeImportedRange(range: unknown): SerializedRange | null {
  if (!range || typeof range !== "object") {
    return null;
  }
  const start = sanitizeRangeEdge((range as any).start);
  const end = sanitizeRangeEdge((range as any).end);
  if (!start || !end) {
    return null;
  }
  return { start, end };
}

function sanitizeRangeEdge(edge: any) {
  if (!edge || typeof edge !== "object") {
    return null;
  }
  const path: PathSegment[] = Array.isArray(edge.path)
    ? edge.path.map(sanitizeRangeSegment).filter(Boolean)
    : [];
  if (!path.length) {
    return null;
  }
  const offset: number =
    typeof edge.offset === "number" ? edge.offset : parseInt(edge.offset, 10);
  const normalizedOffset = Number.isFinite(offset) && offset >= 0 ? offset : 0;
  const charOffset: number =
    typeof edge.charOffset === "number" ? edge.charOffset : parseInt(edge.charOffset, 10);
  const normalizedCharoffset = Number.isFinite(charOffset) && charOffset >= 0 ? charOffset : 0;
  return { path, offset: normalizedOffset, charOffset: normalizedCharoffset };
}

function sanitizeRangeSegment(segment: any): PathSegment | null {
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

function coerceIsoTimestamp(value: unknown): string {
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

function getRecordTimestamp(record?: MyZRecord): number {
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

function normalizeTagValue(tag: unknown): string {
  return typeof tag === "string" ? tag.trim() : "";
}
