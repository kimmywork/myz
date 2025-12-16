import { describe, it, expect } from "vitest";
import {
  normalizeHighlightStyle,
  describeHighlightStyle,
  normalizeColor,
} from "@/shared/highlightUtils";

import { HIGHLIGHT_STYLES, DEFAULT_HIGHLIGHT_STYLE } from "@/shared/types";

describe("highlightUtils", () => {
  describe("normalizeHighlightStyle", () => {
    it("should return default style for null/undefined", () => {
      expect(normalizeHighlightStyle(null)).toBe(DEFAULT_HIGHLIGHT_STYLE);
      expect(normalizeHighlightStyle(undefined)).toBe(DEFAULT_HIGHLIGHT_STYLE);
    });

    it("should return correct style for valid input", () => {
      expect(normalizeHighlightStyle("underline")).toBe(
        HIGHLIGHT_STYLES.UNDERLINE,
      );
      expect(normalizeHighlightStyle("wavy")).toBe(HIGHLIGHT_STYLES.WAVY);
      expect(normalizeHighlightStyle("paint")).toBe(HIGHLIGHT_STYLES.PAINT);
    });

    it("should return default style for invalid input", () => {
      expect(normalizeHighlightStyle("invalid")).toBe(DEFAULT_HIGHLIGHT_STYLE);
    });

    it("should be case insensitive", () => {
      expect(normalizeHighlightStyle("UNDERLINE")).toBe(
        HIGHLIGHT_STYLES.UNDERLINE,
      );
    });
  });

  describe("describeHighlightStyle", () => {
    it("should return correct description", () => {
      expect(describeHighlightStyle(HIGHLIGHT_STYLES.UNDERLINE)).toBe("下划线");
      expect(describeHighlightStyle(HIGHLIGHT_STYLES.WAVY)).toBe("波浪线");
      expect(describeHighlightStyle(HIGHLIGHT_STYLES.PAINT)).toBe("高亮");
    });
  });

  describe("normalizeColor", () => {
    it("should return color if valid hex", () => {
      expect(normalizeColor("#123456", "#000000")).toBe("#123456");
    });

    it("should return fallback if invalid hex", () => {
      expect(normalizeColor("invalid", "#000000")).toBe("#000000");
      expect(normalizeColor("#123", "#000000")).toBe("#000000"); // 3 digit hex not supported by regex
    });

    it("should return fallback if not string", () => {
      expect(normalizeColor(null as any, "#000000")).toBe("#000000");
    });
  });
});
