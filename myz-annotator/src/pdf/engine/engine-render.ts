import { isPdfRenderCancelled, renderPageInto } from "../pdf-document.js";
import {
  KEEP_RADIUS,
  MAX_CONCURRENT_RENDERS,
  pageEl,
  pageElements,
  type PdfEngineContext,
  type RenderSlot,
} from "./engine-context.js";

function sortQueue(ctx: PdfEngineContext) {
  const currentPage = ctx.state.page.value;
  ctx.queue.sort(
    (a, b) =>
      a.priority - b.priority ||
      Math.abs(a.pageNumber - currentPage) -
        Math.abs(b.pageNumber - currentPage),
  );
}

function finishRender(ctx: PdfEngineContext, pageNumber: number) {
  const resolve = ctx.waiters.get(pageNumber);
  ctx.waiters.delete(pageNumber);
  ctx.pendingRenders.delete(pageNumber);
  resolve?.();
}

function pumpQueue(ctx: PdfEngineContext) {
  if (!ctx.doc || !ctx.stage) return;
  // While the page at the viewport centre is still unrendered, render it
  // alone so a jump lands on a painted page as fast as possible.
  const focusPage = ctx.state.page.value;
  const focusWaiting =
    !ctx.slots.get(focusPage)?.rendered && ctx.pendingRenders.has(focusPage);
  const limit = focusWaiting ? 1 : MAX_CONCURRENT_RENDERS;
  while (ctx.activeRenders < limit && ctx.queue.length > 0) {
    const { pageNumber } = ctx.queue.shift()!;
    const el = pageEl(ctx, pageNumber);
    if (!el || ctx.slots.get(pageNumber)?.rendered) {
      finishRender(ctx, pageNumber);
      continue;
    }
    // Drop work for pages that scrolled far away instead of decoding them.
    if (
      pageNumber !== ctx.navTarget &&
      Math.abs(pageNumber - ctx.state.page.value) > KEEP_RADIUS
    ) {
      finishRender(ctx, pageNumber);
      continue;
    }
    const gen = ctx.generation;
    const slot: RenderSlot =
      ctx.slots.get(pageNumber) ??
      ({ handle: null, rendered: false } as RenderSlot);
    ctx.slots.set(pageNumber, slot);
    ctx.activeRenders += 1;
    const handle = renderPageInto(
      el,
      ctx.doc,
      pageNumber,
      ctx.state.scale.value,
      () =>
        gen === ctx.generation &&
        (pageNumber === ctx.navTarget ||
          Math.abs(pageNumber - ctx.state.page.value) <= KEEP_RADIUS),
    );
    slot.handle = handle;
    handle.promise
      .then(() => {
        if (gen !== ctx.generation) return;
        // The preview is painted; the handle stays set until the full-res
        // upgrade settles so eviction can cancel it.
        slot.rendered = true;
        ctx.afterRender?.(el);
      })
      .catch((renderError) => {
        if (gen !== ctx.generation) return;
        ctx.slots.delete(pageNumber);
        if (!isPdfRenderCancelled(renderError)) {
          console.error("Failed to render page", pageNumber, renderError);
        }
      })
      .finally(() => {
        ctx.activeRenders -= 1;
        if (gen === ctx.generation) {
          finishRender(ctx, pageNumber);
          if (ctx.activeRenders === 0) ctx.updateCurrentPage();
        }
        pumpQueue(ctx);
      });
    handle.full.finally(() => {
      if (gen === ctx.generation && ctx.slots.get(pageNumber) === slot) {
        slot.handle = null;
      }
    });
  }
}

function ensureRendered(
  ctx: PdfEngineContext,
  pageNumber: number,
  priority = 1,
): Promise<void> {
  if (!ctx.doc || !ctx.stage || !pageEl(ctx, pageNumber)) {
    return Promise.resolve();
  }
  if (ctx.slots.get(pageNumber)?.rendered) return Promise.resolve();
  const inflight = ctx.pendingRenders.get(pageNumber);
  if (inflight) return inflight;
  const promise = new Promise<void>((resolve) => {
    ctx.waiters.set(pageNumber, resolve);
    ctx.queue.push({ pageNumber, priority });
    sortQueue(ctx);
    pumpQueue(ctx);
  });
  ctx.pendingRenders.set(pageNumber, promise);
  return promise;
}

function observePages(ctx: PdfEngineContext) {
  if (!ctx.stage) return;
  ctx.observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          const number = Number((entry.target as HTMLElement).dataset.page);
          void ensureRendered(ctx, number, 1);
        }
      }
    },
    { root: ctx.stage, rootMargin: "800px 0px" },
  );
  pageElements(ctx).forEach((el) => ctx.observer?.observe(el));
}

/** Cancels in-flight renders and drops the queue/waiters for a rebuild. */
function resetRenders(ctx: PdfEngineContext) {
  for (const slot of ctx.slots.values()) slot.handle?.cancel();
  for (const resolve of ctx.waiters.values()) resolve();
  ctx.waiters.clear();
  ctx.pendingRenders.clear();
  ctx.queue.length = 0;
  ctx.slots.clear();
}

/** Bounded-concurrency page render queue with cancellation. */
export function createRenderQueue(ctx: PdfEngineContext) {
  return {
    sortQueue: () => sortQueue(ctx),
    finish: (pageNumber: number) => finishRender(ctx, pageNumber),
    pump: () => pumpQueue(ctx),
    ensureRendered: (pageNumber: number, priority?: number) =>
      ensureRendered(ctx, pageNumber, priority),
    observePages: () => observePages(ctx),
    resetRenders: () => resetRenders(ctx),
  };
}

export type PdfRenderQueue = ReturnType<typeof createRenderQueue>;
