import { describe, expect, it } from "vitest";
import { selectionText } from "../../../src/content/ask-ai";

/** Build a range over `html` inside the body. */
function rangeOf(html: string): Range {
  document.body.innerHTML = html;
  const range = document.createRange();
  const container = document.body.firstElementChild;
  if (!container) throw new Error("fixture has no element");
  range.selectNodeContents(container);
  return range;
}

describe("selectionText", () => {
  it("keeps paragraph breaks between block elements", () => {
    const text = selectionText(
      rangeOf("<div><p>Alpha</p><p>Beta</p><p>Gamma</p></div>"),
    );
    expect(text).toBe("Alpha\n\nBeta\n\nGamma");
  });

  it("returns an empty string for a collapsed range", () => {
    document.body.innerHTML = "<p>Ignore me</p>";
    const range = document.createRange();
    range.setStart(document.body, 0);
    range.setEnd(document.body, 0);
    expect(selectionText(range)).toBe("");
  });
});
