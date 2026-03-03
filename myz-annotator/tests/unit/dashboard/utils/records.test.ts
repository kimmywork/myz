import { describe, it, expect } from "vitest";
import {
  getRecordKindLabel,
  normalizeRecord,
  computeRecordStats,
  groupHighlightsByDate,
  groupRecordsByPage,
  sortRecordsForPage,
  formatDateTime,
} from "@/dashboard/utils/records";
import { MyZRecord, RECORD_KINDS, getRecordKind } from "@/shared/types";

describe("records", () => {
  describe("getRecordKind", () => {
    it("should return AI_GENERATED for ai-generated kind", () => {
      expect(
        getRecordKind({ kind: RECORD_KINDS.AI_GENERATED } as MyZRecord),
      ).toBe(RECORD_KINDS.AI_GENERATED);
    });

    it("should return CLIP for clip kind", () => {
      expect(getRecordKind({ kind: RECORD_KINDS.CLIP } as MyZRecord)).toBe(
        RECORD_KINDS.CLIP,
      );
    });

    it("should return HIGHLIGHT for other kinds", () => {
      expect(getRecordKind({ kind: "other" } as any)).toBe(
        RECORD_KINDS.HIGHLIGHT,
      );
      expect(getRecordKind({} as any)).toBe(RECORD_KINDS.HIGHLIGHT);
    });
  });

  describe("getRecordKindLabel", () => {
    it("should return correct labels", () => {
      expect(
        getRecordKindLabel({ kind: RECORD_KINDS.HIGHLIGHT } as MyZRecord),
      ).toBe("划线标注");
      expect(getRecordKindLabel({ kind: RECORD_KINDS.CLIP } as MyZRecord)).toBe(
        "保存文字",
      );
      expect(
        getRecordKindLabel({ kind: RECORD_KINDS.AI_GENERATED } as MyZRecord),
      ).toBe("AI摘录");
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
      expect(normalizeRecord(null as any)).toBeNull();
      expect(normalizeRecord("string" as any)).toBeNull();
    });

    it("should normalize record with correct kind", () => {
      const record = { ...baseRecord, kind: "unknown" } as any;
      const normalized = normalizeRecord(record);
      expect(normalized).toEqual({
        ...baseRecord,
        kind: RECORD_KINDS.HIGHLIGHT,
        contentType: "text/plain",
      });
    });
  });

  describe("computeRecordStats", () => {
    it("should return zeros for empty records", () => {
      expect(computeRecordStats([])).toEqual({
        total: 0,
        highlightCount: 0,
        savedCount: 0,
        aiCount: 0,
        tweetCount: 0,
      });
    });

    it("should count highlights and clips correctly", () => {
      const records = [
        { kind: RECORD_KINDS.HIGHLIGHT },
        { kind: RECORD_KINDS.CLIP },
        { kind: RECORD_KINDS.HIGHLIGHT },
        { kind: RECORD_KINDS.AI_GENERATED },
      ] as MyZRecord[];

      expect(computeRecordStats(records)).toEqual({
        total: 4,
        highlightCount: 2,
        savedCount: 1,
        aiCount: 1,
        tweetCount: 0,
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
          kind: RECORD_KINDS.AI_GENERATED,
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
      const exampleGroup = groups.find((group) => group.url.includes("example"))!;
      expect(exampleGroup.count).toBe(2);
      expect(exampleGroup.latestAt).toBe("2024-02-02T10:00:00.000Z");
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
              path: [{ name: "div", index: 0 }, { name: "#text", index: 0 }],
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
              path: [{ name: "div", index: 1 }, { name: "#text", index: 0 }],
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

    it('should return "Invalid Date" if invalid date string provided', () => {
      expect(formatDateTime("invalid-date")).toBe("Invalid Date");
    });
  });
});
