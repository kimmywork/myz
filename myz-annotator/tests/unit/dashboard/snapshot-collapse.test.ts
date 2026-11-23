// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import {
  splitSnapshotSections,
  withActiveAnchor,
} from "@/dashboard/pages/highlight-viewer/snapshot-collapse";

const mark = (id: string, text: string) =>
  `<mark data-myz-anchor="${id}">${text}</mark>`;

describe("splitSnapshotSections", () => {
  it("folds the content around annotated regions into gaps", () => {
    const html = `
      <article>
        <p>intro paragraph one</p>
        <p>intro paragraph two</p>
        <p>the ${mark("rec-1", "marked")} paragraph</p>
        <p>outro paragraph one</p>
      </article>`;
    const sections = splitSnapshotSections(html);

    expect(sections.map((s) => s.kind)).toEqual(["gap", "annotated", "gap"]);
    expect(sections[0].position).toBe("before");
    expect(sections[1].position).toBe("between");
    expect(sections[2].position).toBe("after");
    expect(sections[0].html).toContain("intro paragraph one");
    expect(sections[0].html).toContain("intro paragraph two");
    expect(sections[1].html).toContain("the");
    expect(sections[2].html).toContain("outro paragraph one");
  });

  it("keeps every annotated region visible and folds the interior", () => {
    const html = `
      <article>
        <p>head</p>
        <p>first ${mark("rec-1", "mark")} here</p>
        <p>middle one</p>
        <p>middle two</p>
        <p>second ${mark("rec-2", "mark")} here</p>
        <p>tail</p>
      </article>`;
    const sections = splitSnapshotSections(html);

    expect(sections.map((s) => s.kind)).toEqual([
      "gap",
      "annotated",
      "gap",
      "annotated",
      "gap",
    ]);
    expect(sections[2].position).toBe("between");
    expect(sections[2].html).toContain("middle one");
    expect(sections[2].html).toContain("middle two");
  });

  it("renders the whole body when nothing is annotated", () => {
    const html = `<article><p>only text</p></article>`;
    const sections = splitSnapshotSections(html);
    expect(sections).toHaveLength(1);
    expect(sections[0].kind).toBe("annotated");
    expect(sections[0].html).toContain("only text");
  });

  it("splits wrappers but never takes inline content apart", () => {
    const html = `
      <article>
        <div>
          <p>wrapped plain paragraph</p>
          <p>wrapped <em>${mark("rec-1", "marked")}</em> paragraph</p>
        </div>
      </article>`;
    const sections = splitSnapshotSections(html);
    // The div splits into its block children: plain → gap, marked → region,
    // and the region keeps its inline `<em>` wrapper intact.
    expect(sections.map((s) => s.kind)).toEqual(["gap", "annotated"]);
    expect(sections[1].html).toContain("wrapped");
    expect(sections[1].html).toContain("<em>");
    expect(sections[1].html).toContain("</em>");
  });

  it("reports gap sizes for the expand affordance", () => {
    const html = `
      <article>
        <p>some hidden words</p>
        <p>visible ${mark("rec-1", "marked")} words</p>
      </article>`;
    const sections = splitSnapshotSections(html);
    expect(sections[0].kind).toBe("gap");
    expect(sections[0].chars).toBeGreaterThan(5);
  });
});

describe("withActiveAnchor", () => {
  it("adds the active class to one record's mark", () => {
    const html = `<article><p>${mark("rec-1", "first")}</p><p>${mark(
      "rec-2",
      "second",
    )}</p></article>`;
    const out = withActiveAnchor(html, "rec-2");
    // Only the second mark is emphasised.
    expect(out.match(/is-active/g)).toHaveLength(1);
    expect(out).toContain('data-myz-anchor="rec-2" class="is-active"');
  });
});
