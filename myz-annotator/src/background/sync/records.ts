import type { MyZRecord } from "@myz/shared/types";
import { SYNC_PROTOCOL_VERSION } from "@myz/shared/versioning";
import { deleteHighlight, getAllHighlights, saveHighlight } from "../storage";
import { sha256, utf8ToBytes } from "./crypto";
import type { SyncRecord, SyncRecordPayload, SyncRecordType } from "./types";
import {
  decodeBinaryPayload,
  encodeBinaryPayload,
  stableStringify,
} from "./utils";

const HIGHLIGHT_PREFIX = "h:";

export function recordIdForHighlight(id: string) {
  return `${HIGHLIGHT_PREFIX}${id}`;
}

export function parseRecordId(recordId: string): {
  type: SyncRecordType;
  id: string;
} | null {
  if (recordId.startsWith(HIGHLIGHT_PREFIX)) {
    return { type: "highlight", id: recordId.slice(HIGHLIGHT_PREFIX.length) };
  }
  return null;
}

function resolveUpdatedAt(value?: string) {
  if (value && typeof value === "string") {
    return value;
  }
  return new Date().toISOString();
}

export async function buildRecordHash(
  payload: SyncRecordPayload,
): Promise<string> {
  const json = stableStringify(payload);
  const bytes = utf8ToBytes(json);
  const digest = await sha256(bytes);
  return Array.from(digest)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function collectLocalRecords(): Promise<SyncRecord[]> {
  const records: SyncRecord[] = [];
  const highlights = await getAllHighlights();
  for (const highlight of highlights) {
    const updatedAt = resolveUpdatedAt(
      highlight.updatedAt || highlight.createdAt,
    );
    const recordId = recordIdForHighlight(highlight.id);
    const payload: SyncRecordPayload = {
      protocolVersion: SYNC_PROTOCOL_VERSION,
      recordId,
      type: "highlight",
      updatedAt,
      data: highlight,
    };
    const recordHash = await buildRecordHash(payload);
    records.push({
      recordId,
      type: "highlight",
      updatedAt,
      data: highlight,
      recordHash,
    });
  }
  return records;
}

export function serializeRecordPayload(record: SyncRecord): Uint8Array {
  const payload: SyncRecordPayload = {
    protocolVersion: SYNC_PROTOCOL_VERSION,
    recordId: record.recordId,
    type: record.type,
    updatedAt: record.updatedAt,
    data: record.data,
  };
  return encodeBinaryPayload(payload);
}

export function deserializeRecordPayload(
  payload: Uint8Array,
): SyncRecordPayload {
  return decodeBinaryPayload(payload) as SyncRecordPayload;
}

export async function applyRecordPayload(
  payload: SyncRecordPayload,
): Promise<void> {
  if (payload.protocolVersion !== SYNC_PROTOCOL_VERSION) {
    console.warn("Unsupported sync payload version", payload.protocolVersion);
    return;
  }

  if (payload.type === "highlight") {
    const record = payload.data as MyZRecord;
    await saveHighlight({ ...record, updatedAt: payload.updatedAt });
    return;
  }
}

export async function deleteLocalRecord(recordId: string): Promise<void> {
  const parsed = parseRecordId(recordId);
  if (!parsed) return;
  if (parsed.type === "highlight") {
    await deleteHighlight(parsed.id);
    return;
  }
}
