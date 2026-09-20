import { useColorScheme } from "@myz/shared/colorScheme";
import { normalizeHighlightStyle } from "@myz/shared/highlightUtils";
import { sendMessage } from "@myz/shared/messaging";
import { serializeRange } from "@myz/shared/serializer";
import { useThemePreference } from "@myz/shared/theme";
import {
  CONTENT_TYPES,
  DEFAULT_COLORS,
  DEFAULT_HIGHLIGHT_STYLE,
  HIGHLIGHT_STYLES,
  RECORD_KINDS,
  SOURCE_TYPES,
  type MyZRecord,
} from "@myz/shared/types";
import { buildEpubSourceUrl } from "@myz/shared/url";
import { defineStore } from "pinia";
import { computed, ref, watch } from "vue";
import { applyHighlights, type EpubHighlightRecord } from "../highlights.js";
import { parseEpub, resolveHref, type EpubBook } from "../parse.js";
import { buildSpineHtml, readReadTokens } from "../render.js";
import {
  pickLocalEpub,
  restoreLocalEpub,
  type EpubSourceRef,
} from "../source.js";
import { listProgress, saveProgress, type EpubProgress } from "../storage.js";

type Status = "landing" | "loading" | "ready" | "error";

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export const useEpubReaderStore = defineStore("epub-reader", () => {
  const { effectiveTheme } = useThemePreference();
  const { scheme } = useColorScheme();

  const status = ref<Status>("landing");
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
  const records = ref<MyZRecord[]>([]);
  const colorPalette = ref<string[]>([...DEFAULT_COLORS]);
  const lastColor = ref<string>(DEFAULT_COLORS[0]);
  const lastStyle = ref<HIGHLIGHT_STYLES>(DEFAULT_HIGHLIGHT_STYLE);

  const blobCache = new Map<string, string>();
  let saveTimer: ReturnType<typeof setTimeout> | null = null;

  const title = computed(() => book.value?.metadata.title || "");
  const author = computed(() => book.value?.metadata.author || "");
  const spineCount = computed(() => book.value?.spine.length || 0);
  const toc = computed(() => book.value?.toc || []);
  const sourceKey = computed(() =>
    sourceRef.value ? buildEpubSourceUrl(sourceRef.value.fingerprint) : "",
  );
  const tagOptions = computed(() =>
    Array.from(
      new Set(records.value.flatMap((record) => record.tags ?? [])),
    ).sort((a, b) => a.localeCompare(b)),
  );
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

  function revokeBlobs() {
    for (const url of blobCache.values()) {
      URL.revokeObjectURL(url);
    }
    blobCache.clear();
  }

  function renderChapter() {
    if (!book.value || !book.value.spine.length) {
      chapterHtml.value = "";
      return;
    }
    spineIndex.value = clamp(spineIndex.value, 0, book.value.spine.length - 1);
    chapterHtml.value = buildSpineHtml(
      book.value,
      book.value.spine[spineIndex.value],
      readReadTokens(),
      blobCache,
    );
  }

  /**
   * Load the user's highlight palette and last-used colour/style, so an EPUB
   * highlight matches the rest of the product. Without this the reader would
   * also write the hardcoded amber/paint back as the global default, because
   * `myz:saveHighlight` persists the record's colour/style as the preference.
   */
  async function loadPreferences() {
    try {
      const settings = await sendMessage<
        undefined,
        {
          colorPalette?: unknown;
          lastUsedColor?: unknown;
          lastUsedStyle?: unknown;
        }
      >("myz:getSettings");
      const palette = settings?.colorPalette;
      if (Array.isArray(palette) && palette.length) {
        const normalized = palette.filter(
          (color): color is string =>
            typeof color === "string" && Boolean(color.trim()),
        );
        if (normalized.length) {
          colorPalette.value = normalized;
        }
      }
      if (typeof settings?.lastUsedColor === "string") {
        lastColor.value = settings.lastUsedColor;
      }
      if (typeof settings?.lastUsedStyle === "string") {
        lastStyle.value = normalizeHighlightStyle(settings.lastUsedStyle);
      }
    } catch {
      // Keep the bundled defaults when settings are unavailable.
    }
  }

  async function refreshRecents() {
    try {
      recents.value = await listProgress();
    } catch {
      recents.value = [];
    }
  }

  async function persistProgress() {
    if (!book.value || !sourceRef.value) {
      return;
    }
    await saveProgress({
      sourceKey: buildEpubSourceUrl(sourceRef.value.fingerprint),
      sourceType: SOURCE_TYPES.EPUB,
      spineIndex: spineIndex.value,
      progression: progression.value,
      title: title.value,
      fingerprint: sourceRef.value.fingerprint,
      updatedAt: new Date().toISOString(),
    });
    await refreshRecents();
  }

  function schedulePersist() {
    if (saveTimer) {
      clearTimeout(saveTimer);
    }
    saveTimer = setTimeout(() => {
      void persistProgress();
    }, 500);
  }

  async function openBytes(
    bytes: ArrayBuffer,
    ref: EpubSourceRef,
    options: { spineIndex?: number; progression?: number } = {},
  ) {
    status.value = "loading";
    try {
      revokeBlobs();
      const parsed = parseEpub(bytes);
      if (!parsed.spine.length) {
        throw new Error("这本 EPUB 没有可阅读的章节");
      }
      book.value = parsed;
      sourceRef.value = ref;
      pendingFragment.value = "";
      spineIndex.value = clamp(
        options.spineIndex ?? 0,
        0,
        parsed.spine.length - 1,
      );
      currentTocHref.value = parsed.spine[spineIndex.value]?.href || "";
      progression.value = options.progression ?? 0;
      pendingProgression.value = progression.value;
      await loadRecords();
      renderChapter();
      status.value = "ready";
      await persistProgress();
    } catch (err) {
      status.value = "error";
      error.value = (err as Error).message || "无法解析该 EPUB";
    }
  }

  async function openLocal() {
    status.value = "loading";
    try {
      const picked = await pickLocalEpub();
      if (!picked) {
        status.value = book.value ? "ready" : "landing";
        return;
      }
      await openBytes(picked.bytes, picked.ref);
    } catch (err) {
      status.value = "error";
      error.value = (err as Error).message || "打开失败";
    }
  }

  async function openUrl(url: string, options: { title?: string } = {}) {
    status.value = "loading";
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`下载失败（${response.status}）`);
      }
      const bytes = await response.arrayBuffer();
      const fingerprint = `url-${url}`;
      await openBytes(bytes, {
        kind: "local",
        fingerprint,
        title: options.title || url.split("/").pop() || "EPUB",
      });
    } catch (err) {
      status.value = "error";
      error.value = (err as Error).message || "打开失败";
    }
  }

  async function openRecent(entry: EpubProgress) {
    if (!entry.fingerprint) {
      return;
    }
    status.value = "loading";
    try {
      const restored = await restoreLocalEpub(entry.fingerprint, entry.title);
      if (!restored) {
        status.value = "error";
        error.value = "找不到该文件的授权，请重新打开";
        return;
      }
      await openBytes(restored.bytes, restored.ref, {
        spineIndex: entry.spineIndex,
        progression: entry.progression,
      });
    } catch (err) {
      status.value = "error";
      error.value = (err as Error).message || "打开失败";
    }
  }

  async function openFromQuery() {
    const params = new URLSearchParams(window.location.search);
    const fingerprint = params.get("fp");
    if (!fingerprint) {
      return;
    }
    status.value = "loading";
    try {
      const restored = await restoreLocalEpub(fingerprint);
      if (!restored) {
        status.value = "error";
        error.value = "需要重新授权访问该本地文件";
        return;
      }
      await openBytes(restored.bytes, restored.ref, {
        spineIndex: Number(params.get("spine") || 0),
        progression: Number(params.get("prog") || 0),
      });
    } catch (err) {
      status.value = "error";
      error.value = (err as Error).message || "打开失败";
    }
  }

  function goToChapter(index: number, fragment = "") {
    if (!book.value) {
      return;
    }
    const next = clamp(index, 0, book.value.spine.length - 1);
    pendingFragment.value = fragment;
    const href = book.value.spine[next]?.href || "";
    currentTocHref.value = fragment ? `${href}#${fragment}` : href;
    if (next === spineIndex.value) {
      return;
    }
    spineIndex.value = next;
    progression.value = 0;
    pendingProgression.value = 0;
    renderChapter();
    void persistProgress();
  }

  function spineIndexForHref(href: string): number {
    if (!book.value) {
      return -1;
    }
    const path = href.split("#")[0];
    return book.value.spine.findIndex((item) => item.href === path);
  }

  function openTocEntry(href: string) {
    const index = spineIndexForHref(href);
    if (index >= 0) {
      goToChapter(index, href.split("#")[1] || "");
    }
  }

  /** Follows an in-content link to another spine document or an anchor. */
  function openInternalHref(rawHref: string) {
    if (!book.value) {
      return;
    }
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
    if (index >= 0) {
      goToChapter(index, rawHref.split("#")[1] || "");
    }
  }

  function setProgression(ratio: number) {
    progression.value = clamp(ratio, 0, 1);
    schedulePersist();
  }

  async function loadRecords() {
    if (!sourceKey.value) {
      records.value = [];
      return;
    }
    try {
      const list = await sendMessage("myz:getHighlightsForUrl", {
        url: sourceKey.value,
        aliases: [sourceKey.value],
      });
      records.value = Array.isArray(list) ? (list as MyZRecord[]) : [];
    } catch {
      records.value = [];
    }
  }

  /** Paints the stored highlights onto the currently rendered chapter. */
  function applyCurrentChapter(doc: Document): number {
    return applyHighlights(
      doc,
      records.value as EpubHighlightRecord[],
      spineIndex.value,
    );
  }

  async function createHighlight(range: Range, kind: RECORD_KINDS) {
    const text = range.toString().trim();
    if (!text || !sourceKey.value) {
      return;
    }
    const payload: Partial<MyZRecord> = {
      url: sourceKey.value,
      sourceUrl: sourceKey.value,
      title: title.value,
      text,
      html: "",
      note: "",
      tags: [],
      hostname: "",
      kind,
      contentType: CONTENT_TYPES.PLAIN,
      epubLocator: {
        spineIndex: spineIndex.value,
        progression: progression.value,
        textQuote: text,
      },
    };
    if (kind === RECORD_KINDS.HIGHLIGHT) {
      payload.color = lastColor.value;
      payload.style = lastStyle.value;
      // `serializeRange` unwraps existing marks first so paths index the
      // original DOM; we repaint from `records` afterwards.
      payload.range = serializeRange(range, new Map(), () => {}) ?? undefined;
    }
    const saved = await sendMessage<Partial<MyZRecord>, MyZRecord>(
      "myz:saveHighlight",
      payload,
    );
    if (saved) {
      records.value = [...records.value, saved];
    }
  }

  async function deleteRecord(id: string) {
    await sendMessage("myz:removeHighlight", { id });
    records.value = records.value.filter((record) => record.id !== id);
  }

  function getRecord(id: string): MyZRecord | undefined {
    return records.value.find((record) => record.id === id);
  }

  /** Patch note/tags/colour/style on an existing EPUB highlight. */
  async function updateRecord(
    id: string,
    patch: {
      note?: string;
      tags?: string[];
      color?: string;
      style?: HIGHLIGHT_STYLES;
    },
  ) {
    const current = getRecord(id);
    if (!current) {
      return;
    }
    const payload: Partial<MyZRecord> = {
      id,
      kind: current.kind,
      note: patch.note ?? current.note ?? "",
      tags: patch.tags ?? current.tags ?? [],
    };
    if (current.kind === RECORD_KINDS.HIGHLIGHT) {
      payload.color = patch.color ?? current.color ?? lastColor.value;
      payload.style = patch.style ?? current.style ?? lastStyle.value;
    }
    const updated = await sendMessage<Partial<MyZRecord>, MyZRecord>(
      "myz:updateHighlight",
      payload,
    );
    if (updated) {
      records.value = records.value.map((record) =>
        record.id === id ? updated : record,
      );
      if (patch.color) {
        lastColor.value = patch.color;
      }
      if (patch.style) {
        lastStyle.value = patch.style;
      }
    }
  }

  function init() {
    void loadPreferences();
    void refreshRecents();
    void openFromQuery();
  }

  watch([effectiveTheme, scheme], () => {
    if (book.value && status.value === "ready") {
      // Preserve the reading position: the iframe reload restores from
      // `pendingProgression`, which is otherwise only set on open/chapter change.
      pendingProgression.value = progression.value;
      renderChapter();
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
    records,
    tagOptions,
    sourceKey,
    colorPalette,
    lastColor,
    lastStyle,
    init,
    openLocal,
    openUrl,
    openRecent,
    openBytes,
    goToChapter,
    openTocEntry,
    openInternalHref,
    setProgression,
    loadRecords,
    applyCurrentChapter,
    createHighlight,
    deleteRecord,
    getRecord,
    updateRecord,
  };
});
