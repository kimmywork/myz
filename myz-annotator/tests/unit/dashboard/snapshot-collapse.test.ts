// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import {
  buildSnapshotDisplay,
  withActiveAnchor,
} from "@/dashboard/pages/highlight-viewer/snapshot-collapse";

const mark = (id: string, text: string) =>
  `<mark data-myz-anchor="${id}">${text}</mark>`;

describe("buildSnapshotDisplay", () => {
  it("blurs unmarked runs and keeps annotated regions sharp", () => {
    const html = `
      <article>
        <p>intro paragraph one</p>
        <p>intro paragraph two</p>
        <p>the ${mark("rec-1", "marked")} paragraph</p>
        <p>outro paragraph one</p>
      </article>`;
    const out = buildSnapshotDisplay(html);

    expect(out).toContain('class="myz-snapshot-dim"');
    expect(out).toContain('class="myz-snapshot-region"');
    // The two intro paragraphs merge into one faded run; the outro is a run
    // of its own after the sharp region.
    expect(out.match(/myz-snapshot-dim/g)).toHaveLength(2);
    expect(out).toContain("intro paragraph one");
    expect(out).toContain("intro paragraph two");
    expect(out).toContain("outro paragraph one");
    expect(out).toContain('data-myz-anchor="rec-1"');
  });

  it("keeps every annotated region sharp and blurs the interior", () => {
    const html = `
      <article>
        <p>head</p>
        <p>first ${mark("rec-1", "mark")} here</p>
        <p>middle one</p>
        <p>middle two</p>
        <p>second ${mark("rec-2", "mark")} here</p>
        <p>tail</p>
      </article>`;
    const out = buildSnapshotDisplay(html);

    expect(out.match(/myz-snapshot-region/g)).toHaveLength(2);
    // head / middle / tail → three blurred runs.
    expect(out.match(/myz-snapshot-dim/g)).toHaveLength(3);
    expect(out).toContain("middle one");
  });

  it("renders the body unchanged when nothing is annotated", () => {
    // Nothing to pin: blurring the whole copy would only hide it.
    const html = `<article><p>only text</p></article>`;
    expect(buildSnapshotDisplay(html)).not.toContain("myz-snapshot-dim");
    expect(buildSnapshotDisplay(html)).toContain("only text");
  });

  it("splits wrappers but never takes inline content apart", () => {
    const html = `
      <article>
        <div>
          <p>wrapped plain paragraph</p>
          <p>wrapped <em>${mark("rec-1", "marked")}</em> paragraph</p>
        </div>
      </article>`;
    const out = buildSnapshotDisplay(html);
    // The div splits into its block children: plain → blurred, marked → sharp,
    // and the region keeps its inline `<em>` wrapper intact.
    expect(out.match(/myz-snapshot-dim/g)).toHaveLength(1);
    expect(out).toContain("<em>");
    expect(out).toContain("</em>");
    expect(out).toContain('data-myz-anchor="rec-1"');
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
