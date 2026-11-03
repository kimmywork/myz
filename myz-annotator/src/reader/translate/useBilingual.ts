/**
 * Vue state for the bilingual (对照翻译) reading mode.
 *
 * Owns the toggle, the target language, the language-menu status and the
 * translation session, so the PDF and EPUB readers only supply block geometry
 * and a DOM pane. Visibility/scroll scheduling stays in each reader's layer.
 */

import { ref, type Ref } from "vue";
import {
  loadBilingualPreferences,
  saveBilingualPreferences,
} from "./bilingual-preferences.js";
import {
  createBilingualSession,
  type BilingualPhase,
  type BilingualSegment,
  type BilingualSession,
  type BilingualSnapshot,
} from "./bilingual.js";
import { resolveTranslationEngine } from "./engine-provider.js";
import { normalizeTargetLanguage } from "./language.js";
import { createIndexedDbTranslationCache } from "./storage.js";

export interface BilingualController {
  enabled: Ref<boolean>;
  targetLanguage: Ref<string>;
  sourceLanguage: Ref<string>;
  phase: Ref<BilingualPhase>;
  error: Ref<string>;
  downloadProgress: Ref<number>;
  translated: Ref<number>;
  /** True once the user picked a target language (first click opens the menu). */
  hasTarget: Ref<boolean>;
  session: BilingualSession;
  setEnabled(value: boolean): void;
  toggle(): void;
  setTargetLanguage(tag: string): void;
  redetect(): void;
  retry(): void;
  request(segments: BilingualSegment[]): void;
  translationFor(key: string): string | undefined;
}

/**
 * One controller per reader page. `storageKey` keeps the PDF and EPUB toggles
 * (and their language choices) independent.
 */
export function useBilingual(storageKey: string): BilingualController {
  const preferences = loadBilingualPreferences(storageKey);
  const enabled = ref(preferences.enabled);
  const hasTarget = ref(preferences.targetChosen);
  const targetLanguage = ref(preferences.targetLanguage);
  const sourceLanguage = ref("");
  const phase = ref<BilingualPhase>("idle");
  const error = ref("");
  const downloadProgress = ref(0);
  const translated = ref(0);

  const session = createBilingualSession({
    engine: null,
    // Resolved per request: the persisted toggle can be on before this page
    // has done anything, and e2e installs its mock after boot.
    engineProvider: resolveTranslationEngine,
    cache: createIndexedDbTranslationCache(),
    targetLanguage: targetLanguage.value,
  });

  session.subscribe((event) => {
    if (event.type !== "state") {
      return;
    }
    apply(event.snapshot);
  });

  function apply(snapshot: BilingualSnapshot): void {
    phase.value = snapshot.phase;
    sourceLanguage.value = snapshot.sourceLanguage;
    targetLanguage.value = snapshot.targetLanguage;
    error.value = snapshot.error;
    downloadProgress.value = snapshot.downloadProgress;
    translated.value = snapshot.translated;
  }

  function persist(): void {
    saveBilingualPreferences(storageKey, {
      enabled: enabled.value,
      targetLanguage: targetLanguage.value,
      targetChosen: hasTarget.value,
    });
  }

  function start(): void {
    phase.value = "idle";
    error.value = "";
  }

  function setEnabled(value: boolean): void {
    if (enabled.value === value) {
      return;
    }
    enabled.value = value;
    persist();
    if (value) {
      start();
      return;
    }
    session.cancel();
    sourceLanguage.value = "";
    error.value = "";
    downloadProgress.value = 0;
  }

  function request(segments: BilingualSegment[]): void {
    if (!enabled.value || !segments.length) {
      return;
    }
    session.request(segments);
  }

  function setTargetLanguage(tag: string): void {
    const next = normalizeTargetLanguage(tag);
    if (next === targetLanguage.value && enabled.value) {
      return;
    }
    targetLanguage.value = next;
    hasTarget.value = true;
    enabled.value = true;
    persist();
    session.setTargetLanguage(next);
  }

  function redetect(): void {
    if (!enabled.value) {
      return;
    }
    session.redetect();
  }

  function retry(): void {
    session.retry();
  }

  return {
    enabled,
    targetLanguage,
    sourceLanguage,
    phase,
    error,
    downloadProgress,
    translated,
    hasTarget,
    session,
    setEnabled,
    toggle: () => setEnabled(!enabled.value),
    setTargetLanguage,
    redetect,
    retry,
    request,
    translationFor: (key) => session.translationFor(key),
  };
}
