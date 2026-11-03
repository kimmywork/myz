/**
 * PDF side of the bilingual (对照翻译) reading mode.
 *
 * Each page is laid out as a row: the original page sheet and a mirrored
 * translation column of the same width. Blocks come from the same geometry
 * grouping the selection uses (`linesOf` + `groupIntoBlocks`), so the parts of
 * a page that are translated are exactly the parts a reader perceives as
 * paragraphs. Only blocks *fully* inside the viewport are requested, which is
 * what keeps the first paint cheap; scrolling asks for the next ones.
 */

import {
  createBilingualPane,
  type BilingualBlock,
  type BilingualPane,
} from "../reader/bilingual-pane.js";
import type { BilingualSession } from "../reader/translate/bilingual.js";
import { groupIntoBlocks, unionRect } from "./text-blocks.js";
import { linesOf } from "./text-selection/spans.js";

const MIN_BLOCK_HEIGHT = 6;
const MIN_FONT_SIZE = 11;
const MAX_FONT_SIZE = 32;

/** Blocks without letters (page numbers, rules) are not worth a request. */
function isTranslatable(text: string): boolean {
  return text.length >= 2 && /\p{L}/u.test(text);
}

/**
 * Reads a painted page's paragraphs with page-relative geometry. The text layer
 * is the source of truth, so this must run after the page's text layer exists.
 *
 * Geometry is not flattened into one reading column: a block keeps the page x
 * it came from, may only grow horizontally until it would hit a neighbour in
 * the same vertical band, and knows how much vertical room it has before the
 * next block in its own band. That is what lets a two-column page, a sidebar
 * caption and a label beside a figure stay interleaved in the translation.
 */
export function collectPdfBlocks(pageEl: HTMLElement): BilingualBlock[] {
  const lines = linesOf(pageEl);
  if (!lines.length) {
    return [];
  }
  const pageRect = pageEl.getBoundingClientRect();
  const sources: {
    text: string;
    rect: ReturnType<typeof unionRect>;
    lineHeight: number;
  }[] = [];
  for (const lineGroup of groupIntoBlocks(lines)) {
    const rect = unionRect(
      lineGroup.flatMap((line) => line.map((item) => item.rect)),
    );
    const text = lineGroup
      .map((line) => line.map((item) => item.node.data).join(" "))
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    if (!text || !isTranslatable(text) || rect.height < MIN_BLOCK_HEIGHT) {
      continue;
    }
    const firstLine = unionRect(lineGroup[0].map((item) => item.rect));
    sources.push({ text, rect, lineHeight: firstLine.height });
  }
  if (!sources.length) {
    return [];
  }

  const textRight = Math.max(...sources.map((source) => source.rect.right));
  const textBottom = Math.max(...sources.map((source) => source.rect.bottom));
  const widths = sources
    .map((source) => source.rect.width)
    .sort((a, b) => a - b);
  const columnWidth = widths[Math.floor(widths.length / 2)] ?? 0;

  return sources.map((source, index) => {
    const { text, rect, lineHeight } = source;
    // Horizontal room before the next block that shares this vertical band, so
    // a sidebar label never grows across the gutter into the main column.
    let rightLimit = textRight;
    // Vertical room before the next block below in this same band, so a long
    // translation shrinks into its slot instead of being pushed elsewhere.
    let slotBottom = textBottom;
    sources.forEach((other, otherIndex) => {
      if (otherIndex === index) {
        return;
      }
      const candidate = other.rect;
      const horizontalOverlap =
        Math.min(candidate.right, rect.right) -
          Math.max(candidate.left, rect.left) >
        Math.min(candidate.width, rect.width) * 0.2;
      const verticalOverlap =
        candidate.top < rect.bottom - 2 && candidate.bottom > rect.top + 2;
      if (verticalOverlap && candidate.left > rect.left + 2) {
        rightLimit = Math.min(rightLimit, candidate.left - 6);
      }
      if (horizontalOverlap && candidate.top > rect.top + 4) {
        slotBottom = Math.min(slotBottom, candidate.top);
      }
    });
    const room = Math.max(rect.width, rightLimit - rect.left);
    return {
      key: text,
      text,
      top: rect.top - pageRect.top,
      left: rect.left - pageRect.left,
      width: Math.min(Math.max(rect.width, columnWidth * 0.75), room),
      height: rect.height,
      slotHeight: Math.max(rect.height, slotBottom - rect.top - 4),
      fontSize: Math.max(
        MIN_FONT_SIZE,
        Math.min(MAX_FONT_SIZE, Math.round(lineHeight * 0.8)),
      ),
    };
  });
}

