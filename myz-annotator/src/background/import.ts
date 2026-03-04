import { normalizeHighlightStyle } from "@/shared/highlightUtils.js";
import {
  SerializedRangeSchema,
  ImportStrategySchema,
  SanitizedUrlSchema,
  SanitizedColorSchema,
  SanitizedTimestampSchema,
  SanitizedTagsSchema,
} from "@/shared/schemas";
import {
  MyZRecord,
  RECORD_KINDS,
  ensureRecordSchemaVersion,
  normalizeContentType,
  resolveRecordContentType,
} from "@/shared/types";
import { extractHostname } from "@/shared/url.js";
import { isRecord, type UnknownRecord } from "@/shared/typeUtils";

export type ImportStrategy = "skip" | "overwrite" | "latest";

export function normalizeImportStrategy(value: unknown): ImportStrategy {
  return ImportStrategySchema.parse(value);
}

export function sanitizeImportedHighlight(raw: unknown): MyZRecord | null {
  if (!isRecord(raw)) {
    return null;
  }

  const record = raw as UnknownRecord;
  const url = SanitizedUrlSchema.parse(record.url || record.sourceUrl);
  if (!url) {
    return null;
  }

  const kind = (() => {
    const candidate = record.kind;
    if (typeof candidate === "string") {
      const normalized = candidate.trim();
      if (
        normalized &&
        Object.values(RECORD_KINDS).includes(normalized as RECORD_KINDS)
      ) {
        return normalized as RECORD_KINDS;
      }
    }
    return RECORD_KINDS.HIGHLIGHT;
  })();

  const rawRecord = record as Partial<MyZRecord>;

  let range = null;
  if (kind === RECORD_KINDS.HIGHLIGHT) {
    const rangeResult = SerializedRangeSchema.safeParse(rawRecord.range);
    if (rangeResult.success) {
      range = rangeResult.data;
    } else {
      return null;
    }
  }

  const result: Partial<MyZRecord> = {
    id: typeof rawRecord.id === "string" ? rawRecord.id.trim() : "",
    url,
    sourceUrl: SanitizedUrlSchema.parse(rawRecord.sourceUrl) || url,
    title: typeof rawRecord.title === "string" ? rawRecord.title.trim() : "",
    text: typeof rawRecord.text === "string" ? rawRecord.text.trim() : "",
    html: typeof rawRecord.html === "string" ? rawRecord.html.trim() : "",
    note: typeof rawRecord.note === "string" ? rawRecord.note.trim() : "",
    contentType: normalizeContentType(rawRecord.contentType),
    tags: SanitizedTagsSchema.parse(rawRecord.tags),
    hostname:
      typeof rawRecord.hostname === "string" && rawRecord.hostname.trim()
        ? rawRecord.hostname.trim()
        : extractHostname(url),
    kind,
  };

  result.contentType = resolveRecordContentType(result);

  if (kind === RECORD_KINDS.HIGHLIGHT) {
    result.range = range!;
    const color = SanitizedColorSchema.parse(rawRecord.color);
    if (color) {
      result.color = color;
    }
    result.style = normalizeHighlightStyle(rawRecord.style);
  }

  const createdAt = SanitizedTimestampSchema.parse(rawRecord.createdAt);
  if (createdAt) {
    result.createdAt = createdAt;
  }
  const updatedAt = SanitizedTimestampSchema.parse(rawRecord.updatedAt);
  if (updatedAt) {
    result.updatedAt = updatedAt;
  }

  const allowEmptyContent = kind === RECORD_KINDS.BOOKMARK;
  if (!result.text && !result.html && !allowEmptyContent) {
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
  if (!result.text && !allowEmptyContent) {
    delete result.text;
  }
  if (!result.hostname) {
    delete result.hostname;
  }
  if (result.kind !== RECORD_KINDS.HIGHLIGHT) {
    delete result.range;
    delete result.style;
    delete result.color;
  }

  return ensureRecordSchemaVersion(result as MyZRecord) as MyZRecord;
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

export function buildRecordSignature(record: MyZRecord): string {
  if (!record || typeof record !== "object") {
    return "";
  }
  const url =
    typeof record.url === "string" && record.url
      ? record.url
      : record.sourceUrl;
  if (!url) {
    return "";
  }
  if (record.kind === RECORD_KINDS.HIGHLIGHT) {
    return buildHighlightSignature(record);
  }
  const kind =
    typeof record.kind === "string" && record.kind ? record.kind : "unknown";

  const canonicalUrl = (() => {
    try {
      const parsed = new URL(url);
      parsed.search = "";
      parsed.hash = "";
      return parsed.toString();
    } catch {
      return url;
    }
  })();

  // Tweet-like records are expected to be globally unique by (kind, url).
  if (kind.startsWith("tweet:") || kind.startsWith("toot:")) {
    return `${kind}::${canonicalUrl}`;
  }

  const content =
    (typeof record.text === "string" ? record.text : "") ||
    (typeof record.html === "string" ? record.html : "");
  const fingerprint = content.trim().slice(0, 2000);
  return `${kind}::${canonicalUrl}::${fingerprint}`;
}

export function resolveImportConflict(
  strategy: ImportStrategy,
  existing: MyZRecord,
  incoming: MyZRecord,
): boolean {
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

export function applyTimestampFallback(
  target: Partial<MyZRecord>,
  fallback?: Partial<MyZRecord>,
) {
  const nowIso = new Date().toISOString();
  if (!target.createdAt) {
    target.createdAt = fallback?.createdAt || fallback?.updatedAt || nowIso;
  }
  if (!target.updatedAt) {
    target.updatedAt = fallback?.updatedAt || target.createdAt || nowIso;
  }
}

export function dedupeOrder(
  order: string[],
  highlights: Record<string, MyZRecord>,
): string[] {
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
