import { sanitizeHtmlString } from "@myz/shared/sanitizeHtml";
import { CONTENT_TYPES, MyZRecord, RECORD_KINDS } from "@myz/shared/types";
import { RECORD_SCHEMA_VERSION } from "@myz/shared/versioning";
import { describe, it, expect } from "vitest";
import {
  applyTimestampFallback,
  buildHighlightSignature,
  buildRecordSignature,
  dedupeOrder,
  normalizeImportStrategy,
  resolveImportConflict,
  sanitizeImportedHighlight,
} from "@/background/import";
import { renderHighlightContent } from "@/dashboard/utils/records/render";

const validRange = {
  start: { charOffset: 0, path: [{ name: "p", index: 0 }] },
  end: { charOffset: 5, path: [{ name: "p", index: 0 }] },
};

const record = (partial: Partial<MyZRecord> = {}): MyZRecord =>
  ({
    schemaVersion: RECORD_SCHEMA_VERSION,
    kind: RECORD_KINDS.CLIP,
    id: "r",
    text: "text",
    url: "https://example.com/r",
    sourceUrl: "https://example.com/r",
    createdAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-01-01T00:00:00.000Z",
    ...partial,
  }) as MyZRecord;

describe("background import normalizeImportStrategy", () => {
  it("should normalize valid strategies", () => {
    expect(normalizeImportStrategy("skip")).toBe("skip");
    expect(normalizeImportStrategy("overwrite")).toBe("overwrite");
    expect(normalizeImportStrategy("latest")).toBe("latest");
    expect(normalizeImportStrategy("keep-latest")).toBe("latest");
    expect(normalizeImportStrategy("OVERWRITE")).toBe("overwrite");
  });

  it("should fall back to skip for unknown strategies", () => {
    expect(normalizeImportStrategy("replace")).toBe("skip");
    expect(normalizeImportStrategy(undefined)).toBe("skip");
  });
});

describe("background import sanitizeImportedHighlight", () => {
  it("should sanitize a valid clip record", () => {
    const result = sanitizeImportedHighlight({
      id: "c1",
      kind: "clip",
      url: "https://example.com/clip",
      sourceUrl: "https://example.com/clip",
      title: "Clip Title",
      text: "clip text",
      note: "clip note",
      tags: ["a", "a", ""],
      createdAt: "2024-06-01T10:00:00.000Z",
    });
    expect(result).toMatchObject({
      id: "c1",
      kind: RECORD_KINDS.CLIP,
      url: "https://example.com/clip",
      hostname: "example.com",
      contentType: CONTENT_TYPES.PLAIN,
      schemaVersion: RECORD_SCHEMA_VERSION,
      tags: ["a"],
    });
  });

  it("should derive hostname from url when missing", () => {
    const result = sanitizeImportedHighlight({
      id: "c2",
      kind: "clip",
      url: "https://sub.example.org/page",
      text: "text",
    });
    expect(result?.hostname).toBe("sub.example.org");
  });

  it("should keep a bookmark even without text content", () => {
    const result = sanitizeImportedHighlight({
      id: "b1",
      kind: "bookmark",
      url: "https://example.com/bookmark",
      title: "Only a Title",
    });
    expect(result).not.toBeNull();
    expect(result?.kind).toBe(RECORD_KINDS.BOOKMARK);
  });

  it("should return null for missing url", () => {
    expect(
      sanitizeImportedHighlight({
        id: "x",
        kind: "clip",
        text: "no url",
      }),
    ).toBeNull();
  });

  it("should return null for highlight without a valid range", () => {
    expect(
      sanitizeImportedHighlight({
        id: "h1",
        kind: "highlight",
        url: "https://example.com/h",
        text: "highlight text",
      }),
    ).toBeNull();
  });

  it("should keep a highlight when a valid range is present", () => {
    const result = sanitizeImportedHighlight({
      id: "h2",
      kind: "highlight",
      url: "https://example.com/h",
      text: "highlight text",
      range: validRange,
    });
    expect(result?.kind).toBe(RECORD_KINDS.HIGHLIGHT);
    expect(result?.range).toEqual(validRange);
  });

  it("should return null for non-object input", () => {
    expect(sanitizeImportedHighlight(null)).toBeNull();
    expect(sanitizeImportedHighlight("clip")).toBeNull();
  });
});

