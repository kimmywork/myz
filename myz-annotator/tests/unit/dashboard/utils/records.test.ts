import {
  MyZRecord,
  RECORD_KINDS,
  SOURCE_TYPES,
  getRecordKind,
} from "@myz/shared/types";
import { RECORD_SCHEMA_VERSION } from "@myz/shared/versioning";
import { describe, it, expect } from "vitest";
import {
  getRecordKindLabel,
  normalizeRecord,
  computeRecordStats,
  groupHighlightsByDate,
  groupRecordsByPage,
  sortRecordsForPage,
  formatDateTime,
  localDateKey,
} from "@/dashboard/utils/records";

describe("records", () => {
  describe("getRecordKind", () => {
    it("should return CLIP for clip kind", () => {
      expect(getRecordKind({ kind: RECORD_KINDS.CLIP } as MyZRecord)).toBe(
        RECORD_KINDS.CLIP,
      );
    });

    it("should return HIGHLIGHT for other kinds", () => {
      const invalidKindRecord = {
        kind: "other",
      } as unknown as Partial<MyZRecord>;
      expect(getRecordKind(invalidKindRecord)).toBe(RECORD_KINDS.HIGHLIGHT);
      expect(getRecordKind({})).toBe(RECORD_KINDS.HIGHLIGHT);
    });
  });

  describe("getRecordKindLabel", () => {
    it("should return correct labels", () => {
      expect(
        getRecordKindLabel({ kind: RECORD_KINDS.HIGHLIGHT } as MyZRecord),
      ).toBe("划线");
      expect(getRecordKindLabel({ kind: RECORD_KINDS.CLIP } as MyZRecord)).toBe(
        "摘录",
      );
      expect(
        getRecordKindLabel({ kind: RECORD_KINDS.BOOKMARK } as MyZRecord),
      ).toBe("来源");
    });
  });

  describe("normalizeRecord", () => {
    const baseRecord = {
      id: "1",
      text: "",
      createdAt: "2024-01-01T00:00:00.000Z",
      updatedAt: "2024-01-01T00:00:00.000Z",
      url: "https://example.com",
    };

    it("should return null for invalid record", () => {
      expect(normalizeRecord(null)).toBeNull();
      expect(normalizeRecord("string")).toBeNull();
    });

    it("should normalize record with correct kind", () => {
      const record = { ...baseRecord, kind: "unknown" };
      const normalized = normalizeRecord(record);
      expect(normalized).toEqual({
        ...baseRecord,
        kind: RECORD_KINDS.HIGHLIGHT,
        contentType: "text/plain",
        sourceType: SOURCE_TYPES.WEB,
        schemaVersion: RECORD_SCHEMA_VERSION,
      });
    });
  });

  describe("computeRecordStats", () => {
    it("should return zeros for empty records", () => {
      expect(computeRecordStats([])).toEqual({
        total: 0,
        highlightCount: 0,
        savedCount: 0,
      });
    });

    it("should count highlights and clips correctly", () => {
      const records = [
        { kind: RECORD_KINDS.HIGHLIGHT },
        { kind: RECORD_KINDS.CLIP },
        { kind: RECORD_KINDS.HIGHLIGHT },
      ] as MyZRecord[];

      expect(computeRecordStats(records)).toEqual({
        total: 3,
        highlightCount: 2,
        savedCount: 1,
      });
    });
  });

  describe("groupHighlightsByDate", () => {
    it("should group records by date", () => {
      const records = [
        { id: "1", createdAt: "2023-01-01T10:00:00Z" },
        { id: "2", createdAt: "2023-01-02T10:00:00Z" },
        { id: "3", createdAt: "2023-01-01T11:00:00Z" },
      ] as MyZRecord[];

      const grouped = groupHighlightsByDate(records);

      expect(grouped).toHaveLength(2);
      // Sorted by date descending
      expect(grouped[0][0]).toBe("2023-01-02");
      expect(grouped[0][1]).toHaveLength(1);
      expect(grouped[1][0]).toBe("2023-01-01");
      expect(grouped[1][1]).toHaveLength(2);
    });

    it("should handle missing createdAt", () => {
      const records = [{ id: "1" }] as MyZRecord[];
      const grouped = groupHighlightsByDate(records);
      expect(grouped[0][0]).toBe("未知日期");
    });
  });

  describe("groupRecordsByPage", () => {
    it("should group records by url and keep latest timestamp", () => {
      const records = [
        {
          id: "1",
          kind: RECORD_KINDS.HIGHLIGHT,
          text: "",
          createdAt: "2024-02-01T10:00:00Z",
          updatedAt: "2024-02-01T10:00:00Z",
          url: "https://example.com/a",
        },
        {
          id: "2",
          kind: RECORD_KINDS.CLIP,
          text: "",
          createdAt: "2024-02-02T10:00:00Z",
          updatedAt: "2024-02-02T10:00:00Z",
          url: "https://example.com/a",
        },
        {
          id: "3",
          kind: RECORD_KINDS.HIGHLIGHT,
          text: "",
          createdAt: "2024-02-03T10:00:00Z",
          updatedAt: "2024-02-03T10:00:00Z",
          url: "https://foo.bar/path",
        },
      ] as MyZRecord[];

      const groups = groupRecordsByPage(records);
      expect(groups).toHaveLength(2);
      expect(groups[0].url).toBe("https://foo.bar/path");
      expect(groups[0].hostname).toBe("foo.bar");
      const exampleGroup = groups.find((group) =>
        group.url.includes("example"),
      )!;
      expect(exampleGroup.count).toBe(2);
      expect(exampleGroup.latestAt).toBe("2024-02-02T10:00:00.000Z");
    });

    it("should not bucket an invalid date into 1970", () => {
      const records = [
        {
          id: "1",
          kind: RECORD_KINDS.HIGHLIGHT,
          text: "",
          createdAt: "not-a-date",
          updatedAt: "also-bad",
          url: "https://example.com/bad",
        },
      ] as MyZRecord[];

      const groups = groupRecordsByPage(records);
      expect(groups).toHaveLength(1);
      expect(groups[0].latestAt).toBe("not-a-date");
      expect(groups[0].latestAt.startsWith("1970")).toBe(false);
    });
  });

  describe("sortRecordsForPage", () => {
    const base = {
      kind: RECORD_KINDS.HIGHLIGHT,
      text: "",
      url: "https://example.com",
    };

    it("should sort by time when mode is time", () => {
      const records = [
        {
          ...base,
          id: "1",
          createdAt: "2024-02-01T10:00:00Z",
          updatedAt: "2024-02-01T10:00:00Z",
        },
        {
          ...base,
          id: "2",
          createdAt: "2024-02-03T10:00:00Z",
          updatedAt: "2024-02-03T10:00:00Z",
        },
      ] as MyZRecord[];

      const sorted = sortRecordsForPage(records, "time");
      expect(sorted.map((item) => item.id)).toEqual(["2", "1"]);
    });

    it("should sort by range then fallback to time", () => {
      const records = [
        {
          ...base,
          id: "1",
          createdAt: "2024-02-01T10:00:00Z",
          updatedAt: "2024-02-01T10:00:00Z",
          range: {
            start: {
              charOffset: 5,
              path: [
                { name: "div", index: 0 },
                { name: "#text", index: 0 },
              ],
            },
          },
        },
        {
          ...base,
          id: "2",
          createdAt: "2024-02-02T10:00:00Z",
          updatedAt: "2024-02-02T10:00:00Z",
          range: {
            start: {
              charOffset: 1,
              path: [
                { name: "div", index: 1 },
                { name: "#text", index: 0 },
              ],
            },
          },
        },
        {
          ...base,
          id: "3",
          createdAt: "2024-02-04T10:00:00Z",
          updatedAt: "2024-02-04T10:00:00Z",
        },
      ] as MyZRecord[];

      const sorted = sortRecordsForPage(records, "range");
      expect(sorted.map((item) => item.id)).toEqual(["1", "2", "3"]);
    });
  });

  describe("formatDateTime", () => {
    it("should return empty string for empty value", () => {
      expect(formatDateTime("")).toBe("");
    });

    it("should format valid date string", () => {
      const date = new Date("2023-01-01T12:00:00");
      expect(formatDateTime(date.toISOString())).toBe(date.toLocaleString());
    });

    it("should return the original value for an invalid date string", () => {
      expect(formatDateTime("invalid-date")).toBe("invalid-date");
    });
  });

  describe("localDateKey", () => {
    it("should return the local calendar date", () => {
      const date = new Date(2024, 4, 9, 23, 30);
      expect(localDateKey(date.toISOString())).toBe("2024-05-09");
    });

    it("should return an empty string for missing or invalid values", () => {
      expect(localDateKey(undefined)).toBe("");
      expect(localDateKey("nope")).toBe("");
    });
  });
});
