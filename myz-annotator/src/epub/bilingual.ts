/**
 * EPUB side of the bilingual (对照翻译) reading mode.
 *
 * Reflow has no pages, so the translation column mirrors the chapter document:
 * each block keeps its source offset inside the document, and the column is
 * translated by the iframe's scroll offset, which makes both sides line up
 * while scrolling. As with PDF, only blocks fully inside the frame viewport are
 * requested, and the rest arrives as the reader scrolls.
 */

import {
  createBilingualPane,
  type BilingualBlock,
  type BilingualPane,
} from "../reader/bilingual-pane.js";
import type { BilingualSession } from "../reader/translate/bilingual.js";

/**
 * Block-level candidates. `div`/`section` are included because many EPUBs use
 * bare wrappers as paragraphs; only the innermost match is kept so a
 * `<li><p>…</p></li>` is not translated twice.
 */
const BLOCK_SELECTOR = [
  "p",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "li",
  "blockquote",
  "pre",
  "td",
  "th",
  "dt",
  "dd",
  "figcaption",
  "div",
  "section",
  "article",
].join(",");

function fontSizeOf(el: HTMLElement, win: Window): number | undefined {
  try {
    const size = Number.parseFloat(win.getComputedStyle(el).fontSize);
    return Number.isFinite(size) && size > 0 ? size : undefined;
  } catch {
    return undefined;
  }
}

/** Reads the chapter's paragraphs with document-relative geometry. */
export function collectEpubBlocks(
  doc: Document,
  win: Window,
): BilingualBlock[] {
  const body = doc.body;
  if (!body) {
    return [];
  }
  const blocks: BilingualBlock[] = [];
  for (const el of Array.from(
    body.querySelectorAll<HTMLElement>(BLOCK_SELECTOR),
  )) {
    if (el.querySelector(BLOCK_SELECTOR)) {
      continue;
    }
    const text = (el.textContent || "").replace(/\s+/g, " ").trim();
    if (!text || text.length < 2 || !/\p{L}/u.test(text)) {
      continue;
    }
    const rect = el.getBoundingClientRect();
    if (rect.height < 6 || rect.width < 20) {
      continue;
    }
    blocks.push({
      key: text,
      text,
      top: rect.top + win.scrollY,
      height: rect.height,
      fontSize: fontSizeOf(el, win),
      heading: /^H[1-6]$/.test(el.tagName),
    });
  }
  return blocks;
}

export interface EpubBilingualLayerOptions {
  session: BilingualSession;
  /** The pane content element that holds the absolutely positioned blocks. */
  container: () => HTMLElement | null;
  /**
   * The clipping viewport around the content (`.epub-bilingual`). Wheel input
   * there is forwarded to the chapter frame: the translation column has no
   * scrollbar of its own, so scrolling over it must scroll the book.
   */
  scrollHost: () => HTMLElement | null;
}

export interface EpubBilingualLayer {
  /** Remembers the freshly loaded chapter frame without painting it. */
  bind(doc: Document, win: Window): void;
  /** Re-measures the chapter (width change, typography change). */
  refresh(): void;
  /** Mirrors the frame scroll offset and requests newly visible blocks. */
  syncScroll(): void;
  /** Requests the blocks fully inside the frame viewport now. */
  requestVisible(): void;
  clear(): void;
  dispose(): void;
}

export function createEpubBilingualLayer(
  options: EpubBilingualLayerOptions,
): EpubBilingualLayer {
  let doc: Document | null = null;
  let win: Window | null = null;
  let pane: BilingualPane | null = null;
  let blocks: BilingualBlock[] = [];
  let host: HTMLElement | null = null;

  /** Wheel deltas arrive in lines/pages on some platforms. */
  function deltaInPixels(event: WheelEvent, viewport: Window): number {
    if (event.deltaMode === 1) {
      return event.deltaY * 16;
    }
    if (event.deltaMode === 2) {
      return event.deltaY * viewport.innerHeight;
    }
    return event.deltaY;
  }

  function handleWheel(event: WheelEvent): void {
    if (!win) {
      return;
    }
    win.scrollBy({ top: deltaInPixels(event, win), behavior: "auto" });
    event.preventDefault();
  }

  function attachHost(): void {
    const next = options.scrollHost();
    if (next === host) {
      return;
    }
    host?.removeEventListener("wheel", handleWheel);
    host = next;
    host?.addEventListener("wheel", handleWheel, { passive: false });
  }

  function detachHost(): void {
    host?.removeEventListener("wheel", handleWheel);
    host = null;
  }

  function ensurePane(): BilingualPane {
    if (!pane) {
      pane = createBilingualPane({
        container: options.container,
        session: options.session,
        gap: 6,
      });
    }
    return pane;
  }

  function requestVisible(): void {
    if (!win) {
      return;
    }
    const top = win.scrollY;
    const bottom = top + win.innerHeight;
    ensurePane().requestVisible(
      (block) => block.top >= top - 2 && block.top + block.height <= bottom + 2,
    );
  }

  function syncScroll(): void {
    if (!win) {
      return;
    }
    const content = options.container();
    if (content) {
      content.style.transform = `translateY(${-win.scrollY}px)`;
    }
    requestVisible();
  }

  function refresh(): void {
    if (!doc || !win) {
      return;
    }
    blocks = collectEpubBlocks(doc, win);
    ensurePane().render(blocks);
    syncScroll();
  }

  return {
    bind(nextDoc, nextWin) {
      doc = nextDoc;
      win = nextWin;
      attachHost();
    },
    refresh() {
      attachHost();
      refresh();
    },
    syncScroll,
    requestVisible,
    clear() {
      blocks = [];
      pane?.clear();
    },
    dispose() {
      detachHost();
      pane?.dispose();
      pane = null;
      blocks = [];
      doc = null;
      win = null;
    },
  };
}
