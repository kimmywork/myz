/**
 * Record domain service.
 *
 * Pure domain logic over a {@link RecordsStore} port: build/normalize a record
 * from a draft, apply updates, and read projections. It never touches storage,
 * chrome, or a content-script DOM directly — host capabilities (id generation,
 * clock, HTML→Markdown) are injected via {@link RecordServiceContext}, so the
 * same service runs on every host and is unit-testable with a fake store.
 */
import { normalizeHighlightStyle } from "@myz/shared/highlightUtils";
import { collectTags } from "@myz/shared/tags";
import {
  CONTENT_TYPES,
  RECORD_KINDS,
  ensureRecordSchemaVersion,
  getRecordKind,
  resolveRecordContentType,
  type MyZRecord,
} from "@myz/shared/types";
import { generateRecordId } from "../identity";
import type { RecordsStore } from "../ports";
import { RECORD_SCHEMA_ID } from "../record-codecs";

/** Host capabilities injected into record mutations. */
export interface RecordServiceContext {
  /** Override the clock (tests / deterministic writes). */
  now?: () => string;
  /** Override id generation. */
  newId?: () => string;
  /**
   * HTML→Markdown capability (plan §5 D3.3). The domain must not reach into a
   * content-script DOM itself; the host injects this so `createRecord` stays
   * pure domain + storage.
   */
  htmlToMarkdown?: (html: string, tabId?: number) => Promise<string>;
  /** Tab the write originated from, passed to `htmlToMarkdown`. */
  tabId?: number;
}

function nowOf(ctx: RecordServiceContext): string {
  return ctx.now?.() ?? new Date().toISOString();
}

function idOf(ctx: RecordServiceContext, explicit?: string): string {
  return explicit || ctx.newId?.() || generateRecordId();
}

/** De-duplicate a list of ids (trim + drop empties). */
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

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Resolve a record's body text: prefer the injected HTML→Markdown port, with a
 * tag-stripping fallback so the record can still be saved offline.
 */
async function resolveRecordText(
  record: MyZRecord,
  ctx: RecordServiceContext,
): Promise<void> {
  if (typeof record.html !== "string" || record.html.trim().length === 0) {
    return;
  }
  try {
    if (!ctx.htmlToMarkdown) throw new Error("no htmlToMarkdown port");
    record.text = await ctx.htmlToMarkdown(record.html, ctx.tabId);
    record.contentType = CONTENT_TYPES.MARKDOWN;
  } catch {
    const fallbackText = stripHtml(record.html);
    record.text = fallbackText;
    if (fallbackText) record.contentType = CONTENT_TYPES.MARKDOWN;
  }
  delete (record as Record<string, unknown>).html;
}

/** Build a new record from a draft, normalize it, and persist it. */
export async function createRecord(
  store: RecordsStore,
  payload: Partial<MyZRecord>,
  ctx: RecordServiceContext = {},
): Promise<MyZRecord> {
  const now = nowOf(ctx);
  const kind = getRecordKind(payload);
  const record = ensureRecordSchemaVersion({
    ...payload,
    id: idOf(ctx, payload.id),
    kind,
    createdAt: payload.createdAt || now,
    updatedAt: now,
  }) as MyZRecord;
  record.contentType = resolveRecordContentType(record);
  await resolveRecordText(record, ctx);
  applyKindShape(record);
  record.schemaId ??= RECORD_SCHEMA_ID;
  await store.upsert(record);
  return record;
}

/** Merge a patch into an existing record, normalize it, and persist it. */
export async function updateRecord(
  store: RecordsStore,
  id: string,
  patch: Partial<MyZRecord>,
  ctx: RecordServiceContext = {},
): Promise<MyZRecord> {
  const existing = await store.get(id);
  if (!existing) throw new Error("Record not found");
  const requestedKind =
    typeof patch.kind === "string" &&
    Object.values(RECORD_KINDS).includes(patch.kind as RECORD_KINDS)
      ? (patch.kind as RECORD_KINDS)
      : existing.kind;
  const updated = ensureRecordSchemaVersion({
    ...existing,
    ...patch,
    kind: requestedKind,
    updatedAt: nowOf(ctx),
  }) as MyZRecord;
  updated.contentType = resolveRecordContentType(updated);
  applyKindShape(updated);
  updated.schemaId ??= RECORD_SCHEMA_ID;
  await store.upsert(updated);
  return updated;
}

/** Replace only a record's anchor range. */
export async function updateRecordRange(
  store: RecordsStore,
  id: string,
  range: MyZRecord["range"],
  ctx: RecordServiceContext = {},
): Promise<MyZRecord> {
  const existing = await store.get(id);
  if (!existing) throw new Error("Record not found");
  const updated = {
    ...existing,
    range,
    updatedAt: nowOf(ctx),
  } as MyZRecord;
  await store.upsert(updated);
  return updated;
}

export async function removeRecord(
  store: RecordsStore,
  id: string,
): Promise<void> {
  await store.remove(id);
}

/** Remove several records; returns how many ids were attempted. */
export async function removeRecords(
  store: RecordsStore,
  ids: string[],
): Promise<number> {
  for (const id of ids) {
    await store.remove(id);
  }
  return ids.length;
}

/**
 * Apply the same note/tags patch to several records. Only these fields are
 * honoured, matching the bulk-edit UI.
 */
export async function updateRecordsPatch(
  store: RecordsStore,
  ids: string[],
  patch: Partial<MyZRecord>,
  ctx: RecordServiceContext = {},
): Promise<number> {
  const now = nowOf(ctx);
  for (const id of ids) {
    const existing = await store.get(id);
    if (!existing) continue;
    const updated: MyZRecord = {
      ...existing,
      note: typeof patch.note === "string" ? patch.note.trim() : existing.note,
      tags: Array.isArray(patch.tags) ? patch.tags : existing.tags,
      updatedAt: now,
    };
    await store.upsert(updated);
  }
  return ids.length;
}

export async function listRecords(store: RecordsStore): Promise<MyZRecord[]> {
  return store.listAll();
}

/** Records across several urls, de-duplicated by id. */
export async function getRecordsForUrls(
  store: RecordsStore,
  urls: string[],
): Promise<MyZRecord[]> {
  const matches = (await Promise.all(urls.map((url) => store.getByUrl(url)))).flat();
  return Array.from(new Map(matches.map((record) => [record.id, record])).values());
}

export async function listTags(store: RecordsStore): Promise<string[]> {
  return collectTags(await store.listAll());
}
