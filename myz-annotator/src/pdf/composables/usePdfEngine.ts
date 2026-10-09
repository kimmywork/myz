import {
  getPageSize,
  isPdfRenderCancelled,
  renderPageInto,
  type PdfDocument,
} from "../pdf-document.js";
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

/** Maximum number of page renders decoding at once. */
const MAX_CONCURRENT_RENDERS = 3;
/** Keep rendered pages within this distance (in pages) of the current one. */
const KEEP_RADIUS = 8;
/** Never evict a rendered page within this many px of the viewport. */
const KEEP_MARGIN_PX = 1600;
/** Soft cap on resident canvas memory (bytes); farthest pages evict first. */
const MAX_RESIDENT_BYTES = 384 * 1024 * 1024;

interface RenderSlot {
  handle: { cancel: () => void } | null;
  rendered: boolean;
}

interface QueuedRender {
  pageNumber: number;
  /** 0 = navigation target (jump the queue), 1 = viewport, 2 = prefetch. */
  priority: number;
}

/**
 * pdf.js rendering engine: continuous page list, lazily rendered through a
 * bounded-concurrency queue, with cancellation and LRU eviction of far pages.
 * Holds the non-reactive handles (`doc`, `observer`, `slots`, timers) that must
 * not be tracked by Vue.
 */