describe("background import signatures", () => {
  it("buildHighlightSignature should combine url and range", () => {
    const result = buildHighlightSignature(
      record({
        kind: RECORD_KINDS.HIGHLIGHT,
        url: "https://example.com/h",
        range: validRange,
      }),
    );
    expect(result).toBe(`https://example.com/h::${JSON.stringify(validRange)}`);
  });

  it("buildHighlightSignature should be empty without a range", () => {
    const result = buildHighlightSignature(
      record({ url: "https://example.com/c" }),
    );
    expect(result).toBe("");
  });

  it("buildRecordSignature should identify clips by kind, canonical url and content", () => {
    const result = buildRecordSignature(
      record({
        url: "https://example.com/clip?from=1#frag",
        text: "signature text",
      }),
    );
    expect(result).toBe(`clip::https://example.com/clip::signature text`);
  });
});

describe("background import resolveImportConflict", () => {
  const existing = record({
    id: "e",
    url: "https://example.com/e",
    text: "old",
    updatedAt: "2024-01-01T00:00:00.000Z",
  });
  const incoming = record({
    id: "i",
    url: "https://example.com/i",
    text: "new",
    updatedAt: "2024-06-01T00:00:00.000Z",
  });

  it("should skip for skip strategy", () => {
    expect(resolveImportConflict("skip", existing, incoming)).toBe(false);
  });

  it("should overwrite for overwrite strategy", () => {
    expect(resolveImportConflict("overwrite", existing, incoming)).toBe(true);
  });

  it("should keep latest when incoming is newer", () => {
    expect(resolveImportConflict("latest", existing, incoming)).toBe(true);
  });

  it("should keep existing when incoming is older", () => {
    const older = record({
      ...incoming,
      updatedAt: "2020-01-01T00:00:00.000Z",
    });
    expect(resolveImportConflict("latest", existing, older)).toBe(false);
  });

  it("should take incoming when existing has no timestamp under latest", () => {
    const noTimestamp = record({ ...existing, updatedAt: "" });
    expect(resolveImportConflict("latest", noTimestamp, incoming)).toBe(true);
  });
});

describe("background import applyTimestampFallback", () => {
  it("should fill missing timestamps", () => {
    const target: Partial<MyZRecord> = {};
    applyTimestampFallback(target);
    expect(typeof target.createdAt).toBe("string");
    expect(target.updatedAt).toBe(target.createdAt);
  });

  it("should prefer existing timestamps", () => {
    const target: Partial<MyZRecord> = {
      createdAt: "2024-01-01T00:00:00.000Z",
    };
    applyTimestampFallback(target);
    expect(target.updatedAt).toBe("2024-01-01T00:00:00.000Z");
  });
});

describe("background import dedupeOrder", () => {
  it("should dedupe and drop unknown ids while keeping order", () => {
    const highlights: Record<string, MyZRecord> = {
      a: record({ id: "a" }),
      b: record({ id: "b" }),
      c: record({ id: "c" }),
    };
    expect(
      dedupeOrder(["c", "a", "a", "c", "b", "nope", ""], highlights),
    ).toEqual(["c", "a", "b"]);
  });

  it("should return empty array for non-array input", () => {
    expect(dedupeOrder(undefined as unknown as string[], {})).toEqual([]);
  });
});

describe("imported HTML sanitization (XSS regression)", () => {
  it("strips event handlers from untrusted HTML strings", () => {
    const clean = sanitizeHtmlString("<img src=x onerror=alert(1)>");
    expect(clean).not.toContain("onerror");
    expect(clean).not.toContain("alert(1)");
  });

  it("neutralizes javascript: links while keeping safe content", () => {
    const clean = sanitizeHtmlString('<a href="javascript:alert(1)">x</a>');
    expect(clean).not.toContain("javascript:");
    expect(clean).toContain("x");
  });

  it("sanitizes record html before highlighting in the dashboard renderer", () => {
    const rendered = renderHighlightContent(
      record({
        contentType: CONTENT_TYPES.HTML,
        html: '<img src=x onerror=alert(1)><b onclick="alert(2)">bold</b>',
      }),
      [],
    );
    expect(rendered).not.toContain("onerror");
    expect(rendered).not.toContain("onclick");
    expect(rendered).toContain("bold");
  });
});
