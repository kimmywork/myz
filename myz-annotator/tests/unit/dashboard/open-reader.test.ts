// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Router } from "vue-router";

const preparePdf = vi.fn();
const prepareEpub = vi.fn();

vi.mock("@/reader/open.js", () => ({
  preparePdfRecordForReader: (...args: unknown[]) => preparePdf(...args),
  prepareEpubRecordInReader: (...args: unknown[]) => prepareEpub(...args),
}));

const { readerKindOf, openPdfInWorkspace, openEpubInWorkspace } =
  await import("@/dashboard/utils/open-reader");

/** The smallest router surface these helpers touch. */
function fakeRouter(path = "/highlights") {
  return {
    push: vi.fn(),
    replace: vi.fn(),
    currentRoute: { value: { path } },
  };
}

const createTab = vi.fn();

beforeEach(() => {
  preparePdf.mockReset();
  prepareEpub.mockReset();
  createTab.mockReset();
  vi.stubGlobal("chrome", { tabs: { create: createTab } });
});

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

describe("opening a record with no readable target", () => {
  const record = {
    id: "rec-1",
    url: "https://example.org/paper.pdf",
    sourceUrl: "https://example.org/paper.pdf",
    pdfLocator: { pageNumber: 3, text: "quote" },
  };

  it("embeds the reader when the target exists", async () => {
    preparePdf.mockResolvedValue(
      "chrome-extension://id/src/pdf/pdf-viewer.html?fp=abc",
    );
    const router = fakeRouter();
    await openPdfInWorkspace(router as unknown as Router, record);

    expect(createTab).not.toHaveBeenCalled();
    expect(router.push).toHaveBeenCalledWith({
      path: "/read",
      query: { kind: "pdf", src: "fp=abc" },
    });
  });

  it("opens the original document instead of a dead click", async () => {
    preparePdf.mockResolvedValue(null);
    const router = fakeRouter();
    await openPdfInWorkspace(router as unknown as Router, record);

    expect(createTab).toHaveBeenCalledWith({ url: record.url });
    expect(router.push).not.toHaveBeenCalled();
  });

  it("falls back to the record's detail page when it has no address", async () => {
    // A locator-only record (imported, or a local file whose fingerprint is
    // gone): no reader target and no http source — the click still lands.
    prepareEpub.mockResolvedValue(null);
    const router = fakeRouter();
    await openEpubInWorkspace(router as unknown as Router, {
      id: "rec-2",
      url: "",
      sourceUrl: "",
      epubLocator: { spineIndex: 0, textQuote: "quote" },
    });

    expect(createTab).not.toHaveBeenCalled();
    expect(router.push).toHaveBeenCalledWith({ path: "/highlights/rec-2" });
  });

  it("replaces instead of pushing when the caller is a redirect", async () => {
    preparePdf.mockResolvedValue(null);
    const router = fakeRouter();
    await openPdfInWorkspace(
      router as unknown as Router,
      {
        id: "rec-3",
        url: "",
        sourceUrl: "",
        pdfLocator: { pageNumber: 1, text: "quote" },
      },
      { replace: true },
    );

    expect(router.replace).toHaveBeenCalledWith({ path: "/highlights/rec-3" });
    expect(router.push).not.toHaveBeenCalled();
  });

  it("does not re-navigate to the page it is already on", async () => {
    preparePdf.mockResolvedValue(null);
    const router = fakeRouter("/highlights/rec-4");
    await openPdfInWorkspace(router as unknown as Router, {
      id: "rec-4",
      url: "",
      sourceUrl: "",
      pdfLocator: { pageNumber: 1, text: "quote" },
    });

    expect(router.push).not.toHaveBeenCalled();
    expect(router.replace).not.toHaveBeenCalled();
  });
});
