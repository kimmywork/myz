/**
 * CJK region detection and attribute application.
 *
 * Kept free of any font imports so content scripts (which mirror the region
 * onto a shadow mount point and must not bundle the font files) can use it
 * without pulling the loaders in `fonts.ts`.
 */

export type CjkRegion = "sc" | "tc" | "hk" | "jp" | "kr"

let currentRegion: CjkRegion | null = null

/** Map a BCP-47 language tag to a CJK serif region. Unknown languages use SC. */
export function cjkRegionFromLanguage(language?: string | null): CjkRegion {
  const lang = typeof language === "string" ? language.trim().toLowerCase() : ""
  if (!lang) {
    return "sc"
  }
  if (lang.startsWith("zh")) {
    if (lang.includes("hk") || lang.includes("mo")) {
      return "hk"
    }
    if (lang.includes("tw") || lang.includes("hant")) {
      return "tc"
    }
    return "sc"
  }
  if (lang.startsWith("ja")) {
    return "jp"
  }
  if (lang.startsWith("ko")) {
    return "kr"
  }
  return "sc"
}

/**
 * Detect the UI language the same way the spec does: the extension locale
 * first, then the browser language.
 */
export function detectCjkRegion(): CjkRegion {
  const chromeI18n = (
    globalThis as {
      chrome?: { i18n?: { getUILanguage?: () => string } }
    }
  ).chrome?.i18n
  if (chromeI18n?.getUILanguage) {
    try {
      const value = chromeI18n.getUILanguage()
      if (value) {
        return cjkRegionFromLanguage(value)
      }
    } catch {
      // Fall through to navigator.language.
    }
  }
  if (typeof navigator !== "undefined" && navigator.language) {
    return cjkRegionFromLanguage(navigator.language)
  }
  return "sc"
}

/** Write the region onto an element the token stylesheet can scope to. */
export function applyCjkRegion(
  element: HTMLElement | null | undefined,
  region: CjkRegion,
): void {
  if (!element) {
    return
  }
  element.dataset.cjk = region
}

export function getCjkRegion(): CjkRegion {
  return currentRegion ?? "sc"
}

/** Record the active region without touching the DOM. */
export function setCurrentCjkRegion(region: CjkRegion): CjkRegion {
  currentRegion = region
  return region
}
