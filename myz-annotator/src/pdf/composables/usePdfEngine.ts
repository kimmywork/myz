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
/** Soft cap on resident canvas memory (bytes); farthest pages evict first. */
const MAX_RESIDENT_BYTES = 384 * 1024 * 1024;

interface RenderSlot {
  handle: { cancel: () => void } | null;
  rendered: boolean;
  bytes: number;
  lastSeen: number;
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
  let scrollCheckPending = false;
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

  function evictIfNeeded() {
    if (slots.size === 0) {
      return;
    }
    const currentPage = state.page.value;
    // Abandon in-flight renders that scrolled far away before finishing.
    for (const [pageNumber, slot] of [...slots.entries()]) {
      if (
        !slot.rendered &&
        slot.handle &&
        Math.abs(pageNumber - currentPage) > KEEP_RADIUS
      ) {
        slot.handle.cancel();
      }
    }
    const rendered = [...slots.entries()].filter(([, slot]) => slot.rendered);
    let totalBytes = rendered.reduce((sum, [, slot]) => sum + slot.bytes, 0);
    const byDistance = [...rendered].sort(
      (a, b) => Math.abs(b[0] - currentPage) - Math.abs(a[0] - currentPage),
    );
    for (const [pageNumber, slot] of byDistance) {
      const far = Math.abs(pageNumber - currentPage) > KEEP_RADIUS;
      if (!far && totalBytes <= MAX_RESIDENT_BYTES) {
        continue;
      }
      evict(pageNumber);
      totalBytes -= slot.bytes;
    }
  }

  function pump() {
    if (!doc || !stage) {
      return;
    }
    while (activeRenders < MAX_CONCURRENT_RENDERS && queue.length > 0) {
      const { pageNumber } = queue.shift()!;
      const el = pageEl(pageNumber);
      if (!el || slots.get(pageNumber)?.rendered) {
        finish(pageNumber);
        continue;
      }
      const gen = generation;
      const slot: RenderSlot =
        slots.get(pageNumber) ??
        ({
          handle: null,
          rendered: false,
          bytes: 0,
          lastSeen: 0,
        } as RenderSlot);
      slots.set(pageNumber, slot);
      activeRenders += 1;
      const handle = renderPageInto(el, doc, pageNumber, state.scale.value);
      slot.handle = handle;
      handle.promise
        .then(() => {
          if (gen !== generation) {
            return;
          }
          slot.rendered = true;
          slot.handle = null;
          slot.bytes = estimateBytes(el);
          slot.lastSeen = Date.now();
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
            evictIfNeeded();
          }
          if (activeRenders === 0 && scrollCheckPending) {
            scrollCheckPending = false;
            updateCurrentPage();
          }
          pump();
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

  function computeCurrentPage(): number {
    if (!stage) {
      return state.page.value;
    }
    const middle = stage.getBoundingClientRect().top + stage.clientHeight / 2;
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

  function updateCurrentPage() {
    const next = computeCurrentPage();
    if (next !== state.page.value) {
      state.page.value = next;
      schedulePersist();
      evictIfNeeded();
    }
  }

  function handleScroll() {
    // Ignore transient layout shifts while pages are still rendering;
    // re-check once rendering settles.
    if (activeRenders > 0) {
      scrollCheckPending = true;
      return;
    }
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
    evictIfNeeded();
    void ensureRendered(next + 1, 2);
    if (next > 1) {
      void ensureRendered(next - 1, 2);
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
