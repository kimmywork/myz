import {
  KEEP_MARGIN_PX,
  KEEP_RADIUS,
  MAX_RESIDENT_BYTES,
  pageEl,
  type PdfEngineContext,
} from "./engine-context.js";

/** Approximate resident memory of a rendered page's canvas. */
function estimateBytes(el: HTMLElement): number {
  const canvas = el.querySelector("canvas");
  return canvas ? canvas.width * canvas.height * 4 : 0;
}

/** Drops the rendered bitmap/text layer of a page while keeping its box. */
function evict(ctx: PdfEngineContext, pageNumber: number) {
  const slot = ctx.slots.get(pageNumber);
  if (!slot || !slot.rendered) return;
  slot.handle?.cancel();
  slot.handle = null;
  slot.rendered = false;
  const el = pageEl(ctx, pageNumber);
  if (el) {
    const canvas = el.querySelector("canvas");
    if (canvas) {
      // Zeroing the backing store releases the bitmap immediately instead of
      // waiting for GC.
      canvas.width = 0;
      canvas.height = 0;
      canvas.remove();
    }
    el.querySelector(".textLayer")?.remove();
    el.querySelector(".pdf-overlayLayer")?.remove();
  }
  ctx.slots.delete(pageNumber);
}

/**
 * Releases far-away rendered pages. `anchorPage` must be the page actually at
 * the viewport centre (computed fresh), never the possibly-stale `state.page`;
 * otherwise a page the user just jumped to would be evicted immediately.
 * Only completed renders are evicted, so an in-flight page is never cancelled.
 */
export function evictIfNeeded(ctx: PdfEngineContext, anchorPage: number) {
  if (ctx.slots.size === 0 || !ctx.stage) return;
  const stageRect = ctx.stage.getBoundingClientRect();
  const rendered = [...ctx.slots.entries()].filter(([, slot]) => slot.rendered);
  const bytesOf = (pageNumber: number): number => {
    const el = pageEl(ctx, pageNumber);
    return el ? estimateBytes(el) : 0;
  };
  let totalBytes = rendered.reduce(
    (sum, [pageNumber]) => sum + bytesOf(pageNumber),
    0,
  );
  const byDistance = [...rendered].sort(
    (a, b) => Math.abs(b[0] - anchorPage) - Math.abs(a[0] - anchorPage),
  );
  for (const [pageNumber] of byDistance) {
    const far = Math.abs(pageNumber - anchorPage) > KEEP_RADIUS;
    if (!far && totalBytes <= MAX_RESIDENT_BYTES) continue;
    // The IntersectionObserver only fires on intersection *changes*, so an
    // evicted-but-visible page would stay blank until the user scrolls.
    const el = pageEl(ctx, pageNumber);
    if (el) {
      const rect = el.getBoundingClientRect();
      const nearViewport =
        rect.bottom > stageRect.top - KEEP_MARGIN_PX &&
        rect.top < stageRect.bottom + KEEP_MARGIN_PX;
      if (nearViewport) continue;
    }
    const bytes = bytesOf(pageNumber);
    evict(ctx, pageNumber);
    totalBytes -= bytes;
  }
}