export interface PdfBilingualLayerOptions {
  session: BilingualSession;
  getStage: () => HTMLElement | null;
}

export interface PdfBilingualLayer {
  /** Listens for stage scroll (idempotent). */
  attach(): void;
  detach(): void;
  /** Builds any missing pane for painted pages and requests visible blocks. */
  sync(): void;
  /** Called after a page paints; (re)builds its column. */
  pageRendered(pageEl: HTMLElement): void;
  /** Requests the blocks that are fully inside the stage viewport now. */
  requestVisible(): void;
  clear(): void;
  dispose(): void;
}

export function createPdfBilingualLayer(
  options: PdfBilingualLayerOptions,
): PdfBilingualLayer {
  const panes = new Map<HTMLElement, BilingualPane>();
  let stage: HTMLElement | null = null;
  let raf = 0;

  function disposePanes(connectedOnly: boolean): void {
    for (const [pageEl, pane] of [...panes]) {
      if (connectedOnly && pageEl.isConnected) {
        continue;
      }
      pane.dispose();
      panes.delete(pageEl);
    }
  }

  function paneFor(pageEl: HTMLElement): BilingualPane | null {
    const existing = panes.get(pageEl);
    if (existing) {
      return existing;
    }
    const paneEl =
      pageEl.parentElement?.querySelector<HTMLElement>(".pdf-bilingual");
    if (!paneEl) {
      return null;
    }
    const pane = createBilingualPane({
      container: () => paneEl,
      session: options.session,
      // Fixed, page-relative positions: a two-column page or a label beside a
      // figure must stay interleaved rather than collapse into one column.
      mode: "anchored",
      minHeight: () => pageEl.getBoundingClientRect().height,
    });
    pane.render(collectPdfBlocks(pageEl));
    panes.set(pageEl, pane);
    return pane;
  }

  function requestVisible(): void {
    const current = options.getStage();
    if (!current) {
      return;
    }
    const stageRect = current.getBoundingClientRect();
    const pages = Array.from(
      current.querySelectorAll<HTMLElement>(".pdf-page"),
    );
    for (const pageEl of pages) {
      const pane = panes.get(pageEl);
      if (!pane) {
        continue;
      }
      const pageRect = pageEl.getBoundingClientRect();
      if (
        pageRect.bottom < stageRect.top - 4 ||
        pageRect.top > stageRect.bottom + 4
      ) {
        continue;
      }
      pane.requestVisible((block) => {
        const top = pageRect.top + block.top;
        return (
          top >= stageRect.top - 2 && top + block.height <= stageRect.bottom + 2
        );
      });
    }
  }

  function handleScroll(): void {
    if (raf !== 0) {
      return;
    }
    raf = window.requestAnimationFrame(() => {
      raf = 0;
      requestVisible();
    });
  }

  function attach(): void {
    const current = options.getStage();
    if (!current) {
      return;
    }
    if (stage === current) {
      return;
    }
    detach();
    stage = current;
    stage.addEventListener("scroll", handleScroll, { passive: true });
  }

  function detach(): void {
    if (stage) {
      stage.removeEventListener("scroll", handleScroll);
    }
    stage = null;
    if (raf !== 0) {
      window.cancelAnimationFrame(raf);
      raf = 0;
    }
  }

  function sync(): void {
    const current = options.getStage();
    if (!current) {
      return;
    }
    disposePanes(true);
    const pages = Array.from(
      current.querySelectorAll<HTMLElement>(".pdf-page"),
    );
    for (const pageEl of pages) {
      // Placeholders without a text layer have nothing to translate yet.
      if (!pageEl.querySelector(".textLayer span")) {
        continue;
      }
      paneFor(pageEl);
    }
    requestVisible();
  }

  return {
    attach,
    detach,
    sync,
    pageRendered(pageEl) {
      // Pages are rebuilt on every zoom/scale change; drop the panes of the
      // replaced elements here instead of leaking one per rendered page until
      // the next full `sync()`.
      disposePanes(true);
      paneFor(pageEl);
      requestVisible();
    },
    requestVisible,
    clear() {
      for (const pane of panes.values()) {
        pane.dispose();
      }
      panes.clear();
    },
    dispose() {
      detach();
      for (const pane of panes.values()) {
        pane.dispose();
      }
      panes.clear();
    },
  };
}