export function usePdfEngine(state: ReaderState): PdfEngine {
  let doc: PdfDocument | null = null;
  let current: PdfSourceRef | null = null;
  let stage: HTMLElement | null = null;
  let observer: IntersectionObserver | null = null;
  let persistTimer: number | null = null;
  let scrollRaf = 0;
  let activeRenders = 0;
  /** Page explicitly requested by navigation; never dropped/cancelled. */
  let navTarget: number | null = null;
  let afterRender: ((pageEl: HTMLElement) => void) | null = null;
  /** Bumped on every rebuild so stale render callbacks are ignored. */
  let generation = 0;
  const slots = new Map<number, RenderSlot>();
  const waiters = new Map<number, () => void>();
  const pendingRenders = new Map<number, Promise<void>>();
  const queue: QueuedRender[] = [];

  function pageElements(): HTMLElement[] {
    if (!stage) {
      return [];
    }
    return Array.from(stage.querySelectorAll<HTMLElement>(".pdf-page"));
  }

  function pageEl(pageNumber: number): HTMLElement | null {
    return (
      stage?.querySelector<HTMLElement>(
        `.pdf-page[data-page="${pageNumber}"]`,
      ) ?? null
    );
  }

  async function persistProgress() {
    if (!current) {
      return;
    }
    const entry: PdfProgress = {
      sourceKey: sourceKeyOf(current),
      sourceType: sourceTypeOf(current),
      page: state.page.value,
      pages: state.pages.value,
      title: state.label.value,
      updatedAt: new Date().toISOString(),
    };
    if (current.kind === "web") {
      entry.url = current.url;
    } else {
      entry.fingerprint = current.fingerprint;
    }
    await saveProgress(entry);
    state.persistedPage.value = entry.page;
  }

  function schedulePersist() {
    if (persistTimer !== null) {
      clearTimeout(persistTimer);
    }
    persistTimer = window.setTimeout(() => {
      void persistProgress();
    }, 300);
  }

  /** Approximate resident memory of a rendered page's canvas. */
  function estimateBytes(el: HTMLElement): number {
    const canvas = el.querySelector("canvas");
    if (!canvas) {
      return 0;
    }
    return canvas.width * canvas.height * 4;
  }

  function sortQueue() {
    const currentPage = state.page.value;
    queue.sort(
      (a, b) =>
        a.priority - b.priority ||
        Math.abs(a.pageNumber - currentPage) -
          Math.abs(b.pageNumber - currentPage),
    );
  }

  function finish(pageNumber: number) {
    const resolve = waiters.get(pageNumber);
    waiters.delete(pageNumber);
    pendingRenders.delete(pageNumber);
    resolve?.();
  }

  /** Drops the rendered bitmap/text layer of a page while keeping its box. */
  function evict(pageNumber: number) {
    const slot = slots.get(pageNumber);
    if (!slot || !slot.rendered) {
      return;
    }
    slot.handle?.cancel();
    slot.handle = null;
    slot.rendered = false;
    const el = pageEl(pageNumber);
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
    slots.delete(pageNumber);
  }

  /**
   * Releases far-away rendered pages. `anchorPage` must be the page actually at
   * the viewport centre (computed fresh), never the possibly-stale
   * `state.page`; otherwise a page the user just jumped to would be evicted
   * immediately and stay blank until the IntersectionObserver fires again.
   *
   * Only completed renders are evicted. In-flight renders are left alone so a
   * page the user is waiting for is never cancelled.
   */
  function evictIfNeeded(anchorPage: number) {
    if (slots.size === 0 || !stage) {
      return;
    }
    const stageRect = stage.getBoundingClientRect();
    const rendered = [...slots.entries()].filter(([, slot]) => slot.rendered);
    const bytesOf = (pageNumber: number): number => {
      const el = pageEl(pageNumber);
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
      if (!far && totalBytes <= MAX_RESIDENT_BYTES) {
        continue;
      }
      // Never evict a page that is still near the viewport: the
      // IntersectionObserver only fires on intersection *changes*, so an
      // evicted-but-visible page would stay blank until the user scrolls.
      const el = pageEl(pageNumber);
      if (el) {
        const rect = el.getBoundingClientRect();
        const nearViewport =
          rect.bottom > stageRect.top - KEEP_MARGIN_PX &&
          rect.top < stageRect.bottom + KEEP_MARGIN_PX;
        if (nearViewport) {
          continue;
        }
      }
      const bytes = bytesOf(pageNumber);
      evict(pageNumber);
      totalBytes -= bytes;
    }
  }

  function pump() {
    if (!doc || !stage) {
      return;
    }
    // While the page at the viewport centre is still unrendered, render it
    // alone so a jump lands on a painted page as fast as possible instead of
    // competing with neighbour decodes for CPU.
    const focusPage = state.page.value;
    const focusWaiting =
      !slots.get(focusPage)?.rendered && pendingRenders.has(focusPage);
    const limit = focusWaiting ? 1 : MAX_CONCURRENT_RENDERS;
    while (activeRenders < limit && queue.length > 0) {
      const { pageNumber } = queue.shift()!;
      const el = pageEl(pageNumber);
      if (!el || slots.get(pageNumber)?.rendered) {
        finish(pageNumber);
        continue;
      }
      // Drop work for pages that scrolled far away instead of decoding them.
      // They are outside the observer margin, so the observer re-enqueues them
      // if the user scrolls back.
      if (
        pageNumber !== navTarget &&
        Math.abs(pageNumber - state.page.value) > KEEP_RADIUS
      ) {
        finish(pageNumber);
        continue;
      }
      const gen = generation;
      const slot: RenderSlot =
        slots.get(pageNumber) ??
        ({ handle: null, rendered: false } as RenderSlot);
      slots.set(pageNumber, slot);
      activeRenders += 1;
      const handle = renderPageInto(
        el,
        doc,
        pageNumber,
        state.scale.value,
        () =>
          gen === generation &&
          (pageNumber === navTarget ||
            Math.abs(pageNumber - state.page.value) <= KEEP_RADIUS),
      );
      slot.handle = handle;
      handle.promise
        .then(() => {
          if (gen !== generation) {
            return;
          }
          // The preview is painted: the page is visible. The handle stays set
          // until the full-resolution upgrade settles so eviction can cancel it.
          slot.rendered = true;
          afterRender?.(el);
        })
        .catch((renderError) => {
          if (gen !== generation) {
            return;
          }
          slots.delete(pageNumber);
          if (!isPdfRenderCancelled(renderError)) {
            console.error("Failed to render page", pageNumber, renderError);
          }
        })
        .finally(() => {
          activeRenders -= 1;
          if (gen === generation) {
            finish(pageNumber);
            // Once a batch settles, recompute the real viewport page (which may
            // have moved while renders were in flight) before evicting.
            if (activeRenders === 0) {
              updateCurrentPage();
            }
          }
          pump();
        });
      handle.full.finally(() => {
        if (gen === generation && slots.get(pageNumber) === slot) {
          slot.handle = null;
        }
      });
    }
  }

  function ensureRendered(pageNumber: number, priority = 1): Promise<void> {
    if (!doc || !stage || !pageEl(pageNumber)) {
      return Promise.resolve();
    }
    if (slots.get(pageNumber)?.rendered) {
      return Promise.resolve();
    }
    const inflight = pendingRenders.get(pageNumber);
    if (inflight) {
      return inflight;
    }
    const promise = new Promise<void>((resolve) => {
      waiters.set(pageNumber, resolve);
      queue.push({ pageNumber, priority });
      sortQueue();
      pump();
    });
    pendingRenders.set(pageNumber, promise);
    return promise;
  }

  /**
   * Page under the viewport centre. `elementFromPoint` is O(1) and avoids the
   * per-frame O(N) layout reads of scanning every placeholder; the scan is only
   * a fallback for when the centre lands in a gap between pages.
   */
  function computeCurrentPage(): number {
    if (!stage) {
      return state.page.value;
    }
    const rect = stage.getBoundingClientRect();
    const hit = document.elementFromPoint(
      rect.left + rect.width / 2,
      rect.top + rect.height / 2,
    );
    const under = hit?.closest<HTMLElement>(".pdf-page");
    if (under?.dataset.page) {
      return Number(under.dataset.page);
    }
    const middle = rect.top + stage.clientHeight / 2;
    const elements = pageElements();
    for (const el of elements) {
      if (middle < el.getBoundingClientRect().bottom) {
        return Number(el.dataset.page || 1);
      }
    }
    return elements.length
      ? Number(elements[elements.length - 1].dataset.page || state.pages.value)
      : 1;
  }

  /** Cancels in-flight renders that have scrolled far from the viewport. */
  function cancelFarInFlight(anchorPage: number) {
    for (const [pageNumber, slot] of slots) {
      if (
        !slot.rendered &&
        slot.handle &&
        pageNumber !== navTarget &&
        Math.abs(pageNumber - anchorPage) > KEEP_RADIUS
      ) {
        slot.handle.cancel();
      }
    }
  }

  function updateCurrentPage() {
    const next = computeCurrentPage();
    if (next !== state.page.value) {
      state.page.value = next;
      schedulePersist();
    }
    // Keep queue order and in-flight work aligned with where the user actually
    // is, even while a render batch is still running.
    sortQueue();
    cancelFarInFlight(next);
    if (activeRenders === 0) {
      evictIfNeeded(next);
    }
  }

  function handleScroll() {
    if (scrollRaf !== 0) {
      return;
    }
    scrollRaf = window.requestAnimationFrame(() => {
      scrollRaf = 0;
      updateCurrentPage();
    });
  }

  async function goToPage(target: number) {
    if (!doc || !stage) {
      return;
    }
    const next = Math.min(Math.max(1, target), state.pages.value || 1);
    navTarget = next;
    try {
      await ensureRendered(next, 0);
      const el = pageEl(next);
      if (el) {
        const delta =
          el.getBoundingClientRect().top - stage.getBoundingClientRect().top;
        stage.scrollTop += delta;
      }
      state.page.value = next;
      // Persist off the navigation path so jumping does not wait on IndexedDB.
      schedulePersist();
      evictIfNeeded(next);
      void ensureRendered(next + 1, 2);
      if (next > 1) {
        void ensureRendered(next - 1, 2);
      }
    } finally {
      navTarget = null;
    }
  }

  function observePages() {
    if (!stage) {
      return;
    }
    observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const number = Number((entry.target as HTMLElement).dataset.page);
            void ensureRendered(number, 1);
          }
        }
      },
      { root: stage, rootMargin: "800px 0px" },
    );
    pageElements().forEach((el) => observer?.observe(el));
  }

  /** Cancels in-flight renders and drops the queue/waiters for a rebuild. */
  function resetRenders() {
    for (const slot of slots.values()) {
      slot.handle?.cancel();
    }
    for (const resolve of waiters.values()) {
      resolve();
    }
    waiters.clear();
    pendingRenders.clear();
    queue.length = 0;
    slots.clear();
  }

  async function buildPages(preservePage: number) {
    if (!stage || !doc) {
      return;
    }
    observer?.disconnect();
    observer = null;
    generation += 1;
    resetRenders();
    stage.replaceChildren();
    const base = await getPageSize(doc, 1, state.scale.value);
    for (let index = 1; index <= state.pages.value; index += 1) {
      const el = document.createElement("div");
      el.className = "pdf-page";
      el.dataset.page = String(index);
      el.style.width = `${base.width}px`;
      el.style.height = `${base.height}px`;
      stage.append(el);
    }
    observePages();
    await goToPage(preservePage);
  }

  function zoomStep(direction: "in" | "out") {
    if (!doc || state.status.value !== "ready") {
      return;
    }
    const sorted = [...ZOOM_LEVELS].sort((a, b) => a - b);
    const target =
      direction === "in"
        ? (sorted.find((level) => level > state.scale.value + 1e-6) ??
          sorted[sorted.length - 1])
        : ([...sorted]
            .reverse()
            .find((level) => level < state.scale.value - 1e-6) ?? sorted[0]);
    if (target === state.scale.value) {
      return;
    }
    state.scale.value = target;
    void buildPages(state.page.value);
  }

  function attachStage(el: HTMLElement | null) {
    if (!el) {
      return;
    }
    stage = el;
    stage.addEventListener("scroll", handleScroll, { passive: true });
  }

  function detachStage() {
    if (!stage) {
      return;
    }
    stage.removeEventListener("scroll", handleScroll);
    observer?.disconnect();
    observer = null;
    if (persistTimer !== null) {
      clearTimeout(persistTimer);
      persistTimer = null;
    }
    if (scrollRaf !== 0) {
      window.cancelAnimationFrame(scrollRaf);
      scrollRaf = 0;
    }
    generation += 1;
    resetRenders();
    stage = null;
  }

  return {
    attachStage,
    detachStage,
    setDocument(nextDoc, ref) {
      if (doc && doc !== nextDoc) {
        generation += 1;
        resetRenders();
        void doc.cleanup().catch(() => {});
      }
      doc = nextDoc;
      current = ref;
    },
    buildPages,
    goToPage,
    zoomIn: () => zoomStep("in"),
    zoomOut: () => zoomStep("out"),
    zoomPercent: () => `${Math.round(state.scale.value * 100)}%`,
    pageElements,
    setAfterRender(cb) {
      afterRender = cb;
    },
    getDoc: () => doc,
    getCurrent: () => current,
    getStage: () => stage,
    getRenderedCount: () =>
      [...slots.values()].filter((slot) => slot.rendered).length,
  };
}
