import type { Ref } from "vue";
import { parseEpubAsync, type EpubBook } from "../parse.js";
import {
  pickLocalEpub,
  restoreLocalEpub,
  type EpubSourceRef,
} from "../source.js";
import type { EpubProgress } from "../storage.js";
import { clamp, type EpubReaderStatus } from "./reader-types.js";

interface OpenDeps {
  status: Ref<EpubReaderStatus>;
  error: Ref<string>;
  book: Ref<EpubBook | null>;
  sourceRef: Ref<EpubSourceRef | null>;
  spineIndex: Ref<number>;
  pendingFragment: Ref<string>;
  expandedToc: Ref<Set<string>>;
  tocQuery: Ref<string>;
  currentTocHref: Ref<string>;
  progression: Ref<number>;
  pendingProgression: Ref<number>;
  revokeBlobs: () => void;
  renderChapter: () => void;
  loadRecords: () => Promise<void>;
  persistProgress: () => Promise<void>;
}

/** Open an EPUB from bytes / local pick / URL / recent / query string. */
export function createEpubOpen(deps: OpenDeps) {
  async function openBytes(
    bytes: ArrayBuffer,
    ref: EpubSourceRef,
    options: { spineIndex?: number; progression?: number } = {},
  ) {
    deps.status.value = "loading";
    try {
      deps.revokeBlobs();
      const parsed = await parseEpubAsync(bytes);
      if (!parsed.spine.length) throw new Error("这本 EPUB 没有可阅读的章节");
      deps.book.value = parsed;
      deps.sourceRef.value = ref;
      deps.pendingFragment.value = "";
      deps.expandedToc.value = new Set();
      deps.tocQuery.value = "";
      deps.spineIndex.value = clamp(
        options.spineIndex ?? 0,
        0,
        parsed.spine.length - 1,
      );
      deps.currentTocHref.value =
        parsed.spine[deps.spineIndex.value]?.href || "";
      deps.progression.value = options.progression ?? 0;
      deps.pendingProgression.value = deps.progression.value;
      await deps.loadRecords();
      deps.renderChapter();
      deps.status.value = "ready";
      await deps.persistProgress();
    } catch (err) {
      deps.status.value = "error";
      deps.error.value = (err as Error).message || "无法解析该 EPUB";
    }
  }

  async function openLocal() {
    deps.status.value = "loading";
    try {
      const picked = await pickLocalEpub();
      if (!picked) {
        deps.status.value = deps.book.value ? "ready" : "landing";
        return;
      }
      await openBytes(picked.bytes, picked.ref);
    } catch (err) {
      deps.status.value = "error";
      deps.error.value = (err as Error).message || "打开失败";
    }
  }

  async function openUrl(url: string, options: { title?: string } = {}) {
    deps.status.value = "loading";
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`下载失败（${response.status}）`);
      const bytes = await response.arrayBuffer();
      await openBytes(bytes, {
        kind: "local",
        fingerprint: `url-${url}`,
        title: options.title || url.split("/").pop() || "EPUB",
      });
    } catch (err) {
      deps.status.value = "error";
      deps.error.value = (err as Error).message || "打开失败";
    }
  }

  async function openRecent(entry: EpubProgress) {
    if (!entry.fingerprint) return;
    deps.status.value = "loading";
    try {
      const restored = await restoreLocalEpub(entry.fingerprint, entry.title);
      if (!restored) {
        deps.status.value = "error";
        deps.error.value = "找不到该文件的授权，请重新打开";
        return;
      }
      await openBytes(restored.bytes, restored.ref, {
        spineIndex: entry.spineIndex,
        progression: entry.progression,
      });
    } catch (err) {
      deps.status.value = "error";
      deps.error.value = (err as Error).message || "打开失败";
    }
  }

  async function openFromQuery() {
    const params = new URLSearchParams(window.location.search);
    const fingerprint = params.get("fp");
    if (!fingerprint) return;
    deps.status.value = "loading";
    try {
      const restored = await restoreLocalEpub(fingerprint);
      if (!restored) {
        deps.status.value = "error";
        deps.error.value = "需要重新授权访问该本地文件";
        return;
      }
      await openBytes(restored.bytes, restored.ref, {
        spineIndex: Number(params.get("spine") || 0),
        progression: Number(params.get("prog") || 0),
      });
    } catch (err) {
      deps.status.value = "error";
      deps.error.value = (err as Error).message || "打开失败";
    }
  }

  return { openBytes, openLocal, openUrl, openRecent, openFromQuery };
}

export type EpubOpenActions = ReturnType<typeof createEpubOpen>;
