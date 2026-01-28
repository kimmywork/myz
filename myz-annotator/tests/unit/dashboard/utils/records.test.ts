import { describe, it, expect } from "vitest";
import {
  getRecordKindLabel,
  normalizeRecord,
  computeRecordStats,
  groupHighlightsByDate,
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
    it("should return null for invalid record", () => {
      expect(normalizeRecord(null as any)).toBeNull();
      expect(normalizeRecord("string" as any)).toBeNull();
    });

    it("should normalize record with correct kind", () => {
      const record = { id: "1", kind: "unknown" } as any;
      const normalized = normalizeRecord(record);
      expect(normalized).toEqual({ id: "1", kind: RECORD_KINDS.HIGHLIGHT });
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
        { kind: RECORD_KINDS.AI_GENERATED }, // Treated as highlight in stats logic? Let's check implementation
      ] as MyZRecord[];

      // Based on implementation: if (getRecordKind(item) === RECORD_KINDS.CLIP) savedCount += 1 else highlightCount += 1
      // So AI_GENERATED falls into highlightCount

      expect(computeRecordStats(records)).toEqual({
        total: 4,
        highlightCount: 3,
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
