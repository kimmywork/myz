import {
  HIGHLIGHT_STYLES,
  RECORD_KINDS,
  type MyZRecord,
} from "@myz/shared/types";
import { onBeforeUnmount, onMounted, ref, watch, type Ref } from "vue";
import type { useEpubReaderStore } from "../stores/reader-store.js";
import { createEpubBackdoor } from "./epub-backdoor.js";
import {
  collectChapterAnchors,
  framePoint,
  updateCurrentFromScroll,
  type ChapterAnchor,
} from "./epub-frame.js";
import { subscribeRefresh } from "@/messaging/changeRefresh";

type Store = ReturnType<typeof useEpubReaderStore>;

interface FrameState {
  selectionToolbar: Ref<{
    top: number;
    left: number;
    bottom: number;
  } | null>;
  activeId: Ref<string | null>;
  pendingRange: Ref<Range | null>;
}

/** Publishes the iframe selection to the reader toolbar. */
function handleFrameSelection(
  state: FrameState,
  doc: Document,
  frame: HTMLIFrameElement,
): void {
  const selection = doc.getSelection();
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
    state.selectionToolbar.value = null;
    state.pendingRange.value = null;
    return;
  }
  const range = selection.getRangeAt(0);
  if (!range.toString().trim()) {
    state.selectionToolbar.value = null;
    state.pendingRange.value = null;
    return;
  }
  state.pendingRange.value = range;
  state.selectionToolbar.value = framePoint(
    frame,
    range.getBoundingClientRect(),
  );
  state.activeId.value = null;
}

/** Scrolls the chapter frame so a highlight is centered. */
function scrollFrameToHighlight(
  iframeRef: Ref<HTMLIFrameElement | null>,
  id: string,
): void {
  const doc = iframeRef.value?.contentDocument;
  const el = doc?.querySelector(`.myz-highlight[data-highlight-id="${id}"]`);
  el?.scrollIntoView({ block: "center" });
}

/** Opens the record's chapter if needed, then reveals its highlight. */
function focusFrameRecord(
  store: Store,
  state: FrameState,
  focus: { id: string | null },
  iframeRef: Ref<HTMLIFrameElement | null>,
  record: MyZRecord,
): void {
  const target = record.epubLocator?.spineIndex ?? 0;
  if (target !== store.spineIndex) {
    focus.id = record.id;
    store.goToChapter(target);
    return;
  }
  state.activeId.value = record.id;
  scrollFrameToHighlight(iframeRef, record.id);
}

/** Handles in-chapter links and highlight selection clicks. */
function handleFrameHighlightClick(
  store: Store,
  state: FrameState,
  event: Event,
): void {
  const anchor = (event.target as Element | null)?.closest?.("a[href]");
  if (anchor) {
    const internalHref = anchor.getAttribute("data-epub-href");
    const href = anchor.getAttribute("href") || "";
    if (internalHref) {
      event.preventDefault();
      store.openInternalHref(internalHref);
      return;
    }
    if (/^https?:/i.test(href)) {
      event.preventDefault();
      chrome.tabs.create({ url: href });
      return;
    }
  }
  const target = (event.target as Element | null)?.closest?.(".myz-highlight");
  const id = target?.getAttribute("data-highlight-id");
  if (!target || !id) return;
  state.activeId.value = id;
  state.selectionToolbar.value = null;
  state.pendingRange.value = null;
}

/**
 * Owns the EPUB iframe document lifecycle: frame events, scroll tracking,
 * TOC-anchor highlighting, capture toolbar and the e2e backdoor.
 */
