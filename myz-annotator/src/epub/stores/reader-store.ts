import { useColorScheme } from "@myz/shared/colorScheme";
import { collectTags } from "@myz/shared/tags";
import { useThemePreference } from "@myz/shared/theme";
import {
  DEFAULT_COLORS,
  DEFAULT_HIGHLIGHT_STYLE,
  HIGHLIGHT_STYLES,
  RECORD_KINDS,
  type MyZRecord,
} from "@myz/shared/types";
import { buildEpubSourceUrl } from "@myz/shared/url";
import { defineStore } from "pinia";
import { computed, ref, watch } from "vue";
import { resolveHref, type EpubBook } from "../parse.js";
import { createChapterRenderer } from "../reader/chapter-renderer.js";
import { createEpubHighlights } from "../reader/epub-highlights.js";
import { createEpubOpen } from "../reader/epub-open.js";
import { createLoadPreferences } from "../reader/epub-preferences.js";
import { createEpubProgress } from "../reader/epub-progress.js";
import { clamp, type EpubReaderStatus } from "../reader/reader-types.js";
import type { EpubSourceRef } from "../source.js";
import type { EpubProgress } from "../storage.js";
import { findTocPath } from "../toc.js";

export const useEpubReaderStore = defineStore("epub-reader", () => {
  const { effectiveTheme } = useThemePreference();
  const { scheme } = useColorScheme();

  const status = ref<EpubReaderStatus>("landing");
  const error = ref("");
  const book = ref<EpubBook | null>(null);
  const sourceRef = ref<EpubSourceRef | null>(null);
  const spineIndex = ref(0);
  const chapterHtml = ref("");
  const sidebarOpen = ref(false);
  const sidebarTab = ref<"toc" | "annotations">("toc");
  const recents = ref<EpubProgress[]>([]);
  const progression = ref(0);
  const pendingProgression = ref(0);
  const pendingFragment = ref("");
  const currentTocHref = ref("");
  const expandedToc = ref<Set<string>>(new Set());
  const tocQuery = ref("");
  const records = ref<MyZRecord[]>([]);
  const colorPalette = ref<string[]>([...DEFAULT_COLORS]);
  const lastColor = ref<string>(DEFAULT_COLORS[0]);
  const lastStyle = ref<HIGHLIGHT_STYLES>(DEFAULT_HIGHLIGHT_STYLE);

  const title = computed(() => book.value?.metadata.title || "");
  const author = computed(() => book.value?.metadata.author || "");
  const spineCount = computed(() => book.value?.spine.length || 0);
  const toc = computed(() => book.value?.toc || []);
  const progressPercent = computed(() => {
    if (spineCount.value <= 0) return 0;
    return Math.round(
      Math.min(1, (spineIndex.value + progression.value) / spineCount.value) *
        100,
    );
  });
  const sourceKey = computed(() =>
    sourceRef.value ? buildEpubSourceUrl(sourceRef.value.fingerprint) : "",
  );
  const tagOptions = computed(() => collectTags(records.value));
  const highlightList = computed(() =>
    records.value
      .filter(
        (record) =>
          record.kind === RECORD_KINDS.HIGHLIGHT ||
          record.kind === RECORD_KINDS.CLIP,
      )
      .slice()
      .sort(
        (a, b) =>
          (a.epubLocator?.spineIndex ?? 0) - (b.epubLocator?.spineIndex ?? 0),
      ),
  );

  const chapter = createChapterRenderer({
    book,
    spineIndex,
    chapterHtml,
    tokenKey: () => `${effectiveTheme.value}|${scheme.value}`,
  });
  const progress = createEpubProgress({
    book,
    sourceRef,
    spineIndex,
    progression,
    title,
    recents,
  });
  const highlights = createEpubHighlights({
    records,
    sourceKey,
    title,
    spineIndex,
    progression,
    lastColor,
    lastStyle,
  });
  const loadPreferences = createLoadPreferences({
    colorPalette,
    lastColor,
    lastStyle,
  });
  const opener = createEpubOpen({
    status,
    error,
    book,
    sourceRef,
    spineIndex,
    pendingFragment,
    expandedToc,
    tocQuery,
    currentTocHref,
    progression,
    pendingProgression,
    revokeBlobs: chapter.revokeBlobs,
    renderChapter: chapter.renderChapter,
    loadRecords: highlights.loadRecords,
    persistProgress: progress.persistProgress,
  });

  function goToChapter(index: number, fragment = "") {
    if (!book.value) return;
    const next = clamp(index, 0, book.value.spine.length - 1);
    pendingFragment.value = fragment;
    const href = book.value.spine[next]?.href || "";
    currentTocHref.value = fragment ? `${href}#${fragment}` : href;
    if (next === spineIndex.value) return;
    spineIndex.value = next;
    progression.value = 0;
    pendingProgression.value = 0;
    chapter.renderChapter();
    void progress.persistProgress();
  }

  function spineIndexForHref(href: string): number {
    if (!book.value) return -1;
    const path = href.split("#")[0];
    return book.value.spine.findIndex((item) => item.href === path);
  }

  function openTocEntry(href: string) {
    const index = spineIndexForHref(href);
    if (index >= 0) goToChapter(index, href.split("#")[1] || "");
  }

  function toggleTocEntry(href: string) {
    const next = new Set(expandedToc.value);
    if (next.has(href)) next.delete(href);
    else next.add(href);
    expandedToc.value = next;
  }

  /** Expands every ancestor of `href` so the current section is visible. */
  function expandTocPath(href: string) {
    const path = findTocPath(toc.value, href);
    if (!path) return;
    const next = new Set(expandedToc.value);
    path.forEach((key) => next.add(key));
    expandedToc.value = next;
  }

  /** Follows an in-content link to another spine document or an anchor. */
  function openInternalHref(rawHref: string) {
    if (!book.value) return;
    if (rawHref.startsWith("#")) {
      goToChapter(spineIndex.value, rawHref.slice(1));
      return;
    }
    const current = book.value.spine[spineIndex.value]?.href || "";
    const baseDir = current.includes("/")
      ? current.slice(0, current.lastIndexOf("/"))
      : "";
    const resolved = resolveHref(baseDir, rawHref);
    const index = book.value.spine.findIndex((item) => item.href === resolved);
    if (index >= 0) goToChapter(index, rawHref.split("#")[1] || "");
  }

  function setProgression(ratio: number) {
    progression.value = clamp(ratio, 0, 1);
    progress.schedulePersist();
  }

  function init() {
    void loadPreferences();
    void progress.refreshRecents();
    void opener.openFromQuery();
  }

  watch([effectiveTheme, scheme], () => {
    if (book.value && status.value === "ready") {
      // Preserve the reading position: the iframe reload restores from
      // `pendingProgression`, which is otherwise only set on open/chapter change.
      pendingProgression.value = progression.value;
      chapter.renderChapter();
    }
  });

  return {
    status,
    error,
    book,
    title,
    author,
    spineIndex,
    spineCount,
    progressPercent,
    toc,
    chapterHtml,
    sidebarOpen,
    sidebarTab,
    highlightList,
    recents,
    progression,
    pendingProgression,
    pendingFragment,
    currentTocHref,
    expandedToc,
    tocQuery,
    records,
    tagOptions,
    sourceKey,
    colorPalette,
    lastColor,
    lastStyle,
    init,
    openLocal: opener.openLocal,
    openUrl: opener.openUrl,
    openRecent: opener.openRecent,
    openBytes: opener.openBytes,
    goToChapter,
    openTocEntry,
    toggleTocEntry,
    expandTocPath,
    openInternalHref,
    setProgression,
    loadRecords: highlights.loadRecords,
    applyCurrentChapter: highlights.applyCurrentChapter,
    createHighlight: highlights.createHighlight,
    deleteRecord: highlights.deleteRecord,
    getRecord: highlights.getRecord,
    updateRecord: highlights.updateRecord,
  };
});
