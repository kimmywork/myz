import { RECORD_KINDS, type MyZRecord } from "@myz/shared/types";
import { RECORD_SCHEMA_VERSION } from "@myz/shared/versioning";
import { describe, expect, it } from "vitest";
import { buildMarkdownExport } from "../src/markdown-export.js";

function record(overrides: Record<string, unknown> = {}): MyZRecord {
  return {
    schemaVersion: RECORD_SCHEMA_VERSION,
    id: "r1",
    kind: RECORD_KINDS.CLIP,
    text: "quoted text",
    url: "https://example.com/a",
    title: "Example Title",
    createdAt: "2026-01-02T00:00:00.000Z",
    updatedAt: "2026-01-02T00:00:00.000Z",
    ...overrides,
  } as MyZRecord;
}

describe("buildMarkdownExport", () => {
  it("renders an empty export placeholder", () => {
    expect(buildMarkdownExport([])).toContain("No highlights available");
  });

  it("groups by date and includes title, tags, page and quote", () => {
    const markdown = buildMarkdownExport([
      record({ tags: ["work", "reading"] }),
    ]);
    expect(markdown).toContain("# MyZ Export");
    expect(markdown).toContain("## 2026-01-02");
    expect(markdown).toContain("Example Title");
    expect(markdown).toContain("#work");
    expect(markdown).toContain("Page:");
    expect(markdown).toContain("> quoted text");
  });

  it("includes notes and color when present", () => {
    const markdown = buildMarkdownExport([
      record({ note: "my note", color: "#b58900" }),
    ]);
    expect(markdown).toContain("Note:");
    expect(markdown).toContain("my note");
    expect(markdown).toContain("Color: #b58900");
  });
});
