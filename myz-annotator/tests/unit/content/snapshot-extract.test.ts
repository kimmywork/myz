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
    const snapshot = extractSnapshot(doc, "https://example.com/article", {})!;

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
    const snapshot = extractSnapshot(doc, "https://example.com/code", {})!;
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
    const snapshot = extractSnapshot(doc, "https://example.com/x", {})!;
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

  it("captures the span around the records, not the whole page", () => {
    // 首末划线命中即边界：边界之外的远端段落不进快照（显示端本来就折叠
    // 非划线区，采集不需要为了「可展开」多存整页）。
    const padding = "padding sentence to make this a real article body. ";
    const html = `<html><body><article>
      <p>${padding.repeat(3)}far away paragraph before</p>
      <div>promo</div><div>promo</div>
      <p>${padding.repeat(2)}the paragraph that holds the record</p>
      <p>${padding.repeat(2)}neighbour one</p>
      <p>${padding.repeat(2)}neighbour two</p>
      <div>promo</div><div>promo</div>
      <p>${padding.repeat(3)}far away paragraph after</p>
    </article></body></html>`;
    const doc = new DOMParser().parseFromString(html, "text/html");

    const snapshot = extractSnapshot(doc, "https://example.com/a", {
      anchorText: "the paragraph that holds the record",
      recordTexts: ["the paragraph that holds the record"],
    })!;
    expect(snapshot.html).toContain("the paragraph that holds the record");
    expect(snapshot.html).toContain("neighbour one");
    expect(snapshot.html).toContain("neighbour two");
    expect(snapshot.html).not.toContain("far away paragraph before");
    expect(snapshot.html).not.toContain("far away paragraph after");
  });

  it("keeps one contiguous region covering several records", () => {
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

    const snapshot = extractSnapshot(doc, "https://example.com/a", {
      anchorText: "first record paragraph",
      recordTexts: ["first record paragraph", "second record paragraph"],
    })!;
    // 首末划线命中即边界：两块划线之间的一切都在，边界之外只留两块气垫。
    expect(snapshot.html).toContain("first record paragraph");
    expect(snapshot.html).toContain("second record paragraph");
    expect(snapshot.html).toContain("tail filler one");
    expect(snapshot.html).toContain("tail filler two");
    expect(snapshot.html).not.toContain("unrelated tail paragraph");
  });

  it("falls back to the whole container when no record text lands", () => {
    // 没有可锚定的划线时「足够完整」优先：整根兜底，尺寸上限是极端情况的
    // 兜底。
    const doc = loadFixture("article-page.html");
    const missing = extractSnapshot(doc, "https://example.com/x", {
      anchorText: "text that is not on this page",
      recordTexts: ["also not on this page"],
    })!;
    expect(missing.html.length).toBeGreaterThan(20);
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

describe("highlighted content survives the capture", () => {
  const parse = (html: string): Document =>
    new DOMParser().parseFromString(html, "text/html");

  it("keeps a highlighted title that lives in the article's header", () => {
    // 2026-11-24, engineering.zalando.com: the post title and lead live in the
    // article's own <header>; the chrome drop deleted them wholesale, so the
    // user's highlights were missing from the snapshot.
    const doc = parse(`
      <main><article class="content-post">
        <header class="post-header">
          <h1>Running an Engineering Papers Reading Guild at Zalando</h1>
          <div class="summary"><p>In September 2024, we started an Engineering Papers guild.</p></div>
          <div class="byline"><span>Danilo Veljovic</span></div>
        </header>
        <p>Body paragraph one.</p>
      </article></main>`);
    const snapshot = extractSnapshot(doc, "https://example.com/post", {
      recordTexts: [
        "Running an Engineering Papers Reading Guild at Zalando",
        "In September 2024, we started an Engineering Papers guild.",
      ],
    })!;
    expect(snapshot.html).toContain("<h1>");
    expect(snapshot.html).toContain(
      "In September 2024, we started an Engineering Papers guild.",
    );
    expect(snapshot.html).toContain("Body paragraph one.");
  });

  it("still drops the article header when nothing in it is highlighted", () => {
    const doc = parse(`
      <main><article>
        <header class="post-header"><h1>Standing title</h1></header>
        <p>Body paragraph one.</p>
      </article></main>`);
    const snapshot = extractSnapshot(doc, "https://example.com/post", {})!;
    expect(snapshot.html).not.toContain("<h1>");
    expect(snapshot.html).toContain("Body paragraph one.");
  });

  it("expands the capture root when a highlight lives outside it", () => {
    // A title placed beside the <article> must not be silently missing:
    // the root grows to their common ancestor (never the whole body).
    const doc = parse(`
      <main>
        <header class="post-header"><h1>Standing title</h1></header>
        <article><p>${"Body paragraph. ".repeat(20)}</p></article>
      </main>`);
    const snapshot = extractSnapshot(doc, "https://example.com/post", {
      recordTexts: ["Standing title"],
    })!;
    expect(snapshot.html).toContain("Standing title");
    expect(snapshot.html).toContain("Body paragraph");
  });
});
