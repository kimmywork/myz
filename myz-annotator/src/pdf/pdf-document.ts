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
    // Fetch pages as they are needed instead of downloading the entire file in
    // the background. For remote (range-capable) PDFs this avoids pulling tens
    // to hundreds of MB the user may never view; servers without range support
    // transparently fall back to a full download inside pdf.js.
    disableAutoFetch: true,
    // Bound the canvas used to decode a single image so a huge scanned page is
    // downscaled rather than allocating an unbounded bitmap. `maxImageSize`
    // (in pixels) is deliberately left at its default: pdf.js *drops* images
    // above it entirely, which would blank out large scans.
    canvasMaxAreaInBytes: 64 * 1024 * 1024,
  };
}

/**
 * Upper bound for the canvas backing-store scale. Retina/HiDPI displays can
 * report a devicePixelRatio of 3+, which multiplies a scanned page's bitmap
 * footprint ~9x with little visual benefit.
 */
const MAX_OUTPUT_SCALE = 2;

/** Thrown when a page render is cancelled because its page left the viewport. */
export class PdfRenderCancelled extends Error {
  constructor() {
    super("PDF page render cancelled");
    this.name = "PdfRenderCancelled";
  }
}

export function isPdfRenderCancelled(err: unknown): boolean {
  return err instanceof PdfRenderCancelled;
}

/** A page render that can be cancelled before it finishes. */
export interface PageRenderHandle {
  promise: Promise<PageSize>;
  cancel: () => void;
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
 * Aligns each text-layer span with the rendered ink.
 *
 * pdf.js derives `--scale-x` from a canvas measurement of the text, assuming
 * canvas and DOM metrics match. When they don't (generic fallback fonts,
 * justified runs, non-embedded fonts) the transparent text layer ends up wider
 * than the glyphs, so native selection and highlight rectangles spill into the
 * right margin. Recompute the scale from the actual DOM box so the span width
 * equals the PDF run width (`item.width * scale`).
 */
function syncTextLayerWidths(
  textLayer: { textDivs: HTMLElement[] },
  items: Array<{ str?: string; width?: number }>,
  scale: number,
): void {
  const textItems = items.filter((item) => item.str !== undefined);
  const divs = textLayer.textDivs;
  for (let i = 0; i < textItems.length && i < divs.length; i += 1) {
    const el = divs[i];
    const item = textItems[i];
    // Items pdf.js chose not to scale (e.g. single glyphs) have no inline var.
    if (
      !el.textContent ||
      !item.width ||
      !el.style.getPropertyValue("--scale-x")
    ) {
      continue;
    }
    const current =
      Number.parseFloat(getComputedStyle(el).getPropertyValue("--scale-x")) ||
      1;
    const base = el.getBoundingClientRect().width / current;
    if (base > 0) {
      el.style.setProperty("--scale-x", String((item.width * scale) / base));
    }
  }
}

/**
 * Renders a single PDF page into the given placeholder element
 * (canvas + text layer + overlay layer).
 *
 * Returns a handle with a `cancel()` so callers can abandon work for pages
 * that scrolled away or were torn down (zoom/rebuild). A cancelled render
 * rejects with `PdfRenderCancelled`; all other errors are genuine failures.
 *
 * Note: pdf.js v6 sizes the text layer from `--total-scale-factor`, not the
 * legacy `--scale-factor`; both are set for compatibility.
 */
export function renderPageInto(
  pageEl: HTMLElement,
  doc: PdfDocument,
  pageNumber: number,
  scale = 1.5,
): PageRenderHandle {
  let renderTask: { cancel: () => void; promise: Promise<void> } | null = null;
  let textLayer: { cancel: () => void } | null = null;
  let canceled = false;

  const promise = (async (): Promise<PageSize> => {
    try {
      const page = await doc.getPage(pageNumber);
      if (canceled) {
        throw new PdfRenderCancelled();
      }
      const viewport = page.getViewport({ scale });
      const outputScale = Math.min(
        window.devicePixelRatio || 1,
        MAX_OUTPUT_SCALE,
      );

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

      renderTask = page.render({
        canvas,
        viewport,
        transform:
          outputScale !== 1
            ? [outputScale, 0, 0, outputScale, 0, 0]
            : undefined,
      });
      await renderTask.promise;
      renderTask = null;
      if (canceled) {
        throw new PdfRenderCancelled();
      }

      const textContent = await page.getTextContent();
      if (canceled) {
        throw new PdfRenderCancelled();
      }
      const textLayerEl = document.createElement("div");
      textLayerEl.className = "textLayer";
      const layer = new pdfjsLib.TextLayer({
        textContentSource: textContent,
        container: textLayerEl,
        viewport,
      });
      textLayer = layer;
      const textTask = layer.render();

      const overlayEl = document.createElement("div");
      overlayEl.className = "pdf-overlayLayer";

      pageEl.replaceChildren(canvas, textLayerEl, overlayEl);
      await textTask;
      textLayer = null;
      if (canceled) {
        throw new PdfRenderCancelled();
      }
      await document.fonts?.ready;
      syncTextLayerWidths(
        layer,
        textContent.items as Array<{ str?: string; width?: number }>,
        viewport.scale,
      );

      return { width: viewport.width, height: viewport.height };
    } catch (err) {
      if (canceled) {
        throw new PdfRenderCancelled();
      }
      throw err;
    }
  })();

  return {
    promise,
    cancel() {
      if (canceled) {
        return;
      }
      canceled = true;
      renderTask?.cancel();
      textLayer?.cancel();
    },
  };
}
