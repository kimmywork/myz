// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import {
  SNAPSHOT_MAX_SIBLINGS_PER_SIDE,
  SNAPSHOT_TRUNCATION_RUN,
  childContaining,
  hitsRecord,
  siblingWindow,
  truncateAround,
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

describe("snapshot truncation", () => {
  it("stops after a run of record-less siblings", () => {
    const doc = page([
      "far away paragraph",
      null,
      null,
      null,
      "middle paragraph that holds the record",
      null,
      null,
      null,
      "another far paragraph",
    ]);
    const root = doc.querySelector("article")!;
    const anchor = root.querySelector('[data-slot="4"]')!;
    const needles = ["middle paragraph that holds the record"];

    const clone = truncateAround(root, anchor, needles);
    // Two record-less siblings are kept on each side; the third ends the walk
    // without being included, so the far paragraphs never make it in.
    expect(slotIn(clone)).toEqual([2, 3, 4, 5, 6]);
  });

  it("keeps the neighbours across a single record-less element", () => {
    const doc = page([
      "one paragraph",
      null,
      "two paragraph",
      "three paragraph",
    ]);
    const root = doc.querySelector("article")!;
    const anchor = root.querySelector('[data-slot="2"]')!;

    const clone = truncateAround(root, anchor, ["two paragraph"]);
    expect(slotIn(clone)).toEqual([0, 1, 2, 3]);
  });

  it("extends through every element that hits a record", () => {
    // All elements hit some record: the run never breaks, so only the
    // per-side cap bounds the window.
    const doc = page(
      Array.from({ length: 30 }, (_, index) => `paragraph number ${index}`),
    );
    const root = doc.querySelector("article")!;
    const anchor = root.querySelector('[data-slot="15"]')!;

    const { first, last } = siblingWindow(root, anchor, ["paragraph"], {
      maxPerSide: 4,
    });
    expect(first).toBe(11);
    expect(last).toBe(19);
  });

  it("keeps the whole container when there is no anchor", () => {
    const doc = page(["one paragraph", null, "two paragraph"]);
    const root = doc.querySelector("article")!;

    expect(slotIn(truncateAround(root, null, ["two paragraph"]))).toEqual([
      0, 1, 2,
    ]);
  });

  it("is bounded per side even when every element hits a record", () => {
    const doc = page(
      Array.from({ length: 60 }, (_, index) => `paragraph ${index}`),
    );
    const root = doc.querySelector("article")!;
    const anchor = root.querySelector('[data-slot="30"]')!;

    const { first, last } = siblingWindow(root, anchor, ["paragraph"]);
    expect(30 - first).toBeLessThanOrEqual(SNAPSHOT_MAX_SIBLINGS_PER_SIDE);
    expect(last - 30).toBeLessThanOrEqual(SNAPSHOT_MAX_SIBLINGS_PER_SIDE);
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

  it("resolves the container child that holds a nested anchor", () => {
    const doc = new DOMParser().parseFromString(
      `<html><body><article><section><span><em id="deep">text</em></span></section></article></body></html>`,
      "text/html",
    );
    const root = doc.querySelector("article")!;
    const deep = doc.querySelector("#deep")!;
    expect((childContaining(root, deep) as Element)?.tagName).toBe("SECTION");
    expect(childContaining(root, root)).toBeNull();
  });

  it("documents a run of three", () => {
    expect(SNAPSHOT_TRUNCATION_RUN).toBe(3);
  });

  it("keeps direct text nodes of the container inside the window", () => {
    // An article can hold bare text next to its blocks: `<article>Opening
    // text<p>…</p></article>`. Slicing `children` would drop those sentences.
    const doc = new DOMParser().parseFromString(
      `<html><body><article>Opening sentence<p id="anchor">the record lives here</p>Closing sentence</article></body></html>`,
      "text/html",
    );
    const root = doc.querySelector("article")!;
    const anchor = doc.querySelector("#anchor")!;

    const clone = truncateAround(root, anchor, ["the record lives here"]);
    expect(clone.textContent).toContain("Opening sentence");
    expect(clone.textContent).toContain("the record lives here");
    expect(clone.textContent).toContain("Closing sentence");
  });
});
