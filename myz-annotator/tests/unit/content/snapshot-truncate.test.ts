// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import {
  SNAPSHOT_CONTEXT_BLOCKS,
  hitsRecord,
  recordSpan,
  spanAround,
} from "@/content/snapshot/truncate";

/** Builds `<article>` with one child per entry; `null` = promo block. */
function page(children: Array<string | null>): Document {
  const html = children
    .map((text, index) =>
      text === null
        ? `<div class="promo" data-slot="${index}">promo</div>`
        : `<p data-slot="${index}">${text}</p>`,
    )
    .join("");
  return new DOMParser().parseFromString(
    `<html><body><article>${html}</article></body></html>`,
    "text/html",
  );
}

function slotIn(clone: Element): number[] {
  return Array.from(clone.children).map((child) =>
    Number(child.getAttribute("data-slot")),
  );
}

describe("snapshot span", () => {
  it("covers the record plus the context blocks on each side", () => {
    const doc = page([
      "far away paragraph", // 0
      null, // 1
      null, // 2
      null, // 3
      "middle paragraph that holds the record", // 4
      null, // 5
      null, // 6
      null, // 7
      "another far paragraph", // 8
    ]);
    const root = doc.querySelector("article")!;

    const clone = spanAround(root, ["middle paragraph that holds the record"]);
    // The record ± two context blocks: the far paragraphs stay out.
    expect(slotIn(clone)).toEqual([2, 3, 4, 5, 6]);
  });

  it("is one contiguous region covering every record", () => {
    // 划线之间的内容全在 span 里（显示端折叠它们），两块划线之外的噪音
    // 被 span 挡住——没有 run 计数，首末命中即边界。
    const doc = page([
      "first record paragraph", // 0
      "middle filler paragraph", // 1
      "second record paragraph", // 2
      "tail filler one", // 3
      "tail filler two", // 4
      "unrelated tail paragraph", // 5
    ]);
    const root = doc.querySelector("article")!;

    const clone = spanAround(root, [
      "first record paragraph",
      "second record paragraph",
    ]);
    expect(slotIn(clone)).toEqual([0, 1, 2, 3, 4]);
  });

  it("falls back to the whole container when nothing hits", () => {
    // 没有可锚定的划线时「足够完整」优先：整根兜底，尺寸上限是极端情况的
    // 兜底。
    const doc = page(["one paragraph", null, "two paragraph"]);
    const root = doc.querySelector("article")!;

    expect(slotIn(spanAround(root, ["text that is not on the page"]))).toEqual([
      0, 1, 2,
    ]);
  });

  it("keeps direct text nodes of the container inside the span", () => {
    // An article can hold bare text next to its blocks: `<article>Opening
    // text<p>…</p></article>`. Slicing `children` would drop those sentences.
    const doc = new DOMParser().parseFromString(
      `<html><body><article>Opening sentence<p id="anchor">the record lives here</p>Closing sentence</article></body></html>`,
      "text/html",
    );
    const root = doc.querySelector("article")!;

    const clone = spanAround(root, ["the record lives here"]);
    expect(clone.textContent).toContain("Opening sentence");
    expect(clone.textContent).toContain("the record lives here");
    expect(clone.textContent).toContain("Closing sentence");
  });

  it("reports the hit span before the context extension", () => {
    const doc = page(Array.from({ length: 10 }, (_, i) => `p${i}`));
    const root = doc.querySelector("article")!;

    expect(recordSpan(root, ["p3", "p7"])).toEqual({ first: 1, last: 9 });
  });

  it("documents the context constant", () => {
    expect(SNAPSHOT_CONTEXT_BLOCKS).toBe(2);
  });

  it("hits only elements carrying one of the record texts", () => {
    const doc = new DOMParser().parseFromString(
      `<html><body>
        <div id="quoted">${"word ".repeat(2)}the recorded sentence here</div>
        <div id="other">promo</div>
        <p id="empty"></p>
      </body></html>`,
      "text/html",
    );
    const needles = ["the recorded sentence here"];
    expect(hitsRecord(doc.querySelector("#quoted")!, needles)).toBe(true);
    expect(hitsRecord(doc.querySelector("#other")!, needles)).toBe(false);
    expect(hitsRecord(doc.querySelector("#empty")!, needles)).toBe(false);
  });
});
