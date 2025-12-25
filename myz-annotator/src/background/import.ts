import { normalizeHighlightStyle } from "@/shared/highlightUtils.js";
import { MyZRecord, RECORD_KINDS } from "@/shared/types";
import { extractHostname } from "@/shared/url.js";
import {
  SerializedRangeSchema,
  ImportStrategySchema,
  SanitizedUrlSchema,
  SanitizedColorSchema,
  SanitizedTimestampSchema,
  SanitizedTagsSchema,
} from "@/shared/schemas";

export type ImportStrategy = "skip" | "overwrite" | "latest";

export function normalizeImportStrategy(value: unknown): ImportStrategy {
  return ImportStrategySchema.parse(value);
}

export function sanitizeImportedHighlight(raw: unknown): MyZRecord | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const url = SanitizedUrlSchema.parse((raw as any).url || (raw as any).sourceUrl);
  if (!url) {
    return null;
  }

  const kind: RECORD_KINDS =
    (raw as any).kind === "clip" ? RECORD_KINDS.CLIP : RECORD_KINDS.HIGHLIGHT;

  const rawRecord = raw as MyZRecord;

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
    tags: SanitizedTagsSchema.parse(rawRecord.tags),
    hostname:
      typeof rawRecord.hostname === "string" && rawRecord.hostname.trim()
        ? rawRecord.hostname.trim()
        : extractHostname(url),
    kind,
  };

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
