import { strToU8, zipSync } from "fflate";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  parseEpub,
  parseEpubMetadata,
  sanitizeEpubXhtml,
} from "../../../src/epub/parse";

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
}

const CONTAINER = `<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`;

const OPF = `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="id">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title>示例书</dc:title>
    <dc:creator>某作者</dc:creator>
    <dc:language>zh-CN</dc:language>
    <dc:identifier>urn:isbn:123</dc:identifier>
    <dc:publisher>某社</dc:publisher>
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
    <item id="c1" href="chapter1.xhtml" media-type="application/xhtml+xml"/>
    <item id="c2" href="chapter2.xhtml" media-type="application/xhtml+xml"/>
    <item id="css" href="styles/main.css" media-type="text/css"/>
    <item id="cover" href="images/cover.png" media-type="image/png" properties="cover-image"/>
  </manifest>
  <spine toc="ncx">
    <itemref idref="c1"/>
    <itemref idref="c2"/>
  </spine>
</package>`;

const NAV = `<?xml version="1.0"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
  <head><title>toc</title></head>
  <body>
    <nav epub:type="toc">
      <ol>
        <li><a href="chapter1.xhtml">第一章</a>
          <ol><li><a href="chapter1.xhtml#s1">第一节</a></li></ol>
        </li>
        <li><a href="chapter2.xhtml">第二章</a></li>
      </ol>
    </nav>
  </body>
</html>`;

const NCX = `<?xml version="1.0"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/">
  <navMap>
    <navPoint><navLabel><text>甲</text></navLabel><content src="chapter1.xhtml"/>
      <navPoint><navLabel><text>甲一</text></navLabel><content src="chapter1.xhtml#a"/></navPoint>
    </navPoint>
  </navMap>
</ncx>`;

const CHAPTER_WITH_SCRIPT = `<?xml version="1.0"?>
<html xmlns="http://www.w3.org/1999/xhtml">
  <head><title>c1</title></head>
  <body>
    <p onclick="steal()">正文</p>
    <script>alert(1)</script>
    <a href="javascript:bad()">链接</a>
    <img src="images/cover.png"/>
  </body>
</html>`;

function makeEpub(overrides: Record<string, Uint8Array | null> = {}) {
  const files: Record<string, Uint8Array> = {
    mimetype: strToU8("application/epub+zip"),
    "META-INF/container.xml": strToU8(CONTAINER),
    "OEBPS/content.opf": strToU8(OPF),
    "OEBPS/nav.xhtml": strToU8(NAV),
    "OEBPS/toc.ncx": strToU8(NCX),
    "OEBPS/chapter1.xhtml": strToU8(CHAPTER_WITH_SCRIPT),
    "OEBPS/chapter2.xhtml": strToU8(
      `<?xml version="1.0"?><html><body><p>two</p></body></html>`,
    ),
    "OEBPS/styles/main.css": strToU8("body{}"),
    "OEBPS/images/cover.png": new Uint8Array([1, 2, 3, 4]),
  };
  for (const [key, value] of Object.entries(overrides)) {
    if (value === null) {
      delete files[key];
    } else {
      files[key] = value;
    }
  }
  return toArrayBuffer(zipSync(files));
}

describe("parseEpub", () => {
  it("reads metadata and spine", () => {
    const book = parseEpub(makeEpub());
    expect(book.metadata.title).toBe("示例书");
    expect(book.metadata.author).toBe("某作者");
    expect(book.metadata.language).toBe("zh-CN");
    expect(book.metadata.identifier).toBe("urn:isbn:123");
    expect(book.metadata.publisher).toBe("某社");
    expect(book.spine.map((item) => item.href)).toEqual([
      "OEBPS/chapter1.xhtml",
      "OEBPS/chapter2.xhtml",
    ]);
    expect(book.spine.every((item) => item.linear)).toBe(true);
  });

  it("builds a nested table of contents from the EPUB3 nav", () => {
    const book = parseEpub(makeEpub());
    expect(book.toc).toHaveLength(2);
    expect(book.toc[0].label).toBe("第一章");
    expect(book.toc[0].href).toBe("OEBPS/chapter1.xhtml");
    expect(book.toc[0].depth).toBe(0);
    expect(book.toc[0].children).toHaveLength(1);
    expect(book.toc[0].children[0].label).toBe("第一节");
    expect(book.toc[0].children[0].href).toBe("OEBPS/chapter1.xhtml#s1");
    expect(book.toc[0].children[0].depth).toBe(1);
  });

  it("detects the cover and exposes resources by path", () => {
    const book = parseEpub(makeEpub());
    expect(book.coverPath).toBe("OEBPS/images/cover.png");
    expect(book.files.has("OEBPS/chapter1.xhtml")).toBe(true);
    expect(book.files.has("OEBPS/styles/main.css")).toBe(true);
    expect(book.files.get("OEBPS/images/cover.png")?.byteLength).toBe(4);
  });

  it("falls back to the EPUB2 NCX when there is no nav document", () => {
    const book = parseEpub(makeEpub({ "OEBPS/nav.xhtml": null }));
    expect(book.toc).toHaveLength(1);
    expect(book.toc[0].label).toBe("甲");
    expect(book.toc[0].children[0].label).toBe("甲一");
    expect(book.toc[0].children[0].href).toBe("OEBPS/chapter1.xhtml#a");
  });

  it("rejects an archive without container.xml", () => {
    expect(() =>
      parseEpub(makeEpub({ "META-INF/container.xml": null })),
    ).toThrow(/container\.xml/);
  });

  it("keeps parseEpubMetadata as a header-only wrapper", () => {
    const meta = parseEpubMetadata(makeEpub());
    expect(meta.title).toBe("示例书");
    expect(meta.spineCount).toBe(2);
  });
});

describe("parseEpub on a nested NCX fixture", () => {
  const buffer = (() => {
    const bytes = readFileSync(
      path.resolve(process.cwd(), "tests", "fixtures", "epub", "nested.epub"),
    );
    return bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength,
    ) as ArrayBuffer;
  })();

  it("keeps the fragment on nested TOC hrefs", () => {
    const book = parseEpub(buffer);
    expect(book.toc[0].label).toBe("Chapter One");
    expect(book.toc[0].children[0].href).toBe("OEBPS/Text/chapter-1.html#s1");
    expect(book.toc[0].children[0].depth).toBe(1);
  });

  it("keeps the fragment on internal links", () => {
    const book = parseEpub(buffer);
    const chapter = new TextDecoder().decode(
      book.files.get("OEBPS/Text/chapter-1.html"),
    );
    expect(chapter).toContain('href="chapter-2.html#s2"');
  });

  it("detects the cover image and svg cover page", () => {
    const book = parseEpub(buffer);
    expect(book.coverPath).toBe("OEBPS/Images/cover.png");
    const cover = new TextDecoder().decode(
      book.files.get("OEBPS/Text/cover.xhtml"),
    );
    expect(cover).toContain("<image");
  });
});

describe("sanitizeEpubXhtml", () => {
  it("drops scripts, inline handlers and javascript: urls", () => {
    const doc = new DOMParser().parseFromString(
      CHAPTER_WITH_SCRIPT,
      "application/xhtml+xml",
    );
    const clean = sanitizeEpubXhtml(doc);
    expect(clean.querySelector("script")).toBeNull();
    expect(clean.querySelector("[onclick]")).toBeNull();
    expect(clean.querySelector("a")?.getAttribute("href")).toBeNull();
    expect(clean.querySelector("img")?.getAttribute("src")).toBe(
      "images/cover.png",
    );
  });
});
