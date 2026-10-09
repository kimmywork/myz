import type { PdfDocument } from "../pdf-document.js";
import type { PdfSourceRef } from "../source.js";
import type { ReaderState } from "../stores/state.js";

export interface RenderSlot {
  handle: { cancel: () => void } | null;
  rendered: boolean;
}

export interface QueuedRender {
  pageNumber: number;
  /** 0 = navigation target (jump the queue), 1 = viewport, 2 = prefetch. */
  priority: number;
}

/** Maximum number of page renders decoding at once. */
export const MAX_CONCURRENT_RENDERS = 3;
/** Keep rendered pages within this distance (in pages) of the current one. */
export const KEEP_RADIUS = 8;
/** Never evict a rendered page within this many px of the viewport. */
export const KEEP_MARGIN_PX = 1600;
/** Soft cap on resident canvas memory (bytes); farthest pages evict first. */
export const MAX_RESIDENT_BYTES = 384 * 1024 * 1024;

/** Mutable, non-reactive engine state shared by the extracted subsystems. */
export interface PdfEngineContext {
  state: ReaderState;
  doc: PdfDocument | null;
  current: PdfSourceRef | null;
  stage: HTMLElement | null;
  observer: IntersectionObserver | null;
  persistTimer: number | null;
  scrollRaf: number;
  activeRenders: number;
  navTarget: number | null;
  afterRender: ((pageEl: HTMLElement) => void) | null;
  generation: number;
  slots: Map<number, RenderSlot>;
  waiters: Map<number, () => void>;
  pendingRenders: Map<number, Promise<void>>;
  queue: QueuedRender[];
  /** Assigned by the page tracker; called by the render queue when idle. */
  updateCurrentPage: () => void;
}

export function createPdfEngineContext(state: ReaderState): PdfEngineContext {
  return {
    state,
    doc: null,
    current: null,
    stage: null,
    observer: null,
    persistTimer: null,
    scrollRaf: 0,
    activeRenders: 0,
    navTarget: null,
    afterRender: null,
    generation: 0,
    slots: new Map(),
    waiters: new Map(),
    pendingRenders: new Map(),
    queue: [],
    updateCurrentPage: () => {},
  };
}

export function pageElements(ctx: PdfEngineContext): HTMLElement[] {
  if (!ctx.stage) return [];
  return Array.from(ctx.stage.querySelectorAll<HTMLElement>(".pdf-page"));
}

export function pageEl(
  ctx: PdfEngineContext,
  pageNumber: number,
): HTMLElement | null {
  return (
    ctx.stage?.querySelector<HTMLElement>(
      `.pdf-page[data-page="${pageNumber}"]`,
    ) ?? null
  );
}
