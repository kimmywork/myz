import {
  HIGHLIGHT_STYLES,
  RECORD_KINDS,
  type MyZRecord,
} from "@myz/shared/types";
import { onBeforeUnmount, onMounted, ref, watch } from "vue";
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
  let pendingFocusId: string | null = null;
  let chapterAnchors: ChapterAnchor[] = [];
  let attachedWindow: Window | null = null;
  let scrollHandler: (() => void) | null = null;

  function handleSelection(doc: Document, frame: HTMLIFrameElement) {
    const selection = doc.getSelection();
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
      selectionToolbar.value = null;
      pendingRange.value = null;
      return;
    }
    const range = selection.getRangeAt(0);
    if (!range.toString().trim()) {
      selectionToolbar.value = null;
      pendingRange.value = null;
      return;
    }
    pendingRange.value = range;
    selectionToolbar.value = framePoint(frame, range.getBoundingClientRect());
    activeId.value = null;
  }

  function scrollToHighlight(id: string) {
    const doc = iframeRef.value?.contentDocument;
    const el = doc?.querySelector(`.myz-highlight[data-highlight-id="${id}"]`);
    el?.scrollIntoView({ block: "center" });
  }

  function focusRecord(record: MyZRecord) {
    const target = record.epubLocator?.spineIndex ?? 0;
    if (target !== store.spineIndex) {
      pendingFocusId = record.id;
      store.goToChapter(target);
      return;
    }
    activeId.value = record.id;
    scrollToHighlight(record.id);
  }

  function handleHighlightClick(event: Event) {
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
    const target = (event.target as Element | null)?.closest?.(
      ".myz-highlight",
    );
    const id = target?.getAttribute("data-highlight-id");
    if (!target || !id) return;
    activeId.value = id;
    selectionToolbar.value = null;
    pendingRange.value = null;
  }

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
    };
    win.addEventListener("scroll", scrollHandler, { passive: true });

    doc.addEventListener("mouseup", () => handleSelection(doc, frame));
    doc.addEventListener("keyup", () => handleSelection(doc, frame));
    doc.addEventListener("selectionchange", () => {
      const selection = doc.getSelection();
      if (!selection || selection.isCollapsed || !selection.toString().trim()) {
        selectionToolbar.value = null;
        pendingRange.value = null;
        return;
      }
      handleSelection(doc, frame);
    });
    doc.addEventListener("click", (event) => handleHighlightClick(event));
    window.setTimeout(() => {
      store.applyCurrentChapter(doc);
      chapterAnchors = collectChapterAnchors(doc, store);
      updateCurrentFromScroll(chapterAnchors, store);
      store.expandTocPath(store.currentTocHref);
      if (pendingFocusId) {
        const id = pendingFocusId;
        pendingFocusId = null;
        activeId.value = id;
        scrollToHighlight(id);
      }
    }, 0);
  }

  watch(
    () => store.chapterHtml,
    () => {
      selectionToolbar.value = null;
      activeId.value = null;
      pendingRange.value = null;
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

  onMounted(() => {
    store.init();
    window.addEventListener("keydown", handleKeydown);
    // Pick up records applied by a sync or another tab, but never clobber an
    // annotation the user is editing.
    unsubscribe = subscribeRefresh(["records", "sync"], () => {
      if (store.status !== "ready" || activeId.value) return;
      void store.loadRecords().then(() => {
        const doc = iframeRef.value?.contentDocument;
        if (doc) store.applyCurrentChapter(doc);
      });
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
    unsubscribe?.();
  });

  return {
    iframeRef,
    selectionToolbar,
    activeId,
    pendingRange,
    handleFrameLoad,
    focusRecord,
    saveActive,
    deleteActive,
    clearSelection,
    createFromSelection,
  };
}

export type EpubFrame = ReturnType<typeof useEpubFrame>;
