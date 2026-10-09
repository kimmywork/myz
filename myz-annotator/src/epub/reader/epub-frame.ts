import type { EpubTocEntry } from "../parse.js";
import type { useEpubReaderStore } from "../stores/reader-store.js";

type Store = ReturnType<typeof useEpubReaderStore>;

export interface ChapterAnchor {
  el: Element;
  href: string;
}

/** Convert a range rect inside the iframe to viewport coordinates. */
export function framePoint(
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

/** Collect elements in the current chapter that TOC entries point at. */
export function collectChapterAnchors(
  doc: Document,
  store: Store,
): ChapterAnchor[] {
  const chapterHref = store.book?.spine[store.spineIndex]?.href || "";
  const list: ChapterAnchor[] = [];
  const walk = (entries: EpubTocEntry[]) =>
    entries.forEach((entry) => {
      const [path, fragment] = entry.href.split("#");
      if (fragment && path === chapterHref) {
        const el = doc.getElementById(fragment);
        if (el) list.push({ el, href: entry.href });
      }
      walk(entry.children);
    });
  walk(store.toc);
  return list;
}

/** Highlight the TOC entry whose section the reader is currently in. */
export function updateCurrentFromScroll(
  anchors: ChapterAnchor[],
  store: Store,
) {
  const chapterHref = store.book?.spine[store.spineIndex]?.href || "";
  let current = chapterHref;
  for (const anchor of anchors) {
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
