import { describe, expect, it } from "vitest";
import { excerpt } from "@/reader/text.js";

describe("excerpt", () => {
  it("collapses whitespace", () => {
    expect(excerpt("  hello   world\n")).toBe("hello world");
  });

  it("keeps short text unchanged", () => {
    expect(excerpt("short", 72)).toBe("short");
  });

  it("truncates with an ellipsis", () => {
    expect(excerpt("a".repeat(10), 4)).toBe("aaaa…");
  });

  it("handles empty input", () => {
    expect(excerpt("")).toBe("");
  });

  it("truncates by code point (does not split surrogate pairs)", () => {
    expect(excerpt("😀😀😀", 2)).toBe("😀😀…");
  });
});
