/**
 * Shared resolution of the translation engine.
 *
 * Both the selection popover (`useTranslation`) and the bilingual reading mode
 * (`useBilingual`) need the same rules: a single browser engine per page (the
 * Translator API is expensive to recreate and must be released on unload), and
 * a way for tests to publish `window.__MYZ_TRANSLATE_ENGINE__` — including
 * *after* the reader booted, so the override is read lazily on every request.
 */

import { createBrowserTranslationEngine } from "./browser-engine.js";
import type { TranslationEngine } from "./types.js";

interface TranslationGlobals {
  __MYZ_TRANSLATE_ENGINE__?: TranslationEngine | null;
}

/** Fresh browser engine per page, torn down on unload. */
let sharedEngine: TranslationEngine | null = null;

export function defaultTranslationEngine(): TranslationEngine | null {
  if (!sharedEngine) {
    sharedEngine = createBrowserTranslationEngine();
  }
  return sharedEngine;
}

/** `undefined` = no override installed; `null` = explicitly unsupported. */
export function overrideTranslationEngine():
  TranslationEngine | null | undefined {
  const globals = globalThis as TranslationGlobals;
  return Object.prototype.hasOwnProperty.call(
    globals,
    "__MYZ_TRANSLATE_ENGINE__",
  )
    ? globals.__MYZ_TRANSLATE_ENGINE__
    : undefined;
}

/**
 * Resolves the engine for the current call. Reading the override lazily keeps
 * e2e tests working no matter when they install their mock.
 */
export function resolveTranslationEngine(): TranslationEngine | null {
  const override = overrideTranslationEngine();
  return override === undefined ? defaultTranslationEngine() : override;
}

if (typeof window !== "undefined") {
  window.addEventListener("pagehide", () => {
    sharedEngine?.destroy();
    sharedEngine = null;
  });
}
