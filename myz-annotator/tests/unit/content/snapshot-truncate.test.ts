// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import {
  SNAPSHOT_MAX_SIBLINGS_PER_SIDE,
  SNAPSHOT_TRUNCATION_RUN,
  childContaining,
  isProseElement,
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
  it("stops after a run of prose-less siblings", () => {
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

    const clone = truncateAround(root, anchor);
    // Two promos are kept on each side; the third ends the walk without being
    // included, so the far paragraphs never make it in.
    expect(slotIn(clone)).toEqual([2, 3, 4, 5, 6]);
  });

  it("keeps pros prose across a single promo", () => {
    const doc = page([
      "one paragraph",
      null,
      "two paragraph",
      "three paragraph",
    ]);
    const root = doc.querySelector("article")!;
    const anchor = root.querySelector('[data-slot="2"]')!;

    const clone = truncateAround(root, anchor);
    expect(slotIn(clone)).toEqual([0, 1, 2, 3]);
  });

  it("does not stretch to the whole container when every child is prose", () => {
    const doc = page(
      Array.from({ length: 30 }, (_, index) => `paragraph number ${index}`),
    );
    const root = doc.querySelector("article")!;
    const anchor = root.querySelector('[data-slot="15"]')!;

    const { first, last } = siblingWindow(root, anchor, { maxPerSide: 4 });
    expect(first).toBe(11);
    expect(last).toBe(19);
  });

  it("keeps the whole container when there is no anchor", () => {
    const doc = page(["one paragraph", null, "two paragraph"]);
    const root = doc.querySelector("article")!;

    expect(slotIn(truncateAround(root, null))).toEqual([0, 1, 2]);
  });

  it("is bounded per side even with a huge run allowance", () => {
    const doc = page(
      Array.from({ length: 60 }, (_, index) => `paragraph ${index}`),
    );
    const root = doc.querySelector("article")!;
    const anchor = root.querySelector('[data-slot="30"]')!;

    const { first, last } = siblingWindow(root, anchor);
    expect(30 - first).toBeLessThanOrEqual(SNAPSHOT_MAX_SIBLINGS_PER_SIDE);
    expect(last - 30).toBeLessThanOrEqual(SNAPSHOT_MAX_SIBLINGS_PER_SIDE);
  });

  it("treats a long text block as prose, a promo as not", () => {
    const doc = new DOMParser().parseFromString(
      `<html><body>
        <div id="long">${"word ".repeat(20)}</div>
        <div id="short">promo</div>
        <p id="empty"></p>
      </body></html>`,
      "text/html",
    );
    expect(isProseElement(doc.querySelector("#long")!)).toBe(true);
    expect(isProseElement(doc.querySelector("#short")!)).toBe(false);
    expect(isProseElement(doc.querySelector("#empty")!)).toBe(false);
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

    const clone = truncateAround(root, anchor);
    expect(clone.textContent).toContain("Opening sentence");
    expect(clone.textContent).toContain("the record lives here");
    expect(clone.textContent).toContain("Closing sentence");
  });
});
