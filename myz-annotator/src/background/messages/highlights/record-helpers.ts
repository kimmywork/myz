import { normalizeHighlightStyle } from "@myz/shared/highlightUtils";
import { collectTags } from "@myz/shared/tags";
import {
  MyZRecord,
  RECORD_KINDS,
  ensureRecordSchemaVersion,
  resolveRecordContentType,
} from "@myz/shared/types";

export function normalizeIds(ids?: unknown): string[] {
  const list = Array.isArray(ids) ? ids : [];
  return Array.from(
    new Set(
      list
        .map((id) => (typeof id === "string" ? id.trim() : ""))
        .filter(Boolean),
    ),
  );
}

/** Collect the requested URL plus aliases into a de-duplicated list. */
export function resolveRequestedUrls(payload: {
  url?: string;
  aliases?: string[];
}): string[] {
  const urls = new Set<string>();
  if (typeof payload?.url === "string" && payload.url) urls.add(payload.url);
  if (Array.isArray(payload?.aliases)) {
    payload.aliases.forEach((candidate) => {
      if (typeof candidate === "string" && candidate) urls.add(candidate);
    });
  }
  return Array.from(urls);
}

export function collectAllTags(highlights: MyZRecord[]): string[] {
  return collectTags(highlights);
}

/** Non-highlight kinds drop range/color/style; highlights normalize style. */
export function applyKindShape(record: MyZRecord): MyZRecord {
  if (record.kind !== RECORD_KINDS.HIGHLIGHT) {
    record.range = undefined;
    record.color = undefined;
    record.style = undefined;
  } else {
    record.style = normalizeHighlightStyle(record.style);
  }
  return record;
}

export function buildNewRecord(
  payload: Partial<MyZRecord>,
  now: string,
  id: string,
  kind: MyZRecord["kind"],
): MyZRecord {
  const record = ensureRecordSchemaVersion({
    ...payload,
    id,
    kind,
    createdAt: payload.createdAt || now,
    updatedAt: now,
  }) as MyZRecord;
  record.contentType = resolveRecordContentType(record);
  return record;
}

export function buildUpdatedRecord(
  existing: MyZRecord,
  payload: Partial<MyZRecord>,
  now: string,
): MyZRecord {
  const requestedKind =
    typeof payload.kind === "string" &&
    Object.values(RECORD_KINDS).includes(payload.kind as RECORD_KINDS)
      ? (payload.kind as RECORD_KINDS)
      : existing.kind;
  const updated = ensureRecordSchemaVersion({
    ...existing,
    ...payload,
    kind: requestedKind,
    updatedAt: now,
  }) as MyZRecord;
  updated.contentType = resolveRecordContentType(updated);
  return updated;
}
