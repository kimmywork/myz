import {
  ChevronDown,
  ChevronRight,
  Highlighter,
  Menu,
  Paperclip,
  X,
} from "@lucide/vue";
import { findRangeByNormalizedText } from "@myz/shared/serializer";
import {
  DEFAULT_COLORS,
  HIGHLIGHT_STYLES,
  RECORD_KINDS,
  type MyZRecord,
} from "@myz/shared/types";
import { storeToRefs } from "pinia";
import { defineComponent, onMounted, ref, watch, type VNode } from "vue";
import EpubHighlightPanel from "./EpubHighlightPanel.js";
import { currentSelection } from "./highlights.js";
import type { EpubTocEntry } from "./parse.js";
import { useEpubReaderStore } from "./stores/reader-store.js";
import { openLibrary } from "@/reader/open-library.js";
import ReaderLanding from "@/reader/ReaderLanding.js";

/**
 * EPUB reader shell (EPUB plan E3): toolbar, a same-origin iframe that renders
 * one spine document with the read typography, and a TOC sidebar. Highlighting
 * arrives in E4.
 */
export default defineComponent({
  name: "EpubReaderApp",
  setup() {
    const store = useEpubReaderStore();
    const {
      status,
      error,
      title,
      spineIndex,
      spineCount,
      toc,
      chapterHtml,
      sidebarOpen,
      recents,
    } = storeToRefs(store);
    const iframeRef = ref<HTMLIFrameElement | null>(null);
    const selectionToolbar = ref<{ top: number; left: number } | null>(null);
    const activeId = ref<string | null>(null);
    const expandedKeys = ref<Set<string>>(new Set());
    const tocQuery = ref("");
    let pendingRange: Range | null = null;
    let pendingFocusId: string | null = null;
    let chapterAnchors: { el: Element; href: string }[] = [];
    let attachedWindow: Window | null = null;
    let scrollHandler: (() => void) | null = null;

    function findTocPath(
      entries: EpubTocEntry[],
      href: string,
      ancestors: string[] = [],
    ): string[] | null {
      for (const entry of entries) {
        const next = [...ancestors, entry.href];
        if (entry.href === href) {
          return next;
        }
        const found = findTocPath(entry.children, href, next);
        if (found) {
          return found;
        }
      }
      return null;
    }

    function expandPathFor(href: string) {
      const path = findTocPath(store.toc, href);
      if (!path) {
        return;
      }
      const next = new Set(expandedKeys.value);
      path.forEach((key) => next.add(key));
      expandedKeys.value = next;
    }

    /** Keeps entries that match the query or contain a matching descendant. */
    function filterToc(entries: EpubTocEntry[], query: string): EpubTocEntry[] {
      const result: EpubTocEntry[] = [];
      for (const entry of entries) {
        const children = filterToc(entry.children, query);
        const self = `${entry.label} ${entry.href}`
          .toLowerCase()
          .includes(query);
        if (self || children.length) {
          result.push({ ...entry, children });
        }
      }
      return result;
    }

    function toggleEntry(href: string) {
      const next = new Set(expandedKeys.value);
      if (next.has(href)) {
        next.delete(href);
      } else {
        next.add(href);
      }
      expandedKeys.value = next;
    }

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
    ): { top: number; left: number } {
      const frameRect = frame.getBoundingClientRect();
      return {
        top: frameRect.top + rect.top,
        left: frameRect.left + rect.left + rect.width / 2,
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
        expandPathFor(store.currentTocHref);
        if (pendingFocusId) {
          const id = pendingFocusId;
          pendingFocusId = null;
          activeId.value = id;
          scrollToHighlight(id);
        }
      }, 0);
    }

    function progressPercent(): number {
      if (spineCount.value <= 0) {
        return 0;
      }
      return Math.round(
        Math.min(1, (spineIndex.value + store.progression) / spineCount.value) *
          100,
      );
    }
    function renderTocEntries(
      entries: EpubTocEntry[],
      state: { matched: boolean } = { matched: false },
    ): VNode[] {
      return entries.map((entry) => {
        // Match the exact target (path + fragment) so a parent does not light
        // up together with the child section that is actually active. Only the
        // first match wins when several entries share a target.
        const isCurrent = !state.matched && entry.href === store.currentTocHref;
        if (isCurrent) {
          state.matched = true;
        }
        const hasChildren = entry.children.length > 0;
        const searching = tocQuery.value.trim().length > 0;
        const expanded =
          hasChildren && (searching || expandedKeys.value.has(entry.href));
        return (
          <li class="reader-outline__item" key={`${entry.href}:${entry.label}`}>
            <div
              class={"reader-outline__row" + (isCurrent ? " is-current" : "")}
              style={{ paddingLeft: `${6 + entry.depth * 12}px` }}
            >
              {hasChildren ? (
                <button
                  type="button"
                  class="reader-outline__toggle"
                  aria-label={expanded ? "折叠" : "展开"}
                  onClick={() => toggleEntry(entry.href)}
                >
                  {expanded ? (
                    <ChevronDown size={12} aria-hidden="true" />
                  ) : (
                    <ChevronRight size={12} aria-hidden="true" />
                  )}
                </button>
              ) : (
                <span class="reader-outline__toggle reader-outline__toggle--leaf" />
              )}
              <button
                type="button"
                class="reader-outline__title"
                onClick={() => {
                  store.openTocEntry(entry.href);
                  expandPathFor(entry.href);
                }}
              >
                <span class="reader-outline__label">
                  {entry.label || entry.href}
                </span>
              </button>
            </div>
            {expanded ? (
              <ul class="reader-outline__children">
                {renderTocEntries(entry.children, state)}
              </ul>
            ) : null}
          </li>
        );
      });
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
          expandPathFor(href);
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
        {status.value === "ready" ? (
          <header class="epub-toolbar">
            <button
              type="button"
              class="epub-icon-btn"
              aria-label="切换目录"
              title="目录"
              onClick={() => (store.sidebarOpen = !store.sidebarOpen)}
            >
              <Menu size={16} aria-hidden="true" />
            </button>
            <div class="epub-toolbar__group">
              <button
                type="button"
                class="epub-btn"
                disabled={spineIndex.value <= 0}
                onClick={() => store.goToChapter(spineIndex.value - 1)}
              >
                上一章
              </button>
              <span class="epub-pager">
                {spineIndex.value + 1} / {spineCount.value}
              </span>
              <button
                type="button"
                class="epub-btn"
                disabled={spineIndex.value >= spineCount.value - 1}
                onClick={() => store.goToChapter(spineIndex.value + 1)}
              >
                下一章
              </button>
            </div>
            <div class="epub-toolbar__title" title={title.value}>
              {title.value}
            </div>
            <span class="epub-pager">{progressPercent()}%</span>
            <button
              type="button"
              class="epub-btn"
              onClick={() => void store.openLocal()}
            >
              打开本地 EPUB
            </button>
          </header>
        ) : null}

        {status.value === "ready" ? (
          <div class="epub-body">
            {sidebarOpen.value ? (
              <aside class="reader-sidebar">
                <header class="reader-sidebar__head">
                  <div
                    class="reader-sidebar__tabs"
                    role="group"
                    aria-label="侧栏"
                  >
                    <button
                      type="button"
                      class={
                        "reader-sidebar__tab" +
                        (store.sidebarTab === "toc" ? " is-active" : "")
                      }
                      onClick={() => (store.sidebarTab = "toc")}
                    >
                      目录
                    </button>
                    <button
                      type="button"
                      class={
                        "reader-sidebar__tab" +
                        (store.sidebarTab === "annotations" ? " is-active" : "")
                      }
                      onClick={() => (store.sidebarTab = "annotations")}
                    >
                      标注
                      {store.highlightList.length
                        ? ` (${store.highlightList.length})`
                        : ""}
                    </button>
                  </div>
                  <button
                    type="button"
                    class="epub-icon-btn"
                    aria-label="关闭侧栏"
                    onClick={() => (store.sidebarOpen = false)}
                  >
                    <X size={16} aria-hidden="true" />
                  </button>
                </header>
                <div class="reader-sidebar__body">
                  {store.sidebarTab === "toc" ? (
                    toc.value.length ? (
                      <div class="epub-toc-pane">
                        <input
                          class="reader-hl__search"
                          type="search"
                          placeholder="搜索目录…"
                          aria-label="搜索目录"
                          value={tocQuery.value}
                          onInput={(event: Event) => {
                            tocQuery.value = (
                              event.target as HTMLInputElement
                            ).value;
                          }}
                        />
                        {(() => {
                          const query = tocQuery.value.trim().toLowerCase();
                          const list = query
                            ? filterToc(toc.value, query)
                            : toc.value;
                          if (!list.length) {
                            return (
                              <p class="reader-sidebar__hint">没有匹配的目录</p>
                            );
                          }
                          return (
                            <ul class="reader-outline">
                              {renderTocEntries(list)}
                            </ul>
                          );
                        })()}
                      </div>
                    ) : (
                      <p class="reader-sidebar__hint">这本 EPUB 没有目录</p>
                    )
                  ) : store.highlightList.length ? (
                    <ul class="reader-hl__list">
                      {store.highlightList.map((record) => (
                        <li key={record.id}>
                          <button
                            type="button"
                            class="reader-hl__item"
                            onClick={() => focusRecord(record)}
                          >
                            <span
                              class="reader-hl__mark"
                              data-kind={record.kind}
                              style={{
                                background:
                                  record.kind === RECORD_KINDS.CLIP
                                    ? "transparent"
                                    : record.color || DEFAULT_COLORS[0],
                              }}
                            />
                            <span class="reader-hl__body">
                              <span class="reader-hl__chapter">
                                第 {(record.epubLocator?.spineIndex ?? 0) + 1}{" "}
                                章
                              </span>
                              <span class="reader-hl__text">{record.text}</span>
                              {record.note ? (
                                <span class="reader-hl__note">
                                  批注：{record.note}
                                </span>
                              ) : null}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p class="reader-sidebar__hint">这里还没有记录</p>
                  )}
                </div>
              </aside>
            ) : null}
            <div class="epub-stage">
              <iframe
                ref={iframeRef}
                class="epub-frame"
                title={title.value || "EPUB"}
                sandbox="allow-same-origin"
                srcdoc={chapterHtml.value}
                onLoad={handleFrameLoad}
              />
            </div>
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
          <div
            class="selection-toolbar"
            style={{
              top: `${selectionToolbar.value.top}px`,
              left: `${selectionToolbar.value.left}px`,
            }}
          >
            <button
              type="button"
              aria-label="划线"
              title="划线"
              onClick={() => void createFromSelection(RECORD_KINDS.HIGHLIGHT)}
            >
              <Highlighter size={16} aria-hidden="true" />
            </button>
            <button
              type="button"
              aria-label="摘录"
              title="摘录"
              onClick={() => void createFromSelection(RECORD_KINDS.CLIP)}
            >
              <Paperclip size={16} aria-hidden="true" />
            </button>
            <button
              type="button"
              aria-label="取消"
              title="取消"
              onClick={clearSelection}
            >
              <X size={16} aria-hidden="true" />
            </button>
          </div>
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
