// @vitest-environment node
import { describe, expect, it } from "vitest";
import { readerKindOf } from "@/dashboard/utils/open-reader";

describe("readerKindOf", () => {
  it("recognizes the two viewer entrypoints", () => {
    expect(
      readerKindOf(
        "chrome-extension://id/src/pdf/pdf-viewer.html?fp=abc&page=2",
      ),
    ).toBe("pdf");
    expect(
      readerKindOf("chrome-extension://id/src/epub/epub-viewer.html?fp=abc"),
    ).toBe("epub");
  });

  it("ignores viewer-looking text inside the source query", () => {
    // A web PDF whose own URL mentions the epub viewer must stay a PDF.
    const target =
      "chrome-extension://id/src/pdf/pdf-viewer.html?url=https%3A%2F%2Fexample.org%2Fepub-viewer-notes.pdf";
    expect(readerKindOf(target)).toBe("pdf");
  });
});
