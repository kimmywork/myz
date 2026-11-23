// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import {
  buildSnapshotDisplay,
  withActiveAnchor,
} from "@/dashboard/pages/highlight-viewer/snapshot-collapse";

const mark = (id: string, text: string) =>
  `<mark data-myz-anchor="${id}">${text}</mark>`;

describe("buildSnapshotDisplay", () => {
  it("keeps annotated regions sharp and folds each hidden run", () => {
    const html = `
      <article>
        <p>intro paragraph one</p>
        <p>intro paragraph two</p>
        <p>the ${mark("rec-1", "marked")} paragraph</p>
        <p>outro paragraph one</p>
      </article>`;
    const out = buildSnapshotDisplay(html);

    expect(out).toContain('class="myz-snapshot-region"');
    expect(out).toContain('data-myz-anchor="rec-1"');
    // Hidden runs keep their frontier blocks as blurred hints (content is
    // still here) and — while both sides hide something — one seam each.
    // The single-block outro run has no middle left, so no seam.
    expect(out.match(/class="myz-snapshot-tear"/g)).toHaveLength(1);
    expect(out.match(/myz-snapshot-fold-hint/g)).toHaveLength(3);
    expect(out).toContain("intro paragraph one");
    expect(out).toContain("outro paragraph one");
  });

  it("keeps every annotated region sharp and folds the interior", () => {
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
    // head / tail are one-block runs (hint only); the middle run has two
    // hidden blocks → its middle still exists → one seam there.
    expect(out.match(/class="myz-snapshot-tear"/g)).toHaveLength(1);
    expect(out.match(/myz-snapshot-fold-hint/g)).toHaveLength(4);
  });

  it("renders the body unchanged when nothing is annotated", () => {
    // Nothing to pin: folding the whole copy would only hide it.
    const html = `<article><p>only text</p></article>`;
    expect(buildSnapshotDisplay(html)).not.toContain("myz-snapshot-tear");
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
    // The div splits into its block children: plain → folded (a one-block run
    // keeps its hint but has no middle to seam), marked → sharp, and the
    // region keeps its inline `<em>` wrapper intact.
    expect(out.match(/class="myz-snapshot-tear"/g) ?? []).toHaveLength(0);
    expect(out.match(/myz-snapshot-fold-hint/g) ?? []).toHaveLength(1);
    expect(out).toContain("<em>");
    expect(out).toContain("</em>");
    expect(out).toContain('data-myz-anchor="rec-1"');
  });
});

describe("folded runs unfold from the highlight edges inward", () => {
  const sixBlocks = `
    <article>
      <p>block one</p><p>block two</p><p>block three</p>
      <p>block four</p><p>block five</p><p>block six</p>
      <p>the ${mark("rec-1", "marked")} paragraph</p>
    </article>`;

  it("shows one seam per run with a hint at each edge", () => {
    const out = buildSnapshotDisplay(sixBlocks, "", {}, [
      { upRev: 0, downRev: 0, expanded: false },
    ]);
    expect(out.match(/class="myz-snapshot-tear"/g)).toHaveLength(1);
    expect(out.match(/myz-snapshot-fold-hint/g)).toHaveLength(2);
    // Hints preview the blocks each side reveals first: the edges, not the
    // middle (用户示例 A…G：上侧提示 B、下侧提示 F)。
    expect(out).toContain("block one");
    expect(out).toContain("block six");
    expect(out).not.toContain("block three");
    expect(out).not.toContain("block four");
  });

  it("unfolds upward from the upper highlight, one block at a time", () => {
    const out = buildSnapshotDisplay(sixBlocks, "", {}, [
      { upRev: 1, downRev: 0, expanded: false },
    ]);
    expect(out).toContain('data-revealed="gap-0-up"');
    expect(out).toContain("block one");
    // The hint advances to the next hidden block on that side.
    expect(out).toContain("block two");
    expect(out).not.toContain("block three");
  });

  it("unfolds downward from the lower highlight, one block at a time", () => {
    const out = buildSnapshotDisplay(sixBlocks, "", {}, [
      { upRev: 0, downRev: 1, expanded: false },
    ]);
    expect(out).toContain('data-revealed="gap-0-down"');
    expect(out).toContain("block six");
    expect(out).toContain("block five");
    expect(out).not.toContain("block four");
  });

  it("drops the seam once nothing is left in the middle", () => {
    const out = buildSnapshotDisplay(sixBlocks, "", {}, [
      { upRev: 9, downRev: 0, expanded: false },
    ]);
    expect(out).toContain("block one");
    expect(out).toContain("block six");
    expect(out).not.toContain("myz-snapshot-tear");
    expect(out).not.toContain("myz-snapshot-fold-hint");
  });

  it("unfolds the whole run when the glyph is clicked", () => {
    const out = buildSnapshotDisplay(sixBlocks, "", {}, [
      { upRev: 1, downRev: 0, expanded: true },
    ]);
    expect(out).not.toContain("myz-snapshot-tear");
    expect(out).toContain('data-revealed="gap-0"');
    expect(out).toContain("block one");
    expect(out).toContain("block six");
  });

  it("escapes text nodes so entities cannot become live markup", () => {
    // The sanitizer keeps `<` as text; re-serializing it raw would decode it
    // into a real tag once the joined string is re-parsed via innerHTML.
    const html = `<article><p>math &lt;img src=x onerror=alert(1)&gt; end</p><p>${mark(
      "rec-1",
      "sharp",
    )}</p></article>`;
    const out = buildSnapshotDisplay(html, "", {}, [
      { upRev: 0, downRev: 0, expanded: true },
    ]);
    expect(out).not.toContain("<img");
    expect(out).toContain("&lt;img");
  });
});

describe("notes as page-margin comment icons", () => {
  it("renders one comment icon per noted record inside its region", () => {
    const html = `<article><p>head</p><p>the ${mark(
      "rec-1",
      "marked",
    )} words</p></article>`;
    const out = buildSnapshotDisplay(html, "", { "rec-1": "一条批注" });
    expect(out).toContain('class="myz-snapshot-note-icons"');
    expect(out).toContain('class="myz-snapshot-note-icon"');
    expect(out).toContain('data-note-for="rec-1"');
    // The note text stays out of the flow; the popover reads it from state.
    expect(out).not.toContain("一条批注");
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
