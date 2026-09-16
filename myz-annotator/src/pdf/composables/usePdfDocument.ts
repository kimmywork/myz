import { sendMessage } from "@myz/shared/messaging";
import { SOURCE_TYPES } from "@myz/shared/types";
import { ref as createRef } from "vue";
import { fingerprintPdf } from "../fingerprint.js";
import {
  loadPdfFromBytes,
  loadPdfFromUrl,
  type PdfDocument,
} from "../pdf-document.js";
import {
  isPermissionError,
  pickLocalPdf,
  restoreLocalPdf,
  sourceKeyOf,
  supportsFileSystemAccess,
  titleFromPdfUrl,
  type PdfSourceRef,
} from "../source.js";
import { getProgress, listProgress, type PdfProgress } from "../storage.js";
import type { ReaderState } from "../stores/state.js";
import type { PdfEngine } from "./usePdfEngine.js";
import type { Settings } from "@/background/settings.js";

export interface DocumentDeps {
  engine: PdfEngine;
  annotations: { loadAnnotations: () => Promise<void> };
  outline: { loadFor: (doc: PdfDocument) => void };
}

/** Opening documents (web / local / recents) and bootstrapping from the URL. */
export function usePdfDocument(state: ReaderState, deps: DocumentDeps) {
  let initialized = false;
  // Set when a local open fails only because it needs re-authorization; lets
  // the UI offer a button that retries with user activation.
  const pendingOpen = createRef<PdfProgress | null>(null);

  function setError(message: string) {
    state.error.value = message;
    state.status.value = "error";
  }

  async function loadPreferences() {
    try {
      const settings = await sendMessage<undefined, Settings>(
        "myz:getSettings",
      );
      if (settings?.lastUsedStyle) {
        state.lastStyle.value = settings.lastUsedStyle;
      }
      if (settings?.lastUsedColor) {
        state.lastColor.value = settings.lastUsedColor;
      }
    } catch (err) {
      console.warn("Failed to load highlight preferences", err);
    }
  }

  async function loadDocument(nextDoc: PdfDocument, ref: PdfSourceRef) {
    deps.engine.setDocument(nextDoc, ref);
    pendingOpen.value = null;
    state.pages.value = nextDoc.numPages;
    state.label.value = ref.title;
    state.activeId.value = null;
    state.selection.value = null;
    state.annotations.value = [];
    deps.outline.loadFor(nextDoc);
    const progress = await getProgress(sourceKeyOf(ref));
    const start =
      progress && progress.page >= 1 && progress.page <= nextDoc.numPages
        ? progress.page
        : 1;
    await deps.engine.buildPages(start);
    await deps.annotations.loadAnnotations();
    state.status.value = "ready";
  }

  async function openWeb(url: string) {
    state.status.value = "loading";
    state.error.value = "";
    state.label.value = titleFromPdfUrl(url);
    try {
      const nextDoc = await loadPdfFromUrl(url);
      await loadDocument(nextDoc, {
        kind: "web",
        url,
        title: titleFromPdfUrl(url),
      });
    } catch (err) {
      setError((err as Error)?.message || "无法加载该 PDF");
    }
  }

  async function openBytes(bytes: ArrayBuffer, name = "本地 PDF") {
    const fingerprint = await fingerprintPdf(bytes);
    const nextDoc = await loadPdfFromBytes(bytes);
    await loadDocument(nextDoc, {
      kind: "local",
      fingerprint: fingerprint.hash,
      title: name,
    });
    return fingerprint.hash;
  }

  async function openLocal() {
    if (!supportsFileSystemAccess()) {
      setError("当前浏览器不支持打开本地文件");
      return;
    }
    state.status.value = "loading";
    state.error.value = "";
    try {
      const picked = await pickLocalPdf();
      if (!picked) {
        state.status.value = deps.engine.getDoc() ? "ready" : "landing";
        return;
      }
      const nextDoc = await loadPdfFromBytes(picked.bytes);
      await loadDocument(nextDoc, picked.ref);
    } catch (err) {
      setError((err as Error)?.message || "无法打开本地 PDF");
    }
  }

  async function openRecent(entry: PdfProgress) {
    if (entry.sourceType === SOURCE_TYPES.PDF && entry.fingerprint) {
      state.status.value = "loading";
      state.error.value = "";
      try {
        const restored = await restoreLocalPdf(entry.fingerprint, entry.title);
        if (!restored) {
          setError("找不到该本地文件，请重新打开");
          return;
        }
        const nextDoc = await loadPdfFromBytes(restored.bytes);
        await loadDocument(nextDoc, restored.ref);
      } catch (err) {
        if (isPermissionError(err)) {
          // No user activation in this tab: keep the entry so the UI can offer
          // a retry button (clicking it restores activation).
          pendingOpen.value = entry;
          state.error.value = (err as Error).message;
          state.status.value = "error";
          return;
        }
        setError((err as Error)?.message || "无法打开本地 PDF");
      }
      return;
    }
    if (entry.url) {
      await openWeb(entry.url);
    }
  }

  /** Retries the last local open from a user gesture (grants activation). */
  async function retryPendingOpen() {
    const entry = pendingOpen.value;
    if (!entry) {
      return;
    }
    pendingOpen.value = null;
    await openRecent(entry);
  }

  async function refreshRecents() {
    state.recents.value = (await listProgress()).slice(0, 8);
  }

  async function applyInitialPage(target: number) {
    if (Number.isFinite(target) && target > 0) {
      await deps.engine.goToPage(target);
    }
  }

  async function init() {
    if (initialized) {
      return;
    }
    initialized = true;
    const params = new URLSearchParams(window.location.search);
    const url = params.get("url");
    const fingerprint = params.get("fp");
    const open = params.get("open");
    const targetPage = Number(params.get("page") || "");
    await refreshRecents();
    await loadPreferences();
    if (url) {
      await openWeb(url);
      await applyInitialPage(targetPage);
      return;
    }
    if (fingerprint) {
      await openRecent({
        sourceKey: "",
        sourceType: SOURCE_TYPES.PDF,
        fingerprint,
        page: 1,
        pages: 0,
        updatedAt: "",
        title: "",
      });
      await applyInitialPage(targetPage);
      return;
    }
    if (open === "picker") {
      await openLocal();
      return;
    }
    state.status.value = "landing";
  }

  return {
    pendingOpen,
    loadDocument,
    openWeb,
    openBytes,
    openLocal,
    openRecent,
    retryPendingOpen,
    refreshRecents,
    init,
  };
}
