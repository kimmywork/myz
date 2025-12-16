import { describe, it, expect } from "vitest";
import { normalizeBadgeCounts, buildActionTitle } from "@/background/badge";

describe("badge", () => {
  describe("normalizeBadgeCounts", () => {
    it("should return zeros for empty payload", () => {
      expect(normalizeBadgeCounts({})).toEqual({
        highlightCount: 0,
        savedCount: 0,
        total: 0,
      });
    });

    it("should handle legacy count", () => {
      expect(normalizeBadgeCounts({ count: 5 })).toEqual({
        highlightCount: 5,
        savedCount: 0,
        total: 5,
      });
    });

    it("should prefer highlightCount over legacy count if larger", () => {
      expect(normalizeBadgeCounts({ count: 2, highlightCount: 5 })).toEqual({
        highlightCount: 5,
        savedCount: 0,
        total: 5,
      });
    });

    it("should use legacy count if larger than highlightCount", () => {
      expect(normalizeBadgeCounts({ count: 5, highlightCount: 2 })).toEqual({
        highlightCount: 5,
        savedCount: 0,
        total: 5,
      });
    });

    it("should calculate total from parts if total is 0 or missing", () => {
      expect(
        normalizeBadgeCounts({ highlightCount: 3, savedCount: 2 }),
      ).toEqual({
        highlightCount: 3,
        savedCount: 2,
        total: 5,
      });
    });

    it("should use provided total if non-zero", () => {
      expect(
        normalizeBadgeCounts({ highlightCount: 3, savedCount: 2, total: 10 }),
      ).toEqual({
        highlightCount: 3,
        savedCount: 2,
        total: 10,
      });
    });

    it("should handle invalid inputs gracefully", () => {
      expect(
        normalizeBadgeCounts({
          highlightCount: -1,
          savedCount: NaN,
          total: Infinity,
        } as any),
      ).toEqual({
        highlightCount: 0,
        savedCount: 0,
        total: 0,
      });
    });
  });

  describe("buildActionTitle", () => {
    it("should return default title for no items", () => {
      expect(
        buildActionTitle({ total: 0, highlightCount: 0, savedCount: 0 }),
      ).toBe("MyZ Annotator · 暂无条目");
    });

    it("should return title with total only if no details", () => {
      expect(
        buildActionTitle({ total: 5, highlightCount: 0, savedCount: 0 }),
      ).toBe("MyZ Annotator · 共 5 条");
    });

    it("should include highlight count", () => {
      expect(
        buildActionTitle({ total: 5, highlightCount: 5, savedCount: 0 }),
      ).toBe("MyZ Annotator · 共 5 条（高亮 5）");
    });

    it("should include saved count", () => {
      expect(
        buildActionTitle({ total: 3, highlightCount: 0, savedCount: 3 }),
      ).toBe("MyZ Annotator · 共 3 条（保存 3）");
    });

    it("should include both counts", () => {
      expect(
        buildActionTitle({ total: 8, highlightCount: 5, savedCount: 3 }),
      ).toBe("MyZ Annotator · 共 8 条（高亮 5 · 保存 3）");
    });
  });
});
