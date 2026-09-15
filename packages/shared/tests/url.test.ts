import { describe, it, expect } from "vitest";
import {
  canonicalUrl,
  buildUrlAliases,
  normalizeUrlValue,
  extractPdfUrlFromBrowserUrl,
  buildPdfSourceUrl,
  isPdfSourceUrl,
} from "../src/url";

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

  describe("extractPdfUrlFromBrowserUrl", () => {
    it("returns direct pdf urls", () => {
      expect(
        extractPdfUrlFromBrowserUrl(
          "https://wiki.kimleo.net/static/file/doc/Swift-Embrace-Change.pdf",
        ),
      ).toBe(
        "https://wiki.kimleo.net/static/file/doc/Swift-Embrace-Change.pdf",
      );
    });

    it("unwraps the chrome pdf viewer url", () => {
      const viewer =
        "chrome-extension://mhjfbmdgcfjbbpaeojofohoefgiehjai/index.html?file=https%3A%2F%2Fwiki.kimleo.net%2Fstatic%2Ffile%2Fdoc%2FSwift-Embrace-Change.pdf&streaming=true";
      expect(extractPdfUrlFromBrowserUrl(viewer)).toBe(
        "https://wiki.kimleo.net/static/file/doc/Swift-Embrace-Change.pdf",
      );
    });

    it("returns null for non-pdf urls", () => {
      expect(
        extractPdfUrlFromBrowserUrl("https://example.com/article"),
      ).toBeNull();
      expect(extractPdfUrlFromBrowserUrl(undefined)).toBeNull();
    });
  });

  describe("pdf source url", () => {
    it("builds and detects synthetic keys", () => {
      const url = buildPdfSourceUrl("abc123");
      expect(url).toBe("myz-pdf:abc123");
      expect(isPdfSourceUrl(url)).toBe(true);
      expect(isPdfSourceUrl("https://example.com/a.pdf")).toBe(false);
    });
  });
});
