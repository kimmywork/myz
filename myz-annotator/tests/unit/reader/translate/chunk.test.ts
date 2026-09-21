import { describe, expect, it } from "vitest";
import { splitIntoBlocks, splitIntoChunks } from "@/reader/translate/chunk.js";

describe("splitIntoBlocks", () => {
  it("returns nothing for blank text", () => {
    expect(splitIntoBlocks("\n  \n")).toEqual([]);
  });

  it("splits paragraphs on blank lines", () => {
    expect(splitIntoBlocks("First paragraph.\n\nSecond paragraph.")).toEqual([
      "First paragraph.",
      "Second paragraph.",
    ]);
  });

  it("collapses line wraps within a paragraph", () => {
    expect(splitIntoBlocks("line one\nline two\nline three")).toEqual([
      "line one line two line three",
    ]);
  });
});

describe("splitIntoChunks", () => {
  it("returns nothing for blank text", () => {
    expect(splitIntoChunks("   \n  ")).toEqual([]);
  });

  it("keeps short text in a single chunk", () => {
    expect(splitIntoChunks("Hello world.")).toEqual(["Hello world."]);
  });

  it("splits CJK sentences", () => {
    const chunks = splitIntoChunks("第一句。第二句！第三句？", 5);
    expect(chunks).toEqual(["第一句。", "第二句！", "第三句？"]);
  });

  it("does not split a decimal number", () => {
    const chunks = splitIntoChunks("Pi is 3.14 and that is all.", 100);
    expect(chunks).toEqual(["Pi is 3.14 and that is all."]);
  });

  it("never exceeds the max length", () => {
    const text = "A".repeat(1000);
    const chunks = splitIntoChunks(text, 120);
    expect(chunks.length).toBeGreaterThan(1);
    expect(
      Math.max(...chunks.map((chunk) => chunk.length)),
    ).toBeLessThanOrEqual(120);
  });

  it("preserves every non-whitespace character", () => {
    const text = "Alpha body text. Beta follows here! Gamma ends.";
    const joined = splitIntoChunks(text, 12).join("");
    expect(joined.replace(/\s/g, "")).toBe(text.replace(/\s/g, ""));
  });
});
