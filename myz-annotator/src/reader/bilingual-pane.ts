/**
 * DOM painter for the bilingual (对照翻译) columns.
 *
 * Two layouts share the same block model:
 *
 * - `anchored` (PDF): every block is pinned to its exact source position
 *   (`top`/`left`/`width`), so multi-column pages, sidebars and figure captions
 *   keep their interleaving instead of collapsing into one reading column. A
 *   translation that outgrows its slot is shrunk (down to a floor) and then
 *   allowed to overflow rather than pushed somewhere else.
 * - `flow` (EPUB): reflow has no absolute positions worth honouring, so blocks
 *   keep reading order, reserve their source height and push the next block
 *   down when a translation is longer.
 *
 * The pane subscribes to the translation session itself: blocks appear as soon
 * as their translation is ready, without re-rendering the column.
 */

import type {
  BilingualSegment,
  BilingualSession,
} from "./translate/bilingual.js";

export interface BilingualBlock {
  /** Stable identity; identical text shares one translation. */
  key: string;
  text: string;
  /** Offset from the pane's top, in CSS px at the current zoom. */
  top: number;
  /** Source block height; the pane keeps at least this much room. */
  height: number;
  /** Source horizontal geometry (anchored mode). */
  left?: number;
  width?: number;
  /** Vertical room before the next block in the same band (anchored mode). */
  slotHeight?: number;
  /** Font size derived from the source leading (PDF) or the book style. */
  fontSize?: number;
  heading?: boolean;
}

export type BilingualPaneMode = "anchored" | "flow";

export interface BilingualPaneOptions {
  container: () => HTMLElement | null;
  session: BilingualSession;
  /** Defaults to `flow` (EPUB); PDF passes `anchored`. */
  mode?: BilingualPaneMode;
  /** Space kept between a block and the next one when it overflows (flow). */
  gap?: number;
  /** Extra height the column keeps at least (PDF: the page height). */
  minHeight?: () => number;
}

export interface BilingualPane {
  /** Rebuilds the column for a new set of blocks (page render, chapter load). */
  render(blocks: BilingualBlock[]): void;
  /** Requests every block accepted by `predicate` (usually "fully visible"). */
  requestVisible(predicate: (block: BilingualBlock) => boolean): void;
  /** Repositions the blocks after the container changed (e.g. scroll-to). */
  relayout(): void;
  clear(): void;
  dispose(): void;
}

const DEFAULT_GAP = 4;
/** Floor for shrink-to-fit, relative to the font size derived from the source. */
const MIN_FONT_RATIO = 0.62;
/** Never shrink below this, even when the translation is much longer. */
const MIN_SHRINK_FONT = 9;

