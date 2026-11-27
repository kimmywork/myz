// @vitest-environment node
import { recordAnchorText } from "@myz/shared/recordDisplay";
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

  it("counts overlapping occurrences, because overlap is not unique", () => {
    // `ana` occurs at 1 and 3 in `banana`: a non-overlapping count would call
    // this unique and place the highlight on a guess.
    expect(countOccurrences("banana", "ana")).toBe(2);
    expect(countOccurrences("aaaa", "aa")).toBe(3);
    expect(countOccurrences("abc", "x")).toBe(0);
    expect(countOccurrences("abc", "")).toBe(0);
  });

  it("refuses a placement that only looked unique without overlap", () => {
    const anchor = resolveSnapshotAnchor("ana", "banana");
    expect(anchor.status).toBe("unlocated");
    expect(anchor.matches).toBe(2);
  });

  it("normalizes both sides the same way", () => {
    expect(normalizeAnchorText("  a\n b\t ")).toBe("a b");
    expect(normalizeAnchorText(undefined)).toBe("");
  });

  it("locates a Markdown record in the snapshot's plain DOM text", () => {
    // The actual regression: record.text is Markdown (Defuddle), while a
    // snapshot holds flattened page text. 2026-11-27.
    const record = {
      text: "与轮询相比，`clipboardchange` 事件具有多项优势：\n\n- **高效**：仅在实际发生变化时触发事件。",
    };
    const snapshot =
      "与轮询相比，clipboardchange 事件具有多项优势： 高效：仅在实际发生变化时触发事件。";
    const anchor = resolveSnapshotAnchor(recordAnchorText(record), snapshot);
    expect(anchor.status).toBe("located");
    expect(anchor.matches).toBe(1);
  });

  it("prefers the stored plain anchor over a Markdown strip", () => {
    expect(
      recordAnchorText({
        text: "alpha **beta** gamma",
        anchorText: "alpha beta gamma",
      }),
    ).toBe("alpha beta gamma");
  });
});
