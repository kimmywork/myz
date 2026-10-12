import { describe, expect, it } from "vitest";
import { RECORD_KINDS, SOURCE_TYPES } from "../src/enums";
import { normalizeRecord as normalizeRecordFromHighlightUtils } from "../src/highlightUtils";
import {
  normalizeRecord,
  normalizeSourceType,
  resolveRecordSourceType,
} from "../src/types";
import { buildPdfSourceUrl, isPdfSourceUrl } from "../src/url";

function baseRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: "rec-1",
    kind: RECORD_KINDS.HIGHLIGHT,
    text: "excerpt",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    url: "https://example.com/doc",
    ...overrides,
  };
}

describe("source type normalization", () => {
  it("normalizes valid source types", () => {
    expect(normalizeSourceType("web")).toBe(SOURCE_TYPES.WEB);
    expect(normalizeSourceType("PDF")).toBe(SOURCE_TYPES.PDF);
  });

  it("returns undefined for invalid values", () => {
    expect(normalizeSourceType("")).toBeUndefined();
    expect(normalizeSourceType("paper")).toBeUndefined();
  });

  it("defaults legacy records to web", () => {
    expect(resolveRecordSourceType({})).toBe(SOURCE_TYPES.WEB);
    expect(resolveRecordSourceType({ sourceType: SOURCE_TYPES.PDF })).toBe(
      SOURCE_TYPES.PDF,
    );
  });
});

describe("normalizeRecord with pdf locator", () => {
  it("keeps a valid pdf locator and source type", () => {
    const record = normalizeRecord(
      baseRecord({
        sourceType: SOURCE_TYPES.PDF,
        pdfLocator: {
          pageNumber: 3,
          text: "Swift 2",
          occurrenceIndex: 1,
          rects: [{ x: 0.1, y: 0.2, width: 0.3, height: 0.02 }],
        },
      }),
    );
    expect(record?.sourceType).toBe(SOURCE_TYPES.PDF);
    expect(record?.pdfLocator?.pageNumber).toBe(3);
    expect(record?.pdfLocator?.text).toBe("Swift 2");
    expect(record?.pdfLocator?.rects?.[0]).toEqual({
      x: 0.1,
      y: 0.2,
      width: 0.3,
      height: 0.02,
    });
  });

  it("defaults legacy records to web", () => {
    const record = normalizeRecord(baseRecord());
    expect(record?.sourceType).toBe(SOURCE_TYPES.WEB);
    expect(record?.pdfLocator).toBeUndefined();
  });

  it("rejects an invalid pdf locator", () => {
    const record = normalizeRecord(
      baseRecord({
        sourceType: SOURCE_TYPES.PDF,
        pdfLocator: { pageNumber: 0, text: "" },
      }),
    );
    expect(record).toBeNull();
  });
});

describe("local pdf source url", () => {
  it("builds and detects synthetic keys", () => {
    const url = buildPdfSourceUrl("abc123");
    expect(url).toBe("myz-pdf:abc123");
    expect(isPdfSourceUrl(url)).toBe(true);
    expect(isPdfSourceUrl("https://example.com/a.pdf")).toBe(false);
  });
});

describe("normalizeRecord single source of truth", () => {
  it("normalizes highlight style case-insensitively", () => {
    const record = normalizeRecord(baseRecord({ style: "UNDERLINE" }));
    expect(record?.style).toBe("underline");
  });

  it("drops style from non-highlight records", () => {
    const record = normalizeRecord(
      baseRecord({ kind: RECORD_KINDS.CLIP, style: "paint" }),
    );
    expect(record?.kind).toBe(RECORD_KINDS.CLIP);
    expect(record?.style).toBeUndefined();
  });

  it("keeps the highlightUtils entry point aligned with types", () => {
    const input = baseRecord({ style: "WAVY" });
    expect(normalizeRecordFromHighlightUtils(input)).toEqual(
      normalizeRecord(input),
    );
    expect(normalizeRecordFromHighlightUtils(null)).toBeNull();
  });
});
