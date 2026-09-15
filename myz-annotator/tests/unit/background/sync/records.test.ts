import { SOURCE_TYPES, type MyZRecord } from "@myz/shared/types";
import { SYNC_PROTOCOL_VERSION } from "@myz/shared/versioning";
import { describe, expect, it } from "vitest";
import {
  serializeRecordPayload,
  deserializeRecordPayload,
} from "@/background/sync/records.js";
import type { SyncRecord } from "@/background/sync/types.js";

function pdfRecord(): MyZRecord {
  return {
    schemaVersion: "1.0.0",
    id: "rec-1",
    kind: "highlight" as MyZRecord["kind"],
    sourceType: SOURCE_TYPES.PDF,
    text: "excerpt text",
    url: "myz-pdf:abc123",
    sourceUrl: "myz-pdf:abc123",
    title: "local.pdf",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    pdfLocator: {
      pageNumber: 3,
      text: "excerpt text",
      occurrenceIndex: 1,
      rects: [{ x: 0.1, y: 0.2, width: 0.3, height: 0.02 }],
    },
  };
}

describe("sync record payload round-trip", () => {
  it("preserves sourceType and pdfLocator", () => {
    const record = pdfRecord();
    const syncRecord: SyncRecord = {
      recordId: `h:${record.id}`,
      type: "highlight",
      updatedAt: record.updatedAt,
      data: record,
      recordHash: "hash",
    };

    const payload = serializeRecordPayload(syncRecord);
    const decoded = deserializeRecordPayload(payload);
    const data = decoded.data as MyZRecord;

    expect(decoded.protocolVersion).toBe(SYNC_PROTOCOL_VERSION);
    expect(data.sourceType).toBe(SOURCE_TYPES.PDF);
    expect(data.pdfLocator).toEqual(record.pdfLocator);
    expect(data.url).toBe("myz-pdf:abc123");
  });

  it("survives a web pdf record too", () => {
    const record: MyZRecord = {
      ...pdfRecord(),
      sourceType: SOURCE_TYPES.WEB,
      url: "https://arxiv.org/pdf/2606.19348",
      pdfLocator: { pageNumber: 1, text: "x", rects: [] },
    };
    const decoded = deserializeRecordPayload(
      serializeRecordPayload({
        recordId: `h:${record.id}`,
        type: "highlight",
        updatedAt: record.updatedAt,
        data: record,
        recordHash: "hash",
      }),
    );
    const data = decoded.data as MyZRecord;
    expect(data.sourceType).toBe(SOURCE_TYPES.WEB);
    expect(data.pdfLocator?.pageNumber).toBe(1);
  });
});
