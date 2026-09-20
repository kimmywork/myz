import { strToU8 } from "fflate";
import { describe, expect, it } from "vitest";
import type { EpubBook, EpubSpineItem } from "../../../src/epub/parse";
import {
  buildSpineHtml,
  resolveAssetPath,
  type ReadTokens,
} from "../../../src/epub/render";

const TOKENS: ReadTokens = {
  bg: "#ffffff",
  text: "#111111",
  muted: "#666666",
  line: "#dddddd",
  accent: "#123456",
  read: "serif",
  readSize: "18px",
  readLeading: "1.8",
  readTracking: "0.01em",
  readMeasure: "38em",
  readGutter: "24px",
};

function makeBook(chapterSource: string): EpubBook {
  return {
    opfPath: "OEBPS/content.opf",
    opfDir: "OEBPS",
    metadata: {
      title: "t",
      author: "",
      language: "en",
      identifier: "",
      publisher: "",
      spineCount: 1,
    },
    manifest: [],
    spine: [{ idref: "c1", href: "OEBPS/Text/chapter-1.xhtml", linear: true }],
    toc: [],
    coverPath: null,
    files: new Map([["OEBPS/Text/chapter-1.xhtml", strToU8(chapterSource)]]),
  };
}

const SPINE_ITEM: EpubSpineItem = {
  idref: "c1",
  href: "OEBPS/Text/chapter-1.xhtml",
  linear: true,
};

describe("resolveAssetPath", () => {
  it("resolves relative paths against the document directory", () => {
    expect(resolveAssetPath("OEBPS/Text", "../Images/c.png")).toBe(
      "OEBPS/Images/c.png",
    );
  });

  it("treats a leading slash as archive root, matching parse.resolveHref", () => {
    expect(resolveAssetPath("OEBPS/Text", "/Images/c.png")).toBe(
      "Images/c.png",
    );
  });
});

describe("buildSpineHtml", () => {
  it("falls back to HTML parsing for malformed XHTML", () => {
    // `&nbsp;` is not defined in XML, so the XHTML parse yields a parsererror
    // document; the reader must still render the chapter.
    const html = buildSpineHtml(
      makeBook(
        `<?xml version="1.0"?><html xmlns="http://www.w3.org/1999/xhtml"><body><p>Hello&nbsp;world</p></body></html>`,
      ),
      SPINE_ITEM,
      TOKENS,
      new Map(),
    );
    expect(html).not.toContain("parsererror");
    expect(html).toContain("Hello");
  });

  it("renders well-formed XHTML as-is", () => {
    const html = buildSpineHtml(
      makeBook(
        `<?xml version="1.0"?><html xmlns="http://www.w3.org/1999/xhtml"><body><p>Fine</p></body></html>`,
      ),
      SPINE_ITEM,
      TOKENS,
      new Map(),
    );
    expect(html).toContain("Fine");
  });
});
