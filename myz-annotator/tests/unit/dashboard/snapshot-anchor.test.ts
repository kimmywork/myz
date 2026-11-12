// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  countOccurrences,
  normalizeAnchorText,
  resolveSnapshotAnchor,
} from "@/dashboard/pages/highlight-viewer/snapshot-anchor";

describe("snapshot anchor resolution", () => {
  it("locates a text that occurs exactly once", () => {
    const anchor = resolveSnapshotAnchor(
      "the selected sentence",
      "before the selected sentence after",
    );
    expect(anchor).toEqual({ basis: "text", status: "located", matches: 1 });
  });

  it("matches across the snapshot's own whitespace", () => {
    const anchor = resolveSnapshotAnchor(
      "the selected sentence",
      "before  the\n\nselected   sentence after",
    );
    expect(anchor.status).toBe("located");
  });

  it("reports a missing text instead of placing it somewhere similar", () => {
    const anchor = resolveSnapshotAnchor(
      "the selected sentence",
      "a page that was rewritten entirely",
    );
    expect(anchor.status).toBe("unlocated");
    expect(anchor.matches).toBe(0);
    expect(anchor.reason).toContain("找不到");
  });

  it("refuses to pick one when the text occurs more than once", () => {
    // The core promise: never guess which occurrence the user meant.
    const anchor = resolveSnapshotAnchor(
      "same sentence",
      "same sentence and later same sentence",
    );
    expect(anchor.status).toBe("unlocated");
    expect(anchor.matches).toBe(2);
    expect(anchor.reason).toContain("2 次");
  });

  it("reports a record with no text as unlocatable", () => {
    const anchor = resolveSnapshotAnchor(undefined, "body");
    expect(anchor.status).toBe("unlocated");
    expect(anchor.basis).toBe("none");
    expect(anchor.reason).toContain("没有文字");
  });

  it("counts non-overlapping occurrences only", () => {
    expect(countOccurrences("aaaa", "aa")).toBe(2);
    expect(countOccurrences("abc", "x")).toBe(0);
    expect(countOccurrences("abc", "")).toBe(0);
  });

  it("normalizes both sides the same way", () => {
    expect(normalizeAnchorText("  a\n b\t ")).toBe("a b");
    expect(normalizeAnchorText(undefined)).toBe("");
  });
});
