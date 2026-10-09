import {
  createPdfEngineContext,
  pageEl,
  pageElements,
  type PdfEngineContext,
} from "../engine/engine-context.js";
import { evictIfNeeded } from "../engine/engine-evict.js";
import { createRenderQueue } from "../engine/engine-render.js";
import { createPageTracker } from "../engine/engine-scroll.js";
import { getPageSize, type PdfDocument } from "../pdf-document.js";
import { sourceKeyOf, sourceTypeOf, type PdfSourceRef } from "../source.js";
import { saveProgress, type PdfProgress } from "../storage.js";
import { ZOOM_LEVELS, type ReaderState } from "../stores/state.js";

export interface PdfEngine {
  attachStage(el: HTMLElement | null): void;
  detachStage(): void;
  setDocument(doc: PdfDocument, ref: PdfSourceRef): void;
  buildPages(preservePage: number): Promise<void>;
  goToPage(target: number): Promise<void>;
  zoomIn(): void;
  zoomOut(): void;
  zoomPercent(): string;
  pageElements(): HTMLElement[];
  setAfterRender(cb: (pageEl: HTMLElement) => void): void;
  getDoc(): PdfDocument | null;
  getCurrent(): PdfSourceRef | null;
  getStage(): HTMLElement | null;
  getRenderedCount(): number;
}

/**
 * pdf.js rendering engine: continuous page list, lazily rendered through a
 * bounded-concurrency queue, with cancellation and LRU eviction of far pages.
 * Non-reactive handles live on a context; subsystems are in `pdf/engine/`.
 */
export function usePdfEngine(state: ReaderState): PdfEngine {
  const ctx: PdfEngineContext = createPdfEngineContext(state);

  async function persistProgress() {
    if (!ctx.current) return;
    const entry: PdfProgress = {
      sourceKey: sourceKeyOf(ctx.current),
      sourceType: sourceTypeOf(ctx.current),
      page: state.page.value,
      pages: state.pages.value,
      title: state.label.value,
      updatedAt: new Date().toISOString(),
    };
    if (ctx.current.kind === "web") {
      entry.url = ctx.current.url;
    } else {
      entry.fingerprint = ctx.current.fingerprint;
    }
    await saveProgress(entry);
    state.persistedPage.value = entry.page;
  }

  function schedulePersist() {
    if (ctx.persistTimer !== null) clearTimeout(ctx.persistTimer);
    ctx.persistTimer = window.setTimeout(() => {
      void persistProgress();
    }, 300);
  }

  const queue = createRenderQueue(ctx);
  const tracker = createPageTracker(ctx, {
    queue,
    evictIfNeeded: (anchor) => evictIfNeeded(ctx, anchor),
    schedulePersist,
  });
  ctx.updateCurrentPage = tracker.updateCurrentPage;

  async function goToPage(target: number) {
    if (!ctx.doc || !ctx.stage) return;
    const next = Math.min(Math.max(1, target), state.pages.value || 1);
    ctx.navTarget = next;
    try {
      await queue.ensureRendered(next, 0);
      const el = pageEl(ctx, next);
      if (el) {
        const delta =
          el.getBoundingClientRect().top -
          ctx.stage.getBoundingClientRect().top;
        ctx.stage.scrollTop += delta;
      }
      state.page.value = next;
      // Persist off the navigation path so jumping does not wait on IndexedDB.
      schedulePersist();
      evictIfNeeded(ctx, next);
      void queue.ensureRendered(next + 1, 2);
      if (next > 1) void queue.ensureRendered(next - 1, 2);
    } finally {
      ctx.navTarget = null;
    }
  }

  async function buildPages(preservePage: number) {
    if (!ctx.stage || !ctx.doc) return;
    ctx.observer?.disconnect();
    ctx.observer = null;
    ctx.generation += 1;
    queue.resetRenders();
    ctx.stage.replaceChildren();
    const base = await getPageSize(ctx.doc, 1, state.scale.value);
    for (let index = 1; index <= state.pages.value; index += 1) {
      const el = document.createElement("div");
      el.className = "pdf-page";
      el.dataset.page = String(index);
      el.style.width = `${base.width}px`;
      el.style.height = `${base.height}px`;
      ctx.stage.append(el);
    }
    queue.observePages();
    await goToPage(preservePage);
  }

  function zoomStep(direction: "in" | "out") {
    if (!ctx.doc || state.status.value !== "ready") return;
    const sorted = [...ZOOM_LEVELS].sort((a, b) => a - b);
    const target =
      direction === "in"
        ? (sorted.find((level) => level > state.scale.value + 1e-6) ??
          sorted[sorted.length - 1])
        : ([...sorted]
            .reverse()
            .find((level) => level < state.scale.value - 1e-6) ?? sorted[0]);
    if (target === state.scale.value) return;
    state.scale.value = target;
    void buildPages(state.page.value);
  }

  function attachStage(el: HTMLElement | null) {
    if (!el) return;
    ctx.stage = el;
    ctx.stage.addEventListener("scroll", tracker.handleScroll, {
      passive: true,
    });
  }

  function detachStage() {
    if (!ctx.stage) return;
    ctx.stage.removeEventListener("scroll", tracker.handleScroll);
    ctx.observer?.disconnect();
    ctx.observer = null;
    if (ctx.persistTimer !== null) {
      clearTimeout(ctx.persistTimer);
      ctx.persistTimer = null;
    }
    if (ctx.scrollRaf !== 0) {
      window.cancelAnimationFrame(ctx.scrollRaf);
      ctx.scrollRaf = 0;
    }
    ctx.generation += 1;
    queue.resetRenders();
    ctx.stage = null;
  }

  return {
    attachStage,
    detachStage,
    setDocument(nextDoc, ref) {
      if (ctx.doc && ctx.doc !== nextDoc) {
        ctx.generation += 1;
        queue.resetRenders();
        void ctx.doc.cleanup().catch(() => {});
      }
      ctx.doc = nextDoc;
      ctx.current = ref;
    },
    buildPages,
    goToPage,
    zoomIn: () => zoomStep("in"),
    zoomOut: () => zoomStep("out"),
    zoomPercent: () => `${Math.round(state.scale.value * 100)}%`,
    pageElements: () => pageElements(ctx),
    setAfterRender(cb) {
      ctx.afterRender = cb;
    },
    getDoc: () => ctx.doc,
    getCurrent: () => ctx.current,
    getStage: () => ctx.stage,
    getRenderedCount: () =>
      [...ctx.slots.values()].filter((slot) => slot.rendered).length,
  };
}
