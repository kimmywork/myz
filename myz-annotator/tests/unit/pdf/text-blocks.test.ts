import { describe, expect, it } from "vitest";
import {
  groupIntoBlocks,
  groupIntoLines,
  unionRect,
} from "@/pdf/text-blocks.js";

function span(left: number, top: number, right: number, bottom: number) {
  return { rect: { left, top, right, bottom } };
}

describe("groupIntoLines", () => {
  it("merges spans that share a baseline", () => {
    const lines = groupIntoLines([
      span(10, 100, 40, 116),
      span(42, 100.2, 90, 116.2),
    ]);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toHaveLength(2);
  });

  it("separates spans on different lines", () => {
    const lines = groupIntoLines([
      span(10, 100, 40, 116),
      span(10, 130, 80, 146),
    ]);
    expect(lines).toHaveLength(2);
  });
});

describe("groupIntoBlocks", () => {
  it("keeps tightly-leaded lines in one paragraph", () => {
    // line height 16, gap 12 -> same block
    const lines = groupIntoLines([
      span(10, 100, 200, 116),
      span(10, 128, 150, 144),
    ]);
    expect(groupIntoBlocks(lines)).toHaveLength(1);
  });

  it("starts a new block on a paragraph gap", () => {
    // line height 16, gap 24 (> 1.25x height) -> new block
    const lines = groupIntoLines([
      span(10, 100, 200, 116),
      span(10, 140, 150, 156),
    ]);
    const blocks = groupIntoBlocks(lines);
    expect(blocks).toHaveLength(2);
    expect(blocks[0][0]).toHaveLength(1);
  });

  it("groups a heading line separately from the body", () => {
    const lines = groupIntoLines([
      span(10, 60, 120, 82), // heading, height 22
      span(10, 118, 300, 134),
      span(10, 146, 200, 162),
    ]);
    const blocks = groupIntoBlocks(lines);
    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toHaveLength(1);
    expect(blocks[1]).toHaveLength(2);
  });

  it("keeps side-by-side columns in separate blocks", () => {
    const lines = groupIntoLines([
      span(10, 100, 300, 116),
      span(400, 100, 690, 116),
      span(10, 128, 280, 144),
      span(400, 128, 680, 144),
    ]);
    const blocks = groupIntoBlocks(lines);
    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toHaveLength(2);
    expect(blocks[1]).toHaveLength(2);
  });
});

describe("unionRect", () => {
  it("covers all rects", () => {
    expect(
      unionRect([
        { left: 10, top: 100, right: 40, bottom: 116 },
        { left: 42, top: 98, right: 90, bottom: 120 },
      ]),
    ).toEqual({
      left: 10,
      top: 98,
      right: 90,
      bottom: 120,
      height: 22,
      width: 80,
    });
  });
});