export function useEpubFrame(store: Store) {
  const iframeRef = ref<HTMLIFrameElement | null>(null);
  const selectionToolbar = ref<{
    top: number;
    left: number;
    bottom: number;
  } | null>(null);
  const activeId = ref<string | null>(null);
  const pendingRange = ref<Range | null>(null);
  const state: FrameState = { selectionToolbar, activeId, pendingRange };
  const focus: { id: string | null } = { id: null };
  let chapterAnchors: ChapterAnchor[] = [];
  let attachedWindow: Window | null = null;
  let scrollHandler: (() => void) | null = null;
  let frameObserver: ResizeObserver | null = null;

  function repaint() {
    const doc = iframeRef.value?.contentDocument;
    if (doc) store.applyCurrentChapter(doc);
  }

  async function saveActive(patch: {
    note: string;
    tags: string[];
    color?: string;
    style?: HIGHLIGHT_STYLES;
  }) {
    const id = activeId.value;
    if (!id) return;
    await store.updateRecord(id, patch);
    repaint();
  }

  function clearSelection() {
    iframeRef.value?.contentWindow?.getSelection()?.removeAllRanges();
    pendingRange.value = null;
    selectionToolbar.value = null;
  }

  async function createFromSelection(kind: RECORD_KINDS) {
    const range = pendingRange.value;
    if (!range) return;
    await store.createHighlight(range, kind);
    clearSelection();
    repaint();
  }

  async function deleteActive() {
    const id = activeId.value;
    if (!id) return;
    activeId.value = null;
    await store.deleteRecord(id);
    repaint();
  }

  function scrollToFragment(fragment: string): boolean {
    const doc = iframeRef.value?.contentDocument;
    if (!doc || !fragment) return false;
    const target = doc.getElementById(fragment);
    if (!target) return false;
    target.scrollIntoView();
    store.pendingFragment = "";
    return true;
  }

  function handleFrameLoad() {
    const frame = iframeRef.value;
    const win = frame?.contentWindow;
    const doc = frame?.contentDocument;
    if (!frame || !win || !doc) return;
    const ratio = store.pendingProgression;
    const maxScroll = Math.max(
      0,
      doc.documentElement.scrollHeight - frame.clientHeight,
    );
    if (!scrollToFragment(store.pendingFragment)) {
      if (ratio > 0 && maxScroll > 0) {
        win.scrollTo(0, ratio * maxScroll);
      } else {
        win.scrollTo(0, 0);
      }
    }

    if (attachedWindow && scrollHandler) {
      attachedWindow.removeEventListener("scroll", scrollHandler);
    }
    attachedWindow = win;
    scrollHandler = () => {
      const height = doc.documentElement.scrollHeight - frame.clientHeight;
      if (height > 0) store.setProgression(win.scrollY / height);
      updateCurrentFromScroll(chapterAnchors, store);
      store.syncBilingualScroll();
    };
    win.addEventListener("scroll", scrollHandler, { passive: true });

    doc.addEventListener("mouseup", () =>
      handleFrameSelection(state, doc, frame),
    );
    doc.addEventListener("keyup", () =>
      handleFrameSelection(state, doc, frame),
    );
    doc.addEventListener("selectionchange", () => {
      const selection = doc.getSelection();
      if (!selection || selection.isCollapsed || !selection.toString().trim()) {
        selectionToolbar.value = null;
        pendingRange.value = null;
        return;
      }
      handleFrameSelection(state, doc, frame);
    });
    doc.addEventListener("click", (event) =>
      handleFrameHighlightClick(store, state, event),
    );
    // Sidebar toggles and the bilingual column itself change the frame width,
    // which reflows the chapter: re-measure blocks once the layout settles.
    frameObserver?.disconnect();
    if (typeof ResizeObserver !== "undefined") {
      frameObserver = new ResizeObserver(() => store.refreshBilingual());
      frameObserver.observe(frame);
    }
    window.setTimeout(() => {
      store.applyCurrentChapter(doc);
      chapterAnchors = collectChapterAnchors(doc, store);
      updateCurrentFromScroll(chapterAnchors, store);
      store.expandTocPath(store.currentTocHref);
      store.setBilingualFrame(doc, win);
      if (focus.id) {
        const id = focus.id;
        focus.id = null;
        activeId.value = id;
        scrollFrameToHighlight(iframeRef, id);
      }
    }, 0);
  }

  watch(
    () => store.chapterHtml,
    () => {
      selectionToolbar.value = null;
      activeId.value = null;
      pendingRange.value = null;
      store.clearBilingual();
    },
  );

  watch(
    () => store.pendingFragment,
    (fragment) => {
      if (fragment) scrollToFragment(fragment);
    },
  );

  watch(
    () => store.currentTocHref,
    (href) => {
      if (href) store.expandTocPath(href);
    },
  );

  function handleKeydown(event: KeyboardEvent) {
    const target = event.target as HTMLElement | null;
    if (
      target &&
      (target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable)
    ) {
      return;
    }
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    if (event.key === "Escape") {
      if (activeId.value) {
        activeId.value = null;
      } else if (store.sidebarOpen) {
        store.sidebarOpen = false;
      }
      return;
    }
    if (!store.book) return;
    if (event.key === "ArrowRight" || event.key === "PageDown") {
      event.preventDefault();
      store.goToChapter(store.spineIndex + 1);
    } else if (event.key === "ArrowLeft" || event.key === "PageUp") {
      event.preventDefault();
      store.goToChapter(store.spineIndex - 1);
    }
  }

  let unsubscribe: (() => void) | null = null;
  let pendingRefresh = false;

  /** Reload + repaint, deferring while an annotation edit is open. */
  function refreshFromRemote() {
    if (store.status !== "ready") return;
    if (activeId.value) {
      pendingRefresh = true;
      return;
    }
    void store.loadRecords().then(() => {
      // The user may have opened an annotation while the load was in flight.
      if (activeId.value) {
        pendingRefresh = true;
        return;
      }
      pendingRefresh = false;
      const doc = iframeRef.value?.contentDocument;
      if (doc) store.applyCurrentChapter(doc);
    });
  }

  onMounted(() => {
    store.init();
    window.addEventListener("keydown", handleKeydown);
    // Pick up records applied by a sync or another tab, but never clobber an
    // annotation the user is editing.
    unsubscribe = subscribeRefresh(["records", "sync"], refreshFromRemote);
    // Run a refresh that was deferred while editing once the edit closes.
    watch(activeId, (id) => {
      if (!id && pendingRefresh) refreshFromRemote();
    });
    const backdoor = createEpubBackdoor(
      store,
      () => iframeRef.value?.contentDocument ?? null,
    );
    (window as unknown as { __MYZ_EPUB__: typeof backdoor }).__MYZ_EPUB__ =
      backdoor;
  });

  onBeforeUnmount(() => {
    window.removeEventListener("keydown", handleKeydown);
    frameObserver?.disconnect();
    frameObserver = null;
    unsubscribe?.();
  });

  return {
    iframeRef,
    selectionToolbar,
    activeId,
    pendingRange,
    handleFrameLoad,
    focusRecord: (record: MyZRecord) =>
      focusFrameRecord(store, state, focus, iframeRef, record),
    saveActive,
    deleteActive,
    clearSelection,
    createFromSelection,
  };
}

export type EpubFrame = ReturnType<typeof useEpubFrame>;
