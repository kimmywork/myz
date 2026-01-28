import { describe, it, expect } from "vitest";
import { canonicalUrl, buildUrlAliases, normalizeUrlValue } from "@/shared/url";

describe("url", () => {
  describe("normalizeUrlValue", () => {
    it("should remove hash", () => {
      expect(normalizeUrlValue("https://example.com#hash")).toBe(
        "https://example.com/",
      );
    });

    it("should remove tracking params", () => {
      expect(normalizeUrlValue("https://example.com/?utm_source=test")).toBe(
        "https://example.com/",
      );
    });
  });

  describe("canonicalUrl", () => {
    it("should return normalized url", () => {
      expect(canonicalUrl("https://example.com#hash")).toBe(
        "https://example.com/",
      );
    });
  });

  describe("buildUrlAliases", () => {
    it("should include raw and canonical urls", () => {
      const raw = "https://example.com#hash";
      const canonical = "https://example.com/";
      const aliases = buildUrlAliases(raw, canonical);
      expect(aliases).toContain("https://example.com#hash");
      expect(aliases).toContain("https://example.com/");
    });
  });
});
