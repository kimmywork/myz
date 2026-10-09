import type { Ref } from "vue";
import type { EpubBook } from "../parse.js";
import { buildSpineHtml, readReadTokens, type ReadTokens } from "../render.js";
import { clamp } from "./reader-types.js";

interface ChapterRendererDeps {
  book: Ref<EpubBook | null>;
  spineIndex: Ref<number>;
  chapterHtml: Ref<string>;
  /** Cache discriminator, e.g. `${theme}|${scheme}`. */
  tokenKey: () => string;
}

const MAX_CHAPTER_CACHE = 6;

/** Blob + built-chapter caches and the per-theme render path. */
export function createChapterRenderer(deps: ChapterRendererDeps) {
  const blobCache = new Map<string, string>();
  // Built chapter HTML keyed by `spineIndex|tokenKey`; avoids re-parsing and
  // re-sanitizing a chapter every time it is revisited or the theme toggles.
  const chapterCache = new Map<string, string>();
  let cachedTokensKey = "";
  let cachedTokens: ReadTokens | null = null;

  function revokeBlobs() {
    for (const url of blobCache.values()) URL.revokeObjectURL(url);
    blobCache.clear();
    chapterCache.clear();
    cachedTokens = null;
    cachedTokensKey = "";
  }

  /** Read tokens change with the theme, so cache them per theme/scheme. */
  function currentTokens(): ReadTokens {
    const key = deps.tokenKey();
    if (cachedTokens && cachedTokensKey === key) return cachedTokens;
    cachedTokens = readReadTokens();
    cachedTokensKey = key;
    return cachedTokens;
  }

  function renderChapter() {
    const book = deps.book.value;
    if (!book || !book.spine.length) {
      deps.chapterHtml.value = "";
      return;
    }
    deps.spineIndex.value = clamp(
      deps.spineIndex.value,
      0,
      book.spine.length - 1,
    );
    const tokens = currentTokens();
    const cacheKey = `${deps.spineIndex.value}|${cachedTokensKey}`;
    const cached = chapterCache.get(cacheKey);
    if (cached !== undefined) {
      deps.chapterHtml.value = cached;
      return;
    }
    const html = buildSpineHtml(
      book,
      book.spine[deps.spineIndex.value],
      tokens,
      blobCache,
    );
    chapterCache.set(cacheKey, html);
    if (chapterCache.size > MAX_CHAPTER_CACHE) {
      const oldest = chapterCache.keys().next().value;
      if (oldest !== undefined) chapterCache.delete(oldest);
    }
    deps.chapterHtml.value = html;
  }

  return { revokeBlobs, renderChapter };
}

export type ChapterRenderer = ReturnType<typeof createChapterRenderer>;
