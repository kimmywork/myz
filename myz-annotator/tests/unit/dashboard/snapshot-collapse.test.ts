// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import {
  buildSnapshotDisplay,
  repaintGap,
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

  it("never splits a figcaption's inline run into blocks", () => {
    // Real markup from thinkingmachines.ai (2026-11-24 bug report): a
    // <figure> whose <figcaption> is pure inline content. The old splitter
    // cut `<i>is</i>` out as its own "block".
    const html = `
      <article>
        <figure><img src="x.png"><figcaption>From the perspective of the
        inference server, it <i>is</i> deterministic.</figcaption></figure>
        <p>the ${mark("rec-1", "marked")} paragraph</p>
      </article>`;
    const out = buildSnapshotDisplay(html);
    // The figure is one unit: the inline run stays whole inside its hint.
    expect(out.match(/myz-snapshot-fold-hint/g) ?? []).toHaveLength(1);
    const hint = out.match(
      /<figure[^>]*class="[^"]*myz-snapshot-fold-hint[^"]*"[^>]*>([\s\S]*?)<\/figure>/,
    );
    expect(hint?.[1]).toContain("<i>is</i>");
    expect(hint?.[1]).toContain("it <i>is</i> deterministic");
  });

  it("keeps a bold lead-in inline within its figcaption unit", () => {
    // Second real case: <figcaption><b>Data Parallel RMSNorm</b> Ideally…
    const html = `
      <article>
        <figure><img src="y.png"><figcaption><b>Data Parallel RMSNorm</b>
        Ideally, we\u2019d like to avoid communication between cores.</figcaption></figure>
        <p>the ${mark("rec-1", "marked")} paragraph</p>
      </article>`;
    const out = buildSnapshotDisplay(html);
    expect(out.match(/myz-snapshot-fold-hint/g) ?? []).toHaveLength(1);
    expect(out).toContain("<b>Data Parallel RMSNorm</b>");
    expect(out.match(/<b>/g)).toHaveLength(1);
  });
});

describe("folded runs unfold from the highlight edges inward", () => {
  const sixBlocks = `
    <article>
      <p>block one</p><p>block two</p><p>block three</p>
      <p>block four</p><p>block five</p><p>block six</p>
      <p>the ${mark("rec-1", "marked")} paragraph</p>
    </article>`;

  /**
   * Hidden blocks stay in the DOM (`display: none`) so a reveal repaints in
   * place — 「不在布局里」 is asserted as data-myz-hidden, not as absence
   * (2026-11-24 抖动修复).
   */
  const hiddenTexts = (html: string): string[] => {
    const root = document.createElement("div");
    root.innerHTML = html;
    return Array.from(root.querySelectorAll("[data-myz-hidden]")).map(
      (node) => node.textContent ?? "",
    );
  };
  const visibleTexts = (html: string): string[] => {
    const root = document.createElement("div");
    root.innerHTML = html;
    return Array.from(
      root.querySelectorAll(".myz-snapshot-revealed, .myz-snapshot-fold-hint"),
    ).map((node) => node.textContent ?? "");
  };

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
    expect(hiddenTexts(out)).toEqual([
      "block two",
      "block three",
      "block four",
      "block five",
    ]);
  });

  it("unfolds upward from the upper highlight, one block at a time", () => {
    const out = buildSnapshotDisplay(sixBlocks, "", {}, [
      { upRev: 1, downRev: 0, expanded: false },
    ]);
    expect(out).toContain('data-revealed="gap-0-up"');
    expect(out).toContain("block one");
    // The hint advances to the next hidden block on that side.
    expect(visibleTexts(out)).toContain("block two");
    expect(hiddenTexts(out)).not.toContain("block two");
    expect(hiddenTexts(out)).toContain("block three");
  });

  it("unfolds downward from the lower highlight, one block at a time", () => {
    const out = buildSnapshotDisplay(sixBlocks, "", {}, [
      { upRev: 0, downRev: 1, expanded: false },
    ]);
    expect(out).toContain('data-revealed="gap-0-down"');
    expect(out).toContain("block six");
    expect(visibleTexts(out)).toContain("block five");
    expect(hiddenTexts(out)).toContain("block four");
  });

  it("drops the seam once nothing is left in the middle", () => {
    const out = buildSnapshotDisplay(sixBlocks, "", {}, [
      { upRev: 9, downRev: 0, expanded: false },
    ]);
    expect(out).toContain("block one");
    expect(out).toContain("block six");
    expect(out).not.toContain("myz-snapshot-tear");
    expect(out).not.toContain("myz-snapshot-fold-hint");
    expect(hiddenTexts(out)).toEqual([]);
  });

  it("unfolds the whole run when the glyph is clicked", () => {
    const out = buildSnapshotDisplay(sixBlocks, "", {}, [
      { upRev: 1, downRev: 0, expanded: true },
    ]);
    expect(out).not.toContain("myz-snapshot-tear");
    expect(out).toContain('data-revealed="gap-0"');
    expect(out).toContain("block one");
    expect(out).toContain("block six");
    expect(hiddenTexts(out)).toEqual([]);
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

  it("escapes quotes in the note anchor attribute", () => {
    // The record id lands inside a double-quoted attribute; a quote must not
    // be able to close it and add attributes (CodeRabbit #136). The id is set
    // through the DOM so it survives parsing (a raw quote would break the
    // template attribute before escaping could matter).
    const id = 'rec" onclick="alert(1)';
    const source = document.createElement("div");
    source.innerHTML = `<article><p>the <mark data-myz-anchor="">marked</mark> words</p></article>`;
    source.querySelector("mark")!.setAttribute("data-myz-anchor", id);

    const out = buildSnapshotDisplay(source.innerHTML, "", { [id]: "note" });
    expect(out).not.toContain(`data-note-for="${id}"`);
    // The attribute must round-trip: parse the markup and read the icon back,
    // otherwise a renderer that simply omitted the icon would pass too
    // (CodeRabbit #136).
    const holder = document.createElement("div");
    holder.innerHTML = out;
    const icon = holder.querySelector(".myz-snapshot-note-icon");
    expect(icon).not.toBeNull();
    expect(icon?.getAttribute("data-note-for")).toBe(id);
  });

  it("treats only the reader's own note keys", () => {
    // A record id like `constructor` must not resolve through the prototype.
    const html = `<article><p>the ${mark(
      "constructor",
      "marked",
    )} words</p></article>`;
    const out = buildSnapshotDisplay(html);
    expect(out).not.toContain("myz-snapshot-note-icon");
  });

  it("renders the note for an id like __proto__", () => {
    // The note map is null-prototype at the view layer, so this id is an own
    // key and its icon must appear (CodeRabbit #136).
    const id = "__proto__";
    const source = document.createElement("div");
    source.innerHTML = `<article><p>the <mark data-myz-anchor="">marked</mark> words</p></article>`;
    source.querySelector("mark")!.setAttribute("data-myz-anchor", id);
    const notes: Record<string, string> = Object.create(null);
    notes[id] = "proto note";

    const holder = document.createElement("div");
    holder.innerHTML = buildSnapshotDisplay(source.innerHTML, "", notes);
    expect(
      holder
        .querySelector(".myz-snapshot-note-icon")
        ?.getAttribute("data-note-for"),
    ).toBe(id);
  });
});

