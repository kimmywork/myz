// @vitest-environment jsdom
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildSnapshotBody,
  byteLength,
  containerAround,
  extractSnapshot,
  findSnapshotRoot,
  recordNeedles,
} from "@/content/snapshot/extract";
import { SNAPSHOT_CSS } from "@/content/snapshot/style";

function loadFixture(name: string): Document {
  const file = path.join(process.cwd(), "tests", "fixtures", name);
  const html = fs.readFileSync(file, "utf8");
  return new DOMParser().parseFromString(html, "text/html");
}

describe("snapshot extraction", () => {
  it("keeps the article text and drops scripts, media and site CSS", () => {
    const doc = loadFixture("article-page.html");
    const snapshot = extractSnapshot(doc, "https://example.com/article", {
      mode: "full",
    })!;

    expect(snapshot.html).toContain("<p");
    expect(snapshot.html).not.toContain("<script");
    expect(snapshot.html).not.toContain("<img");
    expect(snapshot.html).not.toContain("<style");
    expect(snapshot.html).not.toContain("class=");
    expect(snapshot.html).not.toContain("id=");
    // The shared stylesheet, not the page's.
    expect(snapshot.css).toBe(SNAPSHOT_CSS);
    expect(snapshot.bytes).toBe(
      byteLength(snapshot.html) + byteLength(SNAPSHOT_CSS),
    );
  });

  it("keeps the text of a long code article", () => {
    const doc = loadFixture("zen-code.html");
    const snapshot = extractSnapshot(doc, "https://example.com/code", {
      mode: "full",
    })!;
    expect(snapshot.html).toContain("<pre");
    expect(snapshot.bytes).toBeGreaterThan(0);
  });

  it("uses the site rule container when one matches", () => {
    const doc = loadFixture("article-mapped.html");
    const url = "https://example.com/article-mapped.html";
    const root = findSnapshotRoot(doc, url);
    // The fixture's rule points at #special-article.
    expect(root.id).toBe("special-article");
  });

  it("never returns an empty body for a normal page", () => {
    const doc = loadFixture("complex-highlight-test.html");
    const snapshot = extractSnapshot(doc, "https://example.com/x", {
      mode: "full",
    })!;
    expect(snapshot.html.length).toBeGreaterThan(20);
    expect(snapshot.title).toBeTruthy();
  });

  it("finds the block that holds the record's text", () => {
    const doc = loadFixture("article-page.html");
    const firstParagraph = doc.querySelector("p")?.textContent || "";
    expect(firstParagraph.trim().length).toBeGreaterThan(8);

    const container = containerAround(doc, firstParagraph);
    expect(container).not.toBeNull();
    expect(container?.textContent).toContain(firstParagraph.slice(0, 20));
  });

  it("returns null when the anchor text is too short or absent", () => {
    const doc = loadFixture("article-page.html");
    expect(containerAround(doc, undefined)).toBeNull();
    expect(containerAround(doc, "ab")).toBeNull();
    expect(containerAround(doc, "text-that-is-not-on-the-page")).toBeNull();
  });

  it("drops empty wrappers left behind after cleaning", () => {
    const doc = new DOMParser().parseFromString(
      `<html><body><article><p>keep me</p><div><span> </span></div></article></body></html>`,
      "text/html",
    );
    const root = doc.querySelector("article")!;
    const snapshot = buildSnapshotBody(root, doc, "https://example.com/x");
    expect(snapshot.html).toContain("keep me");
    expect(snapshot.html).not.toContain("<div><span>");
  });

  it("captures the whole body in full mode, whatever the anchor", () => {
    // Long enough that the extractor picks <article> rather than <body>.
    const padding = "padding sentence to make this a real article body. ";
    const html = `<html><body><article>
      <p>${padding.repeat(3)}far away paragraph</p>
      <p>${padding.repeat(2)}the paragraph that holds the record</p>
      <p>${padding.repeat(3)}another far paragraph</p>
    </article></body></html>`;
    const doc = new DOMParser().parseFromString(html, "text/html");

    const full = extractSnapshot(doc, "https://example.com/a", {
      mode: "full",
    })!;
    expect(full.html).toContain("far away paragraph");
    expect(full.html).toContain("another far paragraph");
    // The display folds this down; the copy itself is complete (2026-11-23).
  });

  it("windows around the anchor on endless surfaces", () => {
    const padding = "padding sentence to make this a real article body. ";
    const html = `<html><body><article>
      <p>${padding.repeat(3)}far away paragraph</p>
      <div>promo</div><div>promo</div><div>promo</div>
      <p>${padding.repeat(2)}the paragraph that holds the record</p>
      <div>promo</div><div>promo</div><div>promo</div>
      <p>${padding.repeat(3)}another far paragraph</p>
    </article></body></html>`;
    const doc = new DOMParser().parseFromString(html, "text/html");

    const wide = extractSnapshot(doc, "https://example.com/a", {
      mode: "full",
    })!;
    const narrow = extractSnapshot(doc, "https://example.com/a", {
      mode: "windowed",
      anchorText: "the paragraph that holds the record",
      recordTexts: ["the paragraph that holds the record"],
    })!;

    expect(wide.html).toContain("far away paragraph");
    expect(wide.html).toContain("another far paragraph");
    // Three record-less siblings in a row end the window (§3.4 stop rule).
    expect(narrow.html).toContain("the paragraph that holds the record");
    expect(narrow.html).not.toContain("far away paragraph");
    expect(narrow.html).not.toContain("another far paragraph");
    expect(narrow.bytes).toBeLessThan(wide.bytes);
  });

  it("extends the window through neighbouring records", () => {
    const padding = "padding sentence to make this a real article body. ";
    const html = `<html><body><article>
      <p>${padding.repeat(2)}first record paragraph</p>
      <p>${padding.repeat(2)}middle filler paragraph</p>
      <p>${padding.repeat(2)}second record paragraph</p>
      <p>${padding.repeat(2)}tail filler one</p>
      <p>${padding.repeat(2)}tail filler two</p>
      <p>${padding.repeat(2)}unrelated tail paragraph</p>
    </article></body></html>`;
    const doc = new DOMParser().parseFromString(html, "text/html");

    const windowed = extractSnapshot(doc, "https://example.com/a", {
      mode: "windowed",
      anchorText: "first record paragraph",
      recordTexts: ["first record paragraph", "second record paragraph"],
    })!;
    // The neighbour's hit resets the run, so both records land in one window;
    // past the last record the run rule keeps a little air (two elements) and
    // stops at the third (§3.4: N consecutive record-less elements end it).
    expect(windowed.html).toContain("first record paragraph");
    expect(windowed.html).toContain("second record paragraph");
    expect(windowed.html).toContain("tail filler one");
    expect(windowed.html).not.toContain("unrelated tail paragraph");
  });

  it("returns null in windowed mode when the anchor cannot be placed", () => {
    // Never fall back to "capture everything": that is how a feed would be
    // stored whole behind the user's back.
    const doc = loadFixture("article-page.html");
    const missing = extractSnapshot(doc, "https://example.com/x", {
      mode: "windowed",
      anchorText: "text that is not on this page",
    });
    expect(missing).toBeNull();
  });

  it("normalizes record needles the same way the window compares", () => {
    expect(recordNeedles(["  alpha   beta  ", undefined, "ab"])).toEqual([
      "alpha beta",
    ]);
  });

  it("finds an anchor that spans inline markup", () => {
    const padding = "padding sentence to make this a real article body. ";
    const doc = new DOMParser().parseFromString(
      `<html><body><article>
        <p>${padding.repeat(3)}</p>
        <p>alpha <em>beta</em> gamma</p>
        <p>${padding.repeat(3)}</p>
      </article></body></html>`,
      "text/html",
    );

    // The quote lives in three text nodes; a node-by-node search misses it.
    const container = containerAround(doc, "alpha beta gamma");
    expect(container).not.toBeNull();
    expect(container?.tagName).toBe("P");
  });
});
