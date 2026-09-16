import * as pdfjsLib from "pdfjs-dist";
import PdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?worker";
import "pdfjs-dist/web/pdf_viewer.css";

if (!pdfjsLib.GlobalWorkerOptions.workerPort) {
  pdfjsLib.GlobalWorkerOptions.workerPort = new PdfWorker();
}

export type PdfDocument = Awaited<
  ReturnType<typeof pdfjsLib.getDocument>["promise"]
>;

export interface PageSize {
  width: number;
  height: number;
}

/**
 * A single entry of the PDF outline (table of contents). `pageNumber` is the
 * 1-based resolved page, or null when the destination cannot be resolved
 * (named destination missing, malformed outline, label-only node).
 */
export interface PdfOutlineEntry {
  id: string;
  title: string;
  pageNumber: number | null;
  depth: number;
  children: PdfOutlineEntry[];
}

interface RawOutlineNode {
  title?: string;
  dest?: string | unknown[] | null;
  items?: RawOutlineNode[];
}

function resolveOutlinePage(
  doc: PdfDocument,
  dest: RawOutlineNode["dest"],
): Promise<number | null> {
  if (!dest) {
    return Promise.resolve(null);
  }
  return (async () => {
    try {
      // Named destinations must be resolved; explicit dest arrays are already
      // `[pageRef, ...]` (pdf.js v6 `getDestination` only accepts names).
      const explicit =
        typeof dest === "string"
          ? ((await doc.getDestination(dest)) as unknown[] | null)
          : dest;
      if (!explicit || explicit.length === 0) {
        return null;
      }
      const ref = explicit[0];
      if (typeof ref === "number") {
        return ref + 1;
      }
      const index = await doc.getPageIndex(ref as { num: number; gen: number });
      return index >= 0 ? index + 1 : null;
    } catch {
      return null;
    }
  })();
}

/**
 * Reads the document outline and resolves every destination to a page number.
 * Returns an empty array for PDFs without an outline.
 */
export async function loadOutline(
  doc: PdfDocument,
): Promise<PdfOutlineEntry[]> {
  let raw: RawOutlineNode[] | null;
  try {
    raw = (await doc.getOutline()) as RawOutlineNode[] | null;
  } catch (err) {
    console.warn("Failed to read PDF outline", err);
    return [];
  }
  if (!raw || raw.length === 0) {
    return [];
  }
  let counter = 0;
  const mapLevel = (
    items: RawOutlineNode[],
    depth: number,
  ): Promise<PdfOutlineEntry[]> =>
    Promise.all(
      items.map(async (item) => {
        const children = item.items?.length
          ? await mapLevel(item.items, depth + 1)
          : [];
        return {
          id: `outline-${counter++}`,
          title: (item.title || "").trim() || "(无标题)",
          pageNumber: await resolveOutlinePage(doc, item.dest),
          depth,
          children,
        };
      }),
    );
  return mapLevel(raw, 0);
}

export const PDFJS_VERSION = pdfjsLib.version;

/**
 * Base URL of the pdf.js runtime assets copied into the build by
 * `copyPdfjsAssets` (vite.config.mjs). Required for JPEG2000/JBIG2 images,
 * embedded CMaps and standard fonts.
 */
function pdfAssetBase(): string {
  try {
    return chrome.runtime.getURL("assets/pdfjs/");
  } catch {
    return "/assets/pdfjs/";
  }
}

function documentOptions() {
  const base = pdfAssetBase();
  return {
    cMapUrl: `${base}cmaps/`,
    cMapPacked: true,
    standardFontDataUrl: `${base}standard_fonts/`,
    wasmUrl: `${base}wasm/`,
    iccUrl: `${base}iccs/`,
  };
}

export async function loadPdfFromUrl(url: string): Promise<PdfDocument> {
  return pdfjsLib.getDocument({ url, ...documentOptions() }).promise;
}

export async function loadPdfFromBytes(
  bytes: ArrayBuffer,
): Promise<PdfDocument> {
  return pdfjsLib.getDocument({ data: bytes, ...documentOptions() }).promise;
}

export async function getPageSize(
  doc: PdfDocument,
  pageNumber: number,
  scale = 1.5,
): Promise<PageSize> {
  const page = await doc.getPage(pageNumber);
  const viewport = page.getViewport({ scale });
  return { width: viewport.width, height: viewport.height };
}

/**
 * Renders a single PDF page into the given placeholder element
 * (canvas + text layer + overlay layer).
 *
 * Note: pdf.js v6 sizes the text layer from `--total-scale-factor`, not the
 * legacy `--scale-factor`; both are set for compatibility.
 */
export async function renderPageInto(
  pageEl: HTMLElement,
  doc: PdfDocument,
  pageNumber: number,
  scale = 1.5,
): Promise<PageSize> {
  const page = await doc.getPage(pageNumber);
  const viewport = page.getViewport({ scale });
  const outputScale = window.devicePixelRatio || 1;

  pageEl.dataset.page = String(pageNumber);
  pageEl.style.width = `${viewport.width}px`;
  pageEl.style.height = `${viewport.height}px`;
  pageEl.style.setProperty("--total-scale-factor", String(viewport.scale));
  pageEl.style.setProperty("--scale-factor", String(viewport.scale));

  const canvas = document.createElement("canvas");
  canvas.width = Math.floor(viewport.width * outputScale);
  canvas.height = Math.floor(viewport.height * outputScale);
  canvas.style.width = `${viewport.width}px`;
  canvas.style.height = `${viewport.height}px`;
  await page.render({
    canvas,
    viewport,
    transform:
      outputScale !== 1 ? [outputScale, 0, 0, outputScale, 0, 0] : undefined,
  }).promise;

  const textContent = await page.getTextContent();
  const textLayerEl = document.createElement("div");
  textLayerEl.className = "textLayer";
  const textLayer = new pdfjsLib.TextLayer({
    textContentSource: textContent,
    container: textLayerEl,
    viewport,
  });
  const textTask = textLayer.render();

  const overlayEl = document.createElement("div");
  overlayEl.className = "pdf-overlayLayer";

  pageEl.replaceChildren(canvas, textLayerEl, overlayEl);
  await textTask;

  return { width: viewport.width, height: viewport.height };
}
