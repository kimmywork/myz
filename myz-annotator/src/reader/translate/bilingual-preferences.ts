/**
 * Persisted bilingual-mode preferences.
 *
 * Only the toggle, the chosen target language and whether the user ever picked
 * one are sticky; translations themselves live in the shared translation cache
 * (`myz_translate_db`). The reader passes its own key so the PDF and EPUB panes
 * can be toggled independently.
 *
 * `targetChosen` is what makes the toolbar button predictable: the first click
 * opens the language menu, later clicks turn the mode straight on with the
 * remembered language.
 */

import { normalizeTargetLanguage } from "./language.js";

export interface BilingualPreferences {
  enabled: boolean;
  targetLanguage: string;
  targetChosen: boolean;
}

export function loadBilingualPreferences(
  storageKey: string,
): BilingualPreferences {
  const fallback: BilingualPreferences = {
    enabled: false,
    targetLanguage: normalizeTargetLanguage(""),
    targetChosen: false,
  };
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) {
      return fallback;
    }
    const parsed = JSON.parse(raw) as {
      enabled?: unknown;
      targetLanguage?: unknown;
      targetChosen?: unknown;
    };
    return {
      enabled: parsed.enabled === true,
      targetLanguage: normalizeTargetLanguage(
        typeof parsed.targetLanguage === "string" ? parsed.targetLanguage : "",
      ),
      targetChosen: parsed.targetChosen === true,
    };
  } catch {
    return fallback;
  }
}

export function saveBilingualPreferences(
  storageKey: string,
  preferences: BilingualPreferences,
): void {
  try {
    localStorage.setItem(storageKey, JSON.stringify(preferences));
  } catch {
    // A storage failure must never break reading.
  }
}
