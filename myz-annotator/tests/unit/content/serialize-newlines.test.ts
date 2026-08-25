import { renderMarkdown } from "@myz/shared/markdownRenderer";
import { beforeEach, describe, expect, it } from "vitest";
import { serializeRangeToHtml } from "../../../src/content/html";
import { htmlToMarkdown } from "../../../src/content/utils/htmlToMarkdown";

// Runs under vitest's jsdom environment (see vitest.config.js), so `document`,
// `getComputedStyle`, `DOMParser`, `TreeWalker` are all available globally
// without manually wiring a JSDOM instance. Each test resets document.body.
function selectAll(selector: string): Range {
  const el = document.querySelector(selector) as Element;
  const range = document.createRange();
  range.selectNodeContents(el);
  return range;
}

function selectPartial(
  selector: string,
  startOffset: number,
  endOffset: number,
): Range {
  const el = document.querySelector(selector) as Element;
  const text = el.firstChild as Text;
  const range = document.createRange();
  range.setStart(text, startOffset);
  range.setEnd(text, endOffset);
  return range;
}

describe("serializeRangeToHtml + htmlToMarkdown — soft newlines", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("preserves newlines under white-space: pre-wrap spans", () => {
    document.body.innerHTML =
      '<div class="content"><span style="white-space:pre-wrap">Line1\nLine2\nLine3</span></div>';
    const captured = serializeRangeToHtml(selectAll(".content span"));
    // The two soft newlines must survive as <br>, not be collapsed.
    expect(captured).toContain("<br>");
    expect(captured.match(/<br>/g)!.length).toBe(2);

    const md = htmlToMarkdown(captured);
    expect(md.split("\n").length).toBe(3);
    expect(md).toContain("Line1");
    expect(md).toContain("Line2");
    expect(md).toContain("Line3");
  });

  it("preserves blank lines (\\n\\n) under pre-wrap", () => {
    document.body.innerHTML =
      '<div class="content"><span style="white-space:pre-wrap">Para one\n\nPara two</span></div>';
    const captured = serializeRangeToHtml(selectAll(".content span"));
    // "Para one\n\nPara two" splits into ["Para one", "", "Para two"]: two
    // <br> separators (the empty middle segment carries no text node, but
    // the two <br> still render as a blank line downstream).
    expect(captured.match(/<br>/g)!.length).toBe(2);

    const md = htmlToMarkdown(captured);
    expect(md).toMatch(/Para one/);
    expect(md).toMatch(/Para two/);
    expect(md.split("\n").length).toBeGreaterThanOrEqual(3);
  });

  it("does NOT insert <br> for white-space: normal containers", () => {
    document.body.innerHTML =
      '<div class="content"><span>Soft wrap in source\nshould collapse</span></div>';
    const captured = serializeRangeToHtml(selectAll(".content span"));
    expect(captured).not.toContain("<br>");
  });

  it("preserves newlines under pre-line", () => {
    document.body.innerHTML =
      '<div class="content"><p style="white-space:pre-line">A\nB</p></div>';
    const captured = serializeRangeToHtml(selectAll(".content p"));
    expect(captured).toContain("<br>");
  });

  it("leaves <pre>/<code> newlines untouched (no <br> injection)", () => {
    document.body.innerHTML =
      '<div class="content"><pre><code>line1\nline2\nline3</code></pre></div>';
    const captured = serializeRangeToHtml(selectAll(".content pre"));
    expect(captured).not.toContain("<br>");
    expect(captured).toContain("line1");
  });

  it("handles partial selections that start/end mid text-node under pre-wrap", () => {
    document.body.innerHTML =
      '<div class="content"><span style="white-space:pre-wrap">AAAA\nBBBB\nCCCC</span></div>';
    // Slice "AA\nBBBB\nC" (offsets 2..11) has 2 newlines -> 2 <br>.
    const captured = serializeRangeToHtml(
      selectPartial(".content span", 2, 11),
    );
    expect(captured.match(/<br>/g)?.length ?? 0).toBe(2);
  });

  it("keeps multiple <p> block separation intact (regression)", () => {
    document.body.innerHTML =
      '<div class="content"><p>First para.</p><p>Second para.</p></div>';
    const captured = serializeRangeToHtml(selectAll(".content"));
    const md = htmlToMarkdown(captured);
    expect(md).toContain("First para.");
    expect(md).toContain("Second para.");
    // Block-level separation must remain a blank line between paragraphs.
    expect(md).toMatch(/First para\.\n\nSecond para\./);
  });

  it("end-to-end: rendered HTML for a multi-line paste is not a single blob", () => {
    const body =
      "Thoughts About Scaling Law\n\nScaling, but not only of parameters.\nEvery model release now ends.";
    document.body.innerHTML = `<div class="content"><span style="white-space:pre-wrap">${body}</span></div>`;
    const captured = serializeRangeToHtml(selectAll(".content span"));
    const md = htmlToMarkdown(captured);
    // Before the fix this was a single line; now the segments must land on
    // separate lines so renderMarkdown (breaks:true) produces <br>/<p>.
    expect(md.split("\n").length).toBeGreaterThan(3);
    const rendered = renderMarkdown(md);
    // Rendered HTML must contain line/paragraph breaks, not a single run.
    expect(rendered).toContain("<br");
  });
});
