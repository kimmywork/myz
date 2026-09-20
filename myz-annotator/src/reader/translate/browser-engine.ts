/**
 * Browser implementation of `TranslationEngine`, backed by Chrome's built-in
 * Translator and Language Detector APIs.
 *
 * Translators are cached per language pair and reused; `destroy()` releases
 * every instance. Every capability is feature-detected so unsupported
 * browsers (Firefox, older Chrome, mobile) fall back to a clear message.
 */

import type {
  DetectedLanguage,
  TranslationAvailability,
  TranslationEngine,
} from "./types.js";

const DOWNLOAD_PROGRESS_EVENT = "downloadprogress";

interface TranslatorInstance {
  translate(input: string, options?: { signal?: AbortSignal }): Promise<string>;
  destroy(): void;
}

interface DetectorInstance {
  detect(
    input: string,
    options?: { signal?: AbortSignal },
  ): Promise<{ detectedLanguage: string; confidence: number }[]>;
  destroy(): void;
}

function normalizeAvailability(
  value: string | undefined,
): TranslationAvailability {
  switch (value) {
    case "available":
    case "downloadable":
    case "downloading":
    case "unavailable":
      return value;
    default:
      return "unavailable";
  }
}

function pairKey(source: string, target: string): string {
  return `${source.toLowerCase()}:${target.toLowerCase()}`;
}

export function isBrowserTranslationSupported(): boolean {
  return Boolean(globalThis.Translator);
}

export function createBrowserTranslationEngine(): TranslationEngine | null {
  const translatorApi = globalThis.Translator;
  const detectorApi = globalThis.LanguageDetector;
  if (!translatorApi) {
    return null;
  }

  const translators = new Map<string, Promise<TranslatorInstance>>();

  const ensureTranslator: TranslationEngine["ensureTranslator"] = async (
    sourceLanguage,
    targetLanguage,
    options,
  ) => {
    const key = pairKey(sourceLanguage, targetLanguage);
    let pending = translators.get(key);
    if (!pending) {
      // NOTE: never pass an AbortSignal to `create()`. Per spec, aborting a
      // create signal after the promise fulfills has the same effect as
      // `destroy()`; aborting the popover's signal would therefore destroy a
      // cached translator and reject every later call. Cancellation is done on
      // the per-method `translate()`/`detect()` signal instead.
      pending = translatorApi.create({
        sourceLanguage,
        targetLanguage,
        monitor: options?.onProgress
          ? (monitor) => {
              monitor.addEventListener(DOWNLOAD_PROGRESS_EVENT, (event) => {
                const loaded = (event as Event & { loaded?: number }).loaded;
                if (typeof loaded === "number") {
                  options.onProgress?.(Math.max(0, Math.min(1, loaded)));
                }
              });
            }
          : undefined,
      });
      // A failed creation must not be cached, or a retry would reuse it.
      pending.catch(() => translators.delete(key));
      translators.set(key, pending);
    }
    await pending;
  };

  return {
    async availability(sourceLanguage, targetLanguage) {
      try {
        return normalizeAvailability(
          await translatorApi.availability({ sourceLanguage, targetLanguage }),
        );
      } catch {
        return "unavailable";
      }
    },

    async detect(text, signal) {
      if (!detectorApi) {
        return [];
      }
      // A fresh detector per call: a detector is cheap to recreate, and it
      // means a cancelled/aborted detection can never poison later ones.
      let current: DetectorInstance | null = null;
      try {
        current = await detectorApi.create();
        const results = await current.detect(text, { signal });
        return results as DetectedLanguage[];
      } catch (error) {
        // Surface the activation error so the UI can ask for another tap;
        // any other failure degrades to "no detection".
        if ((error as { name?: string })?.name === "NotAllowedError") {
          throw error;
        }
        return [];
      } finally {
        current?.destroy();
      }
    },

    ensureTranslator,

    async translate(sourceLanguage, targetLanguage, text, signal) {
      await ensureTranslator(sourceLanguage, targetLanguage);
      const translator = await translators.get(
        pairKey(sourceLanguage, targetLanguage),
      );
      if (!translator) {
        throw new Error("translator unavailable");
      }
      return translator.translate(text, { signal });
    },

    destroy() {
      for (const pending of translators.values()) {
        void pending
          .then((translator) => translator.destroy())
          .catch(() => {
            // Already failed to create; nothing to release.
          });
      }
      translators.clear();
    },
  };
}
