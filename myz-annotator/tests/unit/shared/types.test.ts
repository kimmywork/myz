import { describe, expect, it } from "vitest";
import {
  CONTENT_TYPES,
  RECORD_KINDS,
  normalizeContentType,
  resolveRecordContentType,
} from "@/shared/types";

describe("shared types", () => {
  describe("normalizeContentType", () => {
    it("should normalize valid content types", () => {
      expect(normalizeContentType("text/markdown")).toBe(
        CONTENT_TYPES.MARKDOWN,
      );
      expect(normalizeContentType("TEXT/HTML")).toBe(CONTENT_TYPES.HTML);
    });

    it("should return undefined for invalid values", () => {
      expect(normalizeContentType("")).toBeUndefined();
      expect(normalizeContentType("application/json")).toBeUndefined();
    });
  });

  describe("resolveRecordContentType", () => {
    it("should respect explicit contentType", () => {
      expect(
        resolveRecordContentType({
          contentType: CONTENT_TYPES.MARKDOWN,
          kind: RECORD_KINDS.HIGHLIGHT,
        }),
      ).toBe(CONTENT_TYPES.MARKDOWN);
    });

    it("should use html when html is present", () => {
      expect(resolveRecordContentType({ html: "<p>hello</p>" })).toBe(
        CONTENT_TYPES.HTML,
      );
    });

    it("should fallback to plain", () => {
      expect(resolveRecordContentType({})).toBe(CONTENT_TYPES.PLAIN);
    });
  });
});
