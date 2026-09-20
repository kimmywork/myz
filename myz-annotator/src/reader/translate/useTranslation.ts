/**
 * Vue state for the translation popover.
 *
 * Owns the popover lifecycle (open/close/retry/copy) and the async pipeline
 * state, but not the visuals — `TranslationPopover` renders those. The same
 * composable is used by the PDF reader, the EPUB reader and the web content
 * toolbar so their behaviour cannot drift.
 */

import { computed, ref } from "vue";
import { createBrowserTranslationEngine } from "./browser-engine.js";
import type { TranslationCache } from "./cache.js";
import { resolveTargetLanguage } from "./language.js";
import {
  TranslationError,
  translateText,
  type TranslationPhase,
} from "./service.js";
import { createIndexedDbTranslationCache } from "./storage.js";
import type { TranslationEngine } from "./types.js";

export type TranslationStatus = TranslationPhase | "idle" | "done" | "error";

export interface TranslationPosition {
  top: number;
  left: number;
}

export interface UseTranslationOptions {
  /**
   * Overrides the storage backing. Readers use the extension-origin IndexedDB;
   * the content toolbar passes `chrome.storage.local` so translations are not
   * written into the host page's origin.
   */
  cache?: TranslationCache;
}

interface TranslationGlobals {
  __MYZ_TRANSLATE_ENGINE__?: TranslationEngine | null;
}

/** Fresh browser engine per page, torn down on unload. */
let sharedEngine: TranslationEngine | null = null;

function defaultEngine(): TranslationEngine | null {
  if (!sharedEngine) {
    sharedEngine = createBrowserTranslationEngine();
  }
  return sharedEngine;
}

/** A test may publish `window.__MYZ_TRANSLATE_ENGINE__` (null = unsupported). */
function overrideEngine(): TranslationEngine | null | undefined {
  const globals = globalThis as TranslationGlobals;
  return Object.prototype.hasOwnProperty.call(
    globals,
    "__MYZ_TRANSLATE_ENGINE__",
  )
    ? globals.__MYZ_TRANSLATE_ENGINE__
    : undefined;
}

function currentUiLanguage(): string {
  const chromeApi = (
    globalThis as {
      chrome?: { i18n?: { getUILanguage?: () => string } };
    }
  ).chrome?.i18n;
  try {
    const value = chromeApi?.getUILanguage?.();
    if (value) {
      return value;
    }
  } catch {
    // Fall through to navigator.
  }
  return globalThis.navigator?.language ?? "zh";
}

function messageForError(error: unknown): string {
  if (error instanceof TranslationError) {
    if (error.code === "aborted") {
      return "翻译已取消，请重试";
    }
    return error.message;
  }
  return "翻译失败，请重试";
}

if (typeof window !== "undefined") {
  window.addEventListener("pagehide", () => {
    sharedEngine?.destroy();
    sharedEngine = null;
  });
}

export function useTranslation(options: UseTranslationOptions = {}) {
  const open = ref(false);
  const sourceText = ref("");
  const sourceLanguage = ref("");
  const targetLanguage = ref("zh");
  const status = ref<TranslationStatus>("idle");
  const downloadProgress = ref(0);
  const translation = ref("");
  const errorMessage = ref("");
  const copyError = ref("");
  const copied = ref(false);
  const position = ref<TranslationPosition>({ top: 0, left: 0 });

  const cache = options.cache ?? createIndexedDbTranslationCache();
  let controller: AbortController | null = null;
  let copiedTimer: ReturnType<typeof setTimeout> | null = null;

  const isBusy = computed(
    () =>
      status.value === "detecting" ||
      status.value === "downloading" ||
      status.value === "translating",
  );
  const downloadPercent = computed(() =>
    Math.round(downloadProgress.value * 100),
  );

  function reset() {
    sourceLanguage.value = "";
    targetLanguage.value = resolveTargetLanguage(currentUiLanguage());
    status.value = "idle";
    downloadProgress.value = 0;
    translation.value = "";
    errorMessage.value = "";
    copyError.value = "";
    copied.value = false;
  }

  async function run() {
    controller?.abort();
    controller = new AbortController();
    const signal = controller.signal;
    const override = overrideEngine();
    const engine = override === undefined ? defaultEngine() : override;
    if (!engine) {
      status.value = "error";
      errorMessage.value = "当前浏览器不支持端上翻译";
      return;
    }
    status.value = "detecting";
    errorMessage.value = "";
    copyError.value = "";
    try {
      const outcome = await translateText({
        text: sourceText.value,
        targetLanguage: targetLanguage.value,
        engine,
        cache,
        signal,
        onProgress: (progress) => {
          if (signal.aborted) {
            return;
          }
          status.value = progress.phase;
          if (typeof progress.loaded === "number") {
            downloadProgress.value = progress.loaded;
          }
          if (typeof progress.partial === "string") {
            translation.value = progress.partial;
          }
        },
      });
      if (signal.aborted) {
        return;
      }
      sourceLanguage.value = outcome.sourceLanguage;
      targetLanguage.value = outcome.targetLanguage;
      translation.value = outcome.translation;
      status.value = "done";
    } catch (error) {
      if (signal.aborted) {
        return;
      }
      status.value = "error";
      errorMessage.value = messageForError(error);
    }
  }

  function openFor(
    text: string,
    options: { position?: TranslationPosition; targetLanguage?: string } = {},
  ) {
    const value = typeof text === "string" ? text.trim() : "";
    if (!value) {
      return;
    }
    reset();
    sourceText.value = value;
    if (options.position) {
      position.value = options.position;
    }
    if (options.targetLanguage) {
      targetLanguage.value = options.targetLanguage;
    }
    open.value = true;
    void run();
  }

  function close() {
    controller?.abort();
    controller = null;
    open.value = false;
    reset();
    sourceText.value = "";
  }

  function retry() {
    if (!sourceText.value) {
      return;
    }
    void run();
  }

  async function copy() {
    const value = translation.value;
    if (!value) {
      return;
    }
    try {
      await navigator.clipboard.writeText(value);
      copyError.value = "";
      copied.value = true;
      if (copiedTimer) {
        clearTimeout(copiedTimer);
      }
      copiedTimer = setTimeout(() => {
        copied.value = false;
      }, 1600);
    } catch {
      // Keep this separate from `errorMessage`: the retry action re-runs the
      // translation, which is not what a failed clipboard write needs.
      copyError.value = "复制失败，请手动选择译文";
    }
  }

  return {
    open,
    sourceText,
    sourceLanguage,
    targetLanguage,
    status,
    downloadProgress,
    downloadPercent,
    translation,
    errorMessage,
    copyError,
    copied,
    position,
    isBusy,
    openFor,
    close,
    retry,
    copy,
  };
}
