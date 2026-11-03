/**
 * Language tag handling for on-device translation.
 *
 * Chrome reports and accepts BCP 47 tags. It treats Simplified and Traditional
 * Chinese as distinct targets (`zh` / `zh-Hant`) while callers (and the UI
 * language) use regional tags such as `zh-CN` / `zh-TW`, so everything is
 * funnelled through `normalizeLanguageTag` first.
 */

/** Collapses regional variants onto the tags Chrome's translator understands. */
export function normalizeLanguageTag(tag: string | null | undefined): string {
  const value = typeof tag === "string" ? tag.trim().toLowerCase() : "";
  if (!value) {
    return "";
  }
  if (
    value === "zh" ||
    value.startsWith("zh-hans") ||
    value.startsWith("zh-cn") ||
    value.startsWith("zh-sg") ||
    value.startsWith("zh-my")
  ) {
    return "zh";
  }
  if (
    value.startsWith("zh-hant") ||
    value.startsWith("zh-tw") ||
    value.startsWith("zh-hk") ||
    value.startsWith("zh-mo")
  ) {
    return "zh-Hant";
  }
  return value;
}

/** The primary subtag, e.g. `en` for `en-US`. */
export function baseLanguage(tag: string): string {
  const normalized = normalizeLanguageTag(tag);
  const dash = normalized.indexOf("-");
  return dash === -1 ? normalized : normalized.slice(0, dash);
}

/**
 * The target language for this feature round.
 *
 * The product is Chinese-first and there is no language picker yet, so a
 * Chinese UI maps to Simplified/Traditional and every other UI language falls
 * back to Simplified Chinese. The helper boundary is deliberate: a picker can
 * replace the body without touching callers.
 */
export function resolveTargetLanguage(uiLanguage?: string | null): string {
  return normalizeLanguageTag(uiLanguage) === "zh-Hant" ? "zh-Hant" : "zh";
}

/** The host UI language, via `chrome.i18n` when present and `navigator` else. */
export function uiLanguage(): string {
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

/** Targets offered by the bilingual reading mode's language menu. */
export interface TargetLanguageOption {
  tag: string;
  label: string;
}

export const TARGET_LANGUAGE_OPTIONS: readonly TargetLanguageOption[] = [
  { tag: "zh", label: "简体中文" },
  { tag: "zh-Hant", label: "繁體中文" },
  { tag: "en", label: "English" },
  { tag: "ja", label: "日本語" },
  { tag: "ko", label: "한국어" },
  { tag: "fr", label: "Français" },
  { tag: "de", label: "Deutsch" },
  { tag: "es", label: "Español" },
  { tag: "ru", label: "Русский" },
];

/** The stored/selected target, falling back to the UI-language default. */
export function normalizeTargetLanguage(
  tag: string | null | undefined,
): string {
  const normalized = normalizeLanguageTag(tag);
  const exact = TARGET_LANGUAGE_OPTIONS.find(
    (option) => option.tag.toLowerCase() === normalized.toLowerCase(),
  );
  if (exact) {
    return exact.tag;
  }
  const base = baseLanguage(normalized);
  const match = TARGET_LANGUAGE_OPTIONS.find(
    (option) => option.tag.toLowerCase() === base,
  );
  return match ? match.tag : resolveTargetLanguage(uiLanguage());
}

export function targetLanguageLabel(tag: string): string {
  const normalized = normalizeLanguageTag(tag);
  const base = baseLanguage(normalized);
  const option =
    TARGET_LANGUAGE_OPTIONS.find(
      (entry) => entry.tag.toLowerCase() === normalized.toLowerCase(),
    ) ??
    TARGET_LANGUAGE_OPTIONS.find((entry) => entry.tag.toLowerCase() === base);
  return option?.label ?? languageLabel(normalized);
}

/** True when both tags resolve to the exact same translation target. */
export function isSameLanguage(a: string, b: string): boolean {
  const left = normalizeLanguageTag(a);
  const right = normalizeLanguageTag(b);
  if (!left || !right) {
    return false;
  }
  // Simplified and Traditional Chinese are distinct translation targets even
  // though they share the `zh` primary subtag.
  if (
    left === "zh" ||
    left === "zh-Hant" ||
    right === "zh" ||
    right === "zh-Hant"
  ) {
    return left === right;
  }
  return baseLanguage(left) === baseLanguage(right);
}

/** Short human label for the detected/selected languages. */
export function languageLabel(tag: string): string {
  const normalized = normalizeLanguageTag(tag);
  if (!normalized) {
    return "未知语言";
  }
  if (normalized === "zh") {
    return "中文";
  }
  if (normalized === "zh-Hant") {
    return "繁体中文";
  }
  try {
    return (
      new Intl.DisplayNames(["zh-Hans"], { type: "language" }).of(
        baseLanguage(normalized),
      ) ?? normalized
    );
  } catch {
    return normalized;
  }
}