describe("region anchors", () => {
  it("numbers regions before painting a gap's lower anchor", () => {
    // The lower anchor is the NEXT region; numbering must happen first or
    // every `data-down-region` would read -1 (CodeRabbit #136).
    const html = `<article><p>before</p><p>the ${mark(
      "rec-1",
      "marked",
    )} one</p><p>after</p></article>`;
    const out = buildSnapshotDisplay(html);
    expect(out).toContain('data-region="0"');
    // The run above the region knows its lower anchor.
    expect(out).toContain('data-down-region="0"');
    // The run after the only region has none.
    expect(out).toContain('data-down-region="-1"');
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

describe("repaintGap repaints in place (no rebuild — no jitter)", () => {
  const fixture = `
    <article>
      <p>block one</p><p>block two</p><p>block three</p>
      <p>the ${mark("rec-1", "marked")} paragraph</p>
    </article>`;

  function mount(): HTMLElement {
    const root = document.createElement("div");
    root.innerHTML = buildSnapshotDisplay(fixture);
    return root;
  }

  it("keeps every existing node identical across a reveal", () => {
    const root = mount();
    const before = Array.from(root.querySelectorAll("[data-myz-run]"));
    expect(before.length).toBe(3);
    repaintGap(root, 0, { upRev: 1, downRev: 0, expanded: false });
    const after = Array.from(root.querySelectorAll("[data-myz-run]"));
    // Same nodes, same order — the reveal only swapped classes on them.
    expect(after.length).toBe(before.length);
    after.forEach((node, index) => expect(node).toBe(before[index]));
  });

  it("marks only newly-appeared blocks with the entrance fade", () => {
    const root = mount();
    // Initial build: hidden blocks carry no entrance mark (nothing "appeared").
    expect(root.querySelector("[data-myz-fresh]")).toBeNull();
    repaintGap(root, 0, { upRev: 1, downRev: 0, expanded: false });
    // The block that just left the fold gets the fade; the already-visible
    // hint-turned-revealed block does not (its transition is the motion).
    const fresh = Array.from(root.querySelectorAll("[data-myz-fresh]"));
    expect(fresh.length).toBe(1);
    expect(fresh[0].textContent).toContain("block two");
  });

  it("advances the hint and keeps the seam while hidden blocks remain", () => {
    const root = mount();
    repaintGap(root, 0, { upRev: 1, downRev: 0, expanded: false });
    const hints = Array.from(root.querySelectorAll(".myz-snapshot-fold-hint"));
    // Pool of 2 after the reveal → a hint at each edge, seam between.
    expect(hints.map((node) => node.textContent)).toEqual([
      "block two",
      "block three",
    ]);
    expect(root.querySelectorAll(".myz-snapshot-tear").length).toBe(1);
  });

  it("gives a source title back after the block stops being a hint", () => {
    // A hint borrows `title`/`role`/`tabindex`; a block that already carried
    // its own credit must get it back on reveal (CodeRabbit #136).
    const root = document.createElement("div");
    root.innerHTML = buildSnapshotDisplay(`
      <article>
        <p title="Image credit">photo caption</p>
        <p>the ${mark("rec-1", "marked")} paragraph</p>
      </article>`);
    const hint = root.querySelector<HTMLElement>(".myz-snapshot-fold-hint");
    expect(hint?.getAttribute("title")).toBe("向上展开一段");

    repaintGap(root, 0, { upRev: 1, downRev: 0, expanded: false });
    expect(hint?.getAttribute("title")).toBe("Image credit");
    expect(hint?.hasAttribute("role")).toBe(false);
    expect(hint?.hasAttribute("tabindex")).toBe(false);
    expect(hint?.hasAttribute("aria-label")).toBe(false);
  });

  it("removes borrowed attributes when the source had none", () => {
    const root = mount();
    repaintGap(root, 0, { upRev: 1, downRev: 0, expanded: false });
    const revealed = root.querySelector('[data-revealed="gap-0-up"]')!;
    expect(revealed.hasAttribute("title")).toBe(false);
    expect(revealed.hasAttribute("role")).toBe(false);
  });
});