export function createBilingualPane(
  options: BilingualPaneOptions,
): BilingualPane {
  const gap = options.gap ?? DEFAULT_GAP;
  const mode = options.mode ?? "flow";
  const { session } = options;
  let blocks: BilingualBlock[] = [];
  let rendered: { block: BilingualBlock; el: HTMLElement }[] = [];
  let elementsByKey = new Map<string, HTMLElement[]>();

  const unsubscribe = session.subscribe((event) => {
    if (event.type === "reset") {
      for (const { el } of rendered) {
        el.textContent = "";
        el.dataset.state = "idle";
      }
      layout();
      return;
    }
    if (event.type === "state") {
      // A failed batch will never fill its placeholders: stop the shimmer so a
      // failure reads as "not translated" instead of "still working".
      if (event.snapshot.phase !== "error") {
        return;
      }
      for (const { el } of rendered) {
        if (el.dataset.state === "pending") {
          el.dataset.state = "idle";
        }
      }
      return;
    }
    const targets = elementsByKey.get(event.key);
    if (!targets?.length) {
      return;
    }
    for (const el of targets) {
      el.textContent = event.translation;
      el.dataset.state = "done";
    }
    layout();
  });

  function applyGeometry(el: HTMLElement, block: BilingualBlock): void {
    el.style.minHeight = `${Math.max(0, block.height)}px`;
    if (typeof block.left === "number") {
      el.style.left = `${block.left}px`;
    }
    if (typeof block.width === "number") {
      el.style.width = `${block.width}px`;
    }
    if (typeof block.fontSize === "number") {
      el.style.fontSize = `${block.fontSize}px`;
    }
    if (block.heading) {
      el.classList.add("is-heading");
    }
  }

  /**
   * Anchored blocks stay where the source text is; only blocks whose
   * translation overflows the source slot shrink their font. Heights are read
   * before and after the shrink so the column height is accurate.
   */
  function layoutAnchored(container: HTMLElement): void {
    const heights = rendered.map(({ el }) => el.offsetHeight);
    rendered.forEach(({ block, el }, index) => {
      const slot = block.slotHeight;
      const size = block.fontSize;
      if (!slot || !size || heights[index] <= slot + 1) {
        return;
      }
      const scaled = Math.floor((size * slot) / heights[index]);
      const next = Math.max(
        MIN_SHRINK_FONT,
        Math.round(size * MIN_FONT_RATIO),
        scaled,
      );
      if (next < size) {
        el.style.fontSize = `${next}px`;
      }
    });
    let bottom = 0;
    for (const { block, el } of rendered) {
      const top = Math.max(0, block.top);
      el.style.top = `${top}px`;
      bottom = Math.max(bottom, top + el.offsetHeight);
    }
    const floor = options.minHeight?.() ?? 0;
    container.style.height = `${Math.max(bottom, floor)}px`;
  }

  /** Reading order with a minimum source height: translations push the rest. */
  function layoutFlow(container: HTMLElement): void {
    const heights = rendered.map(({ el }) => el.offsetHeight);
    let cursor = 0;
    rendered.forEach(({ block, el }, index) => {
      const top = Math.max(block.top, cursor);
      el.style.top = `${top}px`;
      cursor = top + heights[index] + gap;
    });
    container.style.height = `${Math.max(
      0,
      cursor - (rendered.length ? gap : 0),
    )}px`;
  }

  function layout(): void {
    const container = options.container();
    if (!container) {
      return;
    }
    for (const { block, el } of rendered) {
      el.style.minHeight = `${Math.max(0, block.height)}px`;
    }
    if (mode === "anchored") {
      layoutAnchored(container);
    } else {
      layoutFlow(container);
    }
  }

  function render(next: BilingualBlock[]): void {
    const container = options.container();
    if (!container) {
      return;
    }
    const fragment = document.createDocumentFragment();
    elementsByKey = new Map();
    rendered = next.map((block) => {
      const el = document.createElement("p");
      el.className = "myz-bilingual__block";
      el.dataset.blockKey = block.key;
      applyGeometry(el, block);
      const translation = session.translationFor(block.key);
      if (translation) {
        el.textContent = translation;
        el.dataset.state = "done";
      } else {
        el.dataset.state = "idle";
      }
      const existing = elementsByKey.get(block.key);
      if (existing) {
        existing.push(el);
      } else {
        elementsByKey.set(block.key, [el]);
      }
      fragment.append(el);
      return { block, el };
    });
    blocks = next;
    container.replaceChildren(fragment);
    layout();
  }

  function requestVisible(predicate: (block: BilingualBlock) => boolean): void {
    if (!blocks.length) {
      return;
    }
    const segments: BilingualSegment[] = [];
    for (const block of blocks) {
      if (!predicate(block) || session.translationFor(block.key)) {
        continue;
      }
      segments.push({ key: block.key, text: block.text });
      for (const el of elementsByKey.get(block.key) ?? []) {
        if (el.dataset.state !== "done") {
          el.dataset.state = "pending";
        }
      }
    }
    if (segments.length) {
      session.request(segments);
    }
  }

  function clear(): void {
    const container = options.container();
    blocks = [];
    rendered = [];
    elementsByKey = new Map();
    if (container) {
      container.replaceChildren();
      container.style.height = "0px";
    }
  }

  return {
    render,
    requestVisible,
    relayout: layout,
    clear,
    dispose: () => {
      unsubscribe();
      clear();
    },
  };
}
