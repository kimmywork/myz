import { findRangeByNormalizedText } from "@myz/shared/serializer";
import { RECORD_KINDS } from "@myz/shared/types";
import { currentSelection } from "../highlights.js";
import type { useEpubReaderStore } from "../stores/reader-store.js";

type Store = ReturnType<typeof useEpubReaderStore>;

/** Automation surface used by the Playwright e2e suite (window.__MYZ_EPUB__). */
export function createEpubBackdoor(
  store: Store,
  getDoc: () => Document | null,
) {
  return {
    openUrl: (url: string, options?: { title?: string }) =>
      store.openUrl(url, options),
    openLocal: store.openLocal,
    goToChapter: store.goToChapter,
    openTocEntry: (href: string) => store.openTocEntry(href),
    nextChapter: () => store.goToChapter(store.spineIndex + 1),
    prevChapter: () => store.goToChapter(store.spineIndex - 1),
    toggleSidebar: (open?: boolean) => {
      store.sidebarOpen = typeof open === "boolean" ? open : !store.sidebarOpen;
    },
    getToc: () => store.toc,
    createHighlightByText: async (
      text: string,
      kind: RECORD_KINDS = RECORD_KINDS.HIGHLIGHT,
    ) => {
      const doc = getDoc();
      if (!doc) return false;
      const range = findRangeByNormalizedText(doc.body, text);
      if (!range) return false;
      await store.createHighlight(range, kind);
      store.applyCurrentChapter(doc);
      return true;
    },
    createHighlightFromSelection: async (
      kind: RECORD_KINDS = RECORD_KINDS.HIGHLIGHT,
    ) => {
      const doc = getDoc();
      if (!doc) return false;
      const range = currentSelection(doc);
      if (!range) return false;
      await store.createHighlight(range, kind);
      store.applyCurrentChapter(doc);
      return true;
    },
    getHighlightCount: () => store.records.length,
    getRecords: () => store.records,
    deleteHighlight: async (id: string) => {
      await store.deleteRecord(id);
      const doc = getDoc();
      if (doc) store.applyCurrentChapter(doc);
    },
    getMarkCount: () =>
      getDoc()?.querySelectorAll(".myz-highlight").length ?? 0,
    getState: () => ({
      status: store.status,
      title: store.title,
      author: store.author,
      spineIndex: store.spineIndex,
      spineCount: store.spineCount,
      tocCount: store.toc.length,
      currentTocHref: store.currentTocHref,
      sidebarOpen: store.sidebarOpen,
      highlightCount: store.records.length,
    }),
  };
}

export type EpubBackdoor = ReturnType<typeof createEpubBackdoor>;
