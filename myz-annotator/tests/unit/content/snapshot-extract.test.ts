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
    const snapshot = extractSnapshot(doc, "https://example.com/article");

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
    const snapshot = extractSnapshot(doc, "https://example.com/code");
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
    const snapshot = extractSnapshot(doc, "https://example.com/x");
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

  it("windows around the anchor instead of taking the whole container", () => {
    // Long enough that the extractor picks <article> rather than <body>.
    const padding = "padding sentence to make this a real article body. ";
    const html = `<html><body><article>
      <p>${padding.repeat(3)}far away paragraph</p>
      <div>promo</div><div>promo</div><div>promo</div>
      <p>${padding.repeat(2)}the paragraph that holds the record</p>
      <div>promo</div><div>promo</div><div>promo</div>
      <p>${padding.repeat(3)}another far paragraph</p>
    </article></body></html>`;
    const doc = new DOMParser().parseFromString(html, "text/html");

    const wide = extractSnapshot(doc, "https://example.com/a");
    const narrow = extractSnapshot(
      doc,
      "https://example.com/a",
      "the paragraph that holds the record",
    );

    expect(wide.html).toContain("far away paragraph");
    expect(wide.html).toContain("another far paragraph");
    // With an anchor the far paragraphs fall outside the window.
    expect(narrow.html).toContain("the paragraph that holds the record");
    expect(narrow.html).not.toContain("far away paragraph");
    expect(narrow.html).not.toContain("another far paragraph");
    expect(narrow.bytes).toBeLessThan(wide.bytes);
  });

  it("falls back to the whole container when the anchor text is absent", () => {
    const doc = loadFixture("article-page.html");
    const withUnknownAnchor = extractSnapshot(
      doc,
      "https://example.com/x",
      "text that is not on this page",
    );
    const plain = extractSnapshot(doc, "https://example.com/x");
    expect(withUnknownAnchor.html).toBe(plain.html);
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
