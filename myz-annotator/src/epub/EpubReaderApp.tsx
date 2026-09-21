import { findRangeByNormalizedText } from "@myz/shared/serializer";
import {
  HIGHLIGHT_STYLES,
  RECORD_KINDS,
  type MyZRecord,
} from "@myz/shared/types";
import { storeToRefs } from "pinia";
import { defineComponent, onMounted, ref, watch } from "vue";
import EpubSidebar from "./components/EpubSidebar.js";
import EpubStage from "./components/EpubStage.js";
import EpubToolbar from "./components/EpubToolbar.js";
import EpubHighlightPanel from "./EpubHighlightPanel.js";
import { currentSelection } from "./highlights.js";
import type { EpubTocEntry } from "./parse.js";
import { useEpubReaderStore } from "./stores/reader-store.js";
import { openLibrary } from "@/reader/open-library.js";
import ReaderLanding from "@/reader/ReaderLanding.js";
import ReaderSelectionTools from "@/reader/ReaderSelectionTools.js";

/**
 * EPUB reader shell (EPUB plan E3): composes the toolbar, sidebar, stage,
 * capture tools and inspector, and owns the iframe document lifecycle (frame
 * events, scroll tracking, TOC-anchor highlighting, backdoor).
 */
export default defineComponent({
  name: "EpubReaderApp",
  setup() {
    const store = useEpubReaderStore();
    const { status, error, title, chapterHtml, recents } = storeToRefs(store);
    const iframeRef = ref<HTMLIFrameElement | null>(null);
    const selectionToolbar = ref<{
      top: number;
      left: number;
      bottom: number;
    } | null>(null);
    const activeId = ref<string | null>(null);
    let pendingRange: Range | null = null;
    let pendingFocusId: string | null = null;
    let chapterAnchors: { el: Element; href: string }[] = [];
    let attachedWindow: Window | null = null;
    let scrollHandler: (() => void) | null = null;

    function collectChapterAnchors(doc: Document) {
      const chapterHref = store.book?.spine[store.spineIndex]?.href || "";
      const list: { el: Element; href: string }[] = [];
      const walk = (entries: EpubTocEntry[]) =>
        entries.forEach((entry) => {
          const [path, fragment] = entry.href.split("#");
          if (fragment && path === chapterHref) {
            const el = doc.getElementById(fragment);
            if (el) {
              list.push({ el, href: entry.href });
            }
          }
          walk(entry.children);
        });
      walk(store.toc);
      chapterAnchors = list;
    }

    /** Highlights the TOC entry whose section the reader is currently in. */
    function updateCurrentFromScroll() {
      const chapterHref = store.book?.spine[store.spineIndex]?.href || "";
      let current = chapterHref;
      for (const anchor of chapterAnchors) {
        if (anchor.el.getBoundingClientRect().top <= 96) {
          current = anchor.href;
        } else {
          break;
        }
      }
      if (store.currentTocHref !== current) {
        store.currentTocHref = current;
      }
    }

    function framePoint(
      frame: HTMLIFrameElement,
      rect: DOMRect,
    ): { top: number; left: number; bottom: number } {
      const frameRect = frame.getBoundingClientRect();
      return {
        top: frameRect.top + rect.top,
        left: frameRect.left + rect.left + rect.width / 2,
        bottom: frameRect.top + rect.bottom,
      };
    }

    function handleSelection(doc: Document, frame: HTMLIFrameElement) {
      const selection = doc.getSelection();
      if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
        // Selection cleared: the capture toolbar must go away too.
        selectionToolbar.value = null;
        pendingRange = null;
        return;
      }
      const range = selection.getRangeAt(0);
      if (!range.toString().trim()) {
        selectionToolbar.value = null;
        pendingRange = null;
        return;
      }
      pendingRange = range;
      selectionToolbar.value = framePoint(frame, range.getBoundingClientRect());
      activeId.value = null;
    }

    function scrollToHighlight(id: string) {
      const doc = iframeRef.value?.contentDocument;
      const el = doc?.querySelector(
        `.myz-highlight[data-highlight-id="${id}"]`,
      );
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
          // The sandboxed iframe must not navigate itself to an external site.
          event.preventDefault();
          chrome.tabs.create({ url: href });
          return;
        }
      }
      const target = (event.target as Element | null)?.closest?.(
        ".myz-highlight",
      );
      const id = target?.getAttribute("data-highlight-id");
      if (!target || !id) {
        return;
      }
      activeId.value = id;
      selectionToolbar.value = null;
      pendingRange = null;
    }

    async function saveActive(patch: {
      note: string;
      tags: string[];
      color?: string;
      style?: HIGHLIGHT_STYLES;
    }) {
      const id = activeId.value;
      if (!id) {
        return;
      }
      await store.updateRecord(id, patch);
      const doc = iframeRef.value?.contentDocument;
      if (doc) {
        store.applyCurrentChapter(doc);
      }
    }

    function clearSelection() {
      iframeRef.value?.contentWindow?.getSelection()?.removeAllRanges();
      pendingRange = null;
      selectionToolbar.value = null;
    }

    async function createFromSelection(kind: RECORD_KINDS) {
      const range = pendingRange;
      if (!range) {
        return;
      }
      await store.createHighlight(range, kind);
      clearSelection();
      const doc = iframeRef.value?.contentDocument;
      if (doc) {
        store.applyCurrentChapter(doc);
      }
    }

    async function deleteActive() {
      const id = activeId.value;
      if (!id) {
        return;
      }
      activeId.value = null;
      await store.deleteRecord(id);
      const doc = iframeRef.value?.contentDocument;
      if (doc) {
        store.applyCurrentChapter(doc);
      }
    }

    function scrollToFragment(fragment: string): boolean {
      const doc = iframeRef.value?.contentDocument;
      if (!doc || !fragment) {
        return false;
      }
      const target = doc.getElementById(fragment);
      if (!target) {
        return false;
      }
      target.scrollIntoView();
      store.pendingFragment = "";
      return true;
    }

    function handleFrameLoad() {
      const frame = iframeRef.value;
      const win = frame?.contentWindow;
      const doc = frame?.contentDocument;
      if (!frame || !win || !doc) {
        return;
      }
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
        if (height > 0) {
          store.setProgression(win.scrollY / height);
        }
        updateCurrentFromScroll();
      };
      win.addEventListener("scroll", scrollHandler, { passive: true });

      doc.addEventListener("mouseup", () => handleSelection(doc, frame));
      doc.addEventListener("click", (event) => handleHighlightClick(event));
      window.setTimeout(() => {
        store.applyCurrentChapter(doc);
        collectChapterAnchors(doc);
        updateCurrentFromScroll();
        store.expandTocPath(store.currentTocHref);
        if (pendingFocusId) {
          const id = pendingFocusId;
          pendingFocusId = null;
          activeId.value = id;
          scrollToHighlight(id);
        }
      }, 0);
    }

    watch(chapterHtml, () => {
      selectionToolbar.value = null;
      activeId.value = null;
      pendingRange = null;
    });

    watch(
      () => store.pendingFragment,
      (fragment) => {
        if (fragment) {
          scrollToFragment(fragment);
        }
      },
    );

    watch(
      () => store.currentTocHref,
      (href) => {
        if (href) {
          store.expandTocPath(href);
        }
      },
    );

    onMounted(() => {
      store.init();
      const backdoor = {
        openUrl: (url: string, options?: { title?: string }) =>
          store.openUrl(url, options),
        openLocal: store.openLocal,
        goToChapter: store.goToChapter,
        openTocEntry: (href: string) => store.openTocEntry(href),
        nextChapter: () => store.goToChapter(store.spineIndex + 1),
        prevChapter: () => store.goToChapter(store.spineIndex - 1),
        toggleSidebar: (open?: boolean) => {
          store.sidebarOpen =
            typeof open === "boolean" ? open : !store.sidebarOpen;
        },
        getToc: () => store.toc,
        createHighlightByText: async (
          text: string,
          kind: RECORD_KINDS = RECORD_KINDS.HIGHLIGHT,
        ) => {
          const doc = iframeRef.value?.contentDocument;
          if (!doc) {
            return false;
          }
          const range = findRangeByNormalizedText(doc.body, text);
          if (!range) {
            return false;
          }
          await store.createHighlight(range, kind);
          store.applyCurrentChapter(doc);
          return true;
        },
        createHighlightFromSelection: async (
          kind: RECORD_KINDS = RECORD_KINDS.HIGHLIGHT,
        ) => {
          const doc = iframeRef.value?.contentDocument;
          if (!doc) {
            return false;
          }
          const range = currentSelection(doc);
          if (!range) {
            return false;
          }
          await store.createHighlight(range, kind);
          store.applyCurrentChapter(doc);
          return true;
        },
        getHighlightCount: () => store.records.length,
        getRecords: () => store.records,
        deleteHighlight: async (id: string) => {
          await store.deleteRecord(id);
          const doc = iframeRef.value?.contentDocument;
          if (doc) {
            store.applyCurrentChapter(doc);
          }
        },
        getMarkCount: () =>
          iframeRef.value?.contentDocument?.querySelectorAll(".myz-highlight")
            .length ?? 0,
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
      (window as unknown as { __MYZ_EPUB__: typeof backdoor }).__MYZ_EPUB__ =
        backdoor;
    });

    return () => (
      <div class="epub-app">
        {status.value === "ready" ? <EpubToolbar /> : null}

        {status.value === "ready" ? (
          <div class="epub-body">
            <EpubSidebar
              activeId={activeId.value}
              onFocusRecord={focusRecord}
            />
            <EpubStage
              title={title.value}
              chapterHtml={chapterHtml.value}
              onLoad={handleFrameLoad}
              frameRef={iframeRef}
            />
          </div>
        ) : null}

        {status.value === "landing" ? (
          <ReaderLanding
            title="MyZ EPUB 阅读器"
            subtitle="打开本地 EPUB，或从下方继续上次阅读。"
            openLabel="打开本地 EPUB"
            recents={recents.value.map((entry) => ({
              key: entry.sourceKey,
              title: entry.title || "未命名 EPUB",
              meta: `第 ${entry.spineIndex + 1} 章`,
            }))}
            onOpen={() => void store.openLocal()}
            onBack={openLibrary}
            onOpenRecent={(key) => {
              const entry = recents.value.find(
                (item) => item.sourceKey === key,
              );
              if (entry) {
                void store.openRecent(entry);
              }
            }}
          />
        ) : null}

        {status.value === "loading" ? <p class="epub-status">加载中…</p> : null}

        {status.value === "error" ? (
          <p class="epub-status epub-status--error">{error.value}</p>
        ) : null}

        {selectionToolbar.value ? (
          <ReaderSelectionTools
            top={selectionToolbar.value.top}
            left={selectionToolbar.value.left}
            bottom={selectionToolbar.value.bottom}
            text={pendingRange?.toString().trim() || ""}
            onHighlight={() => void createFromSelection(RECORD_KINDS.HIGHLIGHT)}
            onClip={() => void createFromSelection(RECORD_KINDS.CLIP)}
            onClose={clearSelection}
          />
        ) : null}

        {activeId.value ? (
          <EpubHighlightPanel
            record={store.getRecord(activeId.value) ?? null}
            palette={store.colorPalette}
            tagOptions={store.tagOptions}
            onSave={(patch) => void saveActive(patch)}
            onDelete={() => void deleteActive()}
            onClose={() => (activeId.value = null)}
          />
        ) : null}
      </div>
    );
  },
});
