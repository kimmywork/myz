import {
  KEEP_RADIUS,
  pageElements,
  type PdfEngineContext,
} from "./engine-context.js";
import type { PdfRenderQueue } from "./engine-render.js";

interface ScrollDeps {
  queue: PdfRenderQueue;
  evictIfNeeded: (anchorPage: number) => void;
  schedulePersist: () => void;
}

/** Tracks the visible page under scroll and cancels/evicts far work. */
export function createPageTracker(ctx: PdfEngineContext, deps: ScrollDeps) {
  /**
   * Page under the viewport centre. `elementFromPoint` is O(1) and avoids the
   * per-frame O(N) layout reads of scanning every placeholder; the scan is only
   * a fallback for when the centre lands in a gap between pages.
   */
  function computeCurrentPage(): number {
    if (!ctx.stage) return ctx.state.page.value;
    const rect = ctx.stage.getBoundingClientRect();
    const hit = document.elementFromPoint(
      rect.left + rect.width / 2,
      rect.top + rect.height / 2,
    );
    const under = hit?.closest<HTMLElement>(".pdf-page");
    if (under?.dataset.page) return Number(under.dataset.page);
    const middle = rect.top + ctx.stage.clientHeight / 2;
    const elements = pageElements(ctx);
    for (const el of elements) {
      if (middle < el.getBoundingClientRect().bottom) {
        return Number(el.dataset.page || 1);
      }
    }
    return elements.length
      ? Number(
          elements[elements.length - 1].dataset.page || ctx.state.pages.value,
        )
      : 1;
  }

  /** Cancels in-flight renders that have scrolled far from the viewport. */
  function cancelFarInFlight(anchorPage: number) {
    for (const [pageNumber, slot] of ctx.slots) {
      if (
        !slot.rendered &&
        slot.handle &&
        pageNumber !== ctx.navTarget &&
        Math.abs(pageNumber - anchorPage) > KEEP_RADIUS
      ) {
        slot.handle.cancel();
      }
    }
  }

  function updateCurrentPage() {
    const next = computeCurrentPage();
    if (next !== ctx.state.page.value) {
      ctx.state.page.value = next;
      deps.schedulePersist();
    }
    deps.queue.sortQueue();
    cancelFarInFlight(next);
    if (ctx.activeRenders === 0) deps.evictIfNeeded(next);
  }

  function handleScroll() {
    if (ctx.scrollRaf !== 0) return;
    ctx.scrollRaf = window.requestAnimationFrame(() => {
      ctx.scrollRaf = 0;
      updateCurrentPage();
    });
  }

  return {
    computeCurrentPage,
    cancelFarInFlight,
    updateCurrentPage,
    handleScroll,
  };
}

export type PdfPageTracker = ReturnType<typeof createPageTracker>;
