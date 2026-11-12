// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  CONTEXT_MAX_CHARS,
  clipContextText,
  normalizeContextText,
  sliceAround,
} from "@/content/context-text";

describe("capture context text", () => {
  it("collapses whitespace so a passage reads as one line", () => {
    expect(normalizeContextText("  a\n\n b\t c ")).toBe("a b c");
    expect(normalizeContextText(undefined)).toBe("");
  });

  it("keeps short text untouched and marks a clipped one", () => {
    expect(clipContextText("short")).toBe("short");
    const long = "x".repeat(CONTEXT_MAX_CHARS + 10);
    const clipped = clipContextText(long);
    expect(clipped).toHaveLength(CONTEXT_MAX_CHARS + 1);
    expect(clipped.endsWith("…")).toBe(true);
  });

  it("takes text around the offset, marked where it was cut", () => {
    const text = `${"a".repeat(10)}${"b".repeat(10)}${"c".repeat(10)}`;
    // 10..20 is exactly the middle run; both cuts are marked.
    expect(sliceAround(text, 15, 5)).toBe("…bbbbbbbbbb…");
    // A slice that starts at the block edge has no leading ellipsis.
    expect(sliceAround(text, 3, 5)).toBe("aaaaaaaa…");
  });

  it("clamps an offset outside the block", () => {
    expect(sliceAround("abc", -5, 2)).toBe("ab…");
    expect(sliceAround("abc", 99, 2)).toBe("…bc");
    expect(sliceAround("", 0)).toBe("");
  });
});
