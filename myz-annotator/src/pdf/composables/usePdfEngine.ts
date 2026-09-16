import {
  getPageSize,
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

/**
 * pdf.js rendering engine: continuous page list, lazy render, scroll tracking,
 * zoom and reading-progress persistence. Holds the non-reactive handles
 * (`doc`, `observer`, `rendered`, timers) that must not be tracked by Vue.
 */
export function usePdfEngine(state: ReaderState): PdfEngine {
  let doc: PdfDocument | null = null;
  let current: PdfSourceRef | null = null;
  let stage: HTMLElement | null = null;
  let observer: IntersectionObserver | null = null;
  let persistTimer: number | null = null;
  let activeRenders = 0;
  let scrollCheckPending = false;
  let afterRender: ((pageEl: HTMLElement) => void) | null = null;
  const rendered = new Set<number>();

  function pageElements(): HTMLElement[] {
    if (!stage) {
      return [];
    }
    return Array.from(stage.querySelectorAll<HTMLElement>(".pdf-page"));
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

  async function ensureRendered(pageNumber: number) {
    if (!doc || rendered.has(pageNumber)) {
      return;
    }
    const el = stage?.querySelector<HTMLElement>(
      `.pdf-page[data-page="${pageNumber}"]`,
    );
    if (!el) {
      return;
    }
    rendered.add(pageNumber);
    activeRenders += 1;
    try {
      await renderPageInto(el, doc, pageNumber, state.scale.value);
      afterRender?.(el);
    } catch (renderError) {
      rendered.delete(pageNumber);
      console.error("Failed to render page", pageNumber, renderError);
    } finally {
      activeRenders -= 1;
      if (activeRenders === 0 && scrollCheckPending) {
        scrollCheckPending = false;
        updateCurrentPage();
      }
    }
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
    }
  }

  function handleScroll() {
    // Ignore transient layout shifts while pages are still rendering;
    // re-check once rendering settles.
    if (activeRenders > 0) {
      scrollCheckPending = true;
      return;
    }
    updateCurrentPage();
  }

  async function goToPage(target: number) {
    if (!doc || !stage) {
      return;
    }
    const next = Math.min(Math.max(1, target), state.pages.value || 1);
    await ensureRendered(next);
    const el = stage.querySelector<HTMLElement>(
      `.pdf-page[data-page="${next}"]`,
    );
    if (el) {
      const delta =
        el.getBoundingClientRect().top - stage.getBoundingClientRect().top;
      stage.scrollTop += delta;
    }
    state.page.value = next;
    await persistProgress();
    void ensureRendered(next + 1);
    if (next > 1) {
      void ensureRendered(next - 1);
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
            void ensureRendered(number);
          }
        }
      },
      { root: stage, rootMargin: "800px 0px" },
    );
    pageElements().forEach((el) => observer?.observe(el));
  }

  async function buildPages(preservePage: number) {
    if (!stage || !doc) {
      return;
    }
    observer?.disconnect();
    observer = null;
    rendered.clear();
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
    await ensureRendered(preservePage);
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
    stage = null;
  }

  return {
    attachStage,
    detachStage,
    setDocument(nextDoc, ref) {
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
    getRenderedCount: () => rendered.size,
  };
}
