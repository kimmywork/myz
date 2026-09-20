/**
 * CJK serif font loading for long-form text.
 *
 * The design system picks a Noto Serif regional face from the UI language
 * (SC / TC / HK / JP / KR, see docs/research/design-system §3.5). Font files
 * are bundled locally so the product stays usable offline: only the face for
 * the current language is imported at runtime, so the other four never cost
 * memory or bandwidth on a given device.
 *
 * Each extension-page host applies the region by setting `data-cjk` on its
 * theme root, which the token stylesheet uses to pick `--myz-cjk` / `--myz-sans`
 * (§3.2). The content overlay mirrors the attribute onto the shadow mount point
 * through `@myz/shared/cjk` instead; it must not import this module, because a
 * shadow-root `url()` would resolve against the page we do not own.
 */

import {
  applyCjkRegion,
  cjkRegionFromLanguage,
  detectCjkRegion,
  setCurrentCjkRegion,
  type CjkRegion,
} from "./cjk"

export type { CjkRegion } from "./cjk"
export {
  applyCjkRegion,
  cjkRegionFromLanguage,
  detectCjkRegion,
  getCjkRegion,
} from "./cjk"

const REGION_LOADERS: Record<CjkRegion, () => Promise<unknown>> = {
  sc: () =>
    Promise.all([
      import("@fontsource/noto-serif-sc/400.css"),
      import("@fontsource/noto-serif-sc/600.css"),
    ]),
  tc: () =>
    Promise.all([
      import("@fontsource/noto-serif-tc/400.css"),
      import("@fontsource/noto-serif-tc/600.css"),
    ]),
  hk: () =>
    Promise.all([
      import("@fontsource/noto-serif-hk/400.css"),
      import("@fontsource/noto-serif-hk/600.css"),
    ]),
  jp: () =>
    Promise.all([
      import("@fontsource/noto-serif-jp/400.css"),
      import("@fontsource/noto-serif-jp/600.css"),
    ]),
  kr: () =>
    Promise.all([
      import("@fontsource/noto-serif-kr/400.css"),
      import("@fontsource/noto-serif-kr/600.css"),
    ]),
}

const loadedRegions = new Set<CjkRegion>()

function loadRegionFonts(region: CjkRegion): void {
  if (loadedRegions.has(region)) {
    return
  }
  loadedRegions.add(region)
  void REGION_LOADERS[region]().catch(() => {
    // Fonts are an enhancement; a failed import must never block the UI.
  })
}

/** Set the region, load its font files, and return the region. */
export function setCjkRegion(region: CjkRegion): CjkRegion {
  setCurrentCjkRegion(region)
  if (typeof document !== "undefined") {
    applyCjkRegion(document.documentElement, region)
    applyCjkRegion(document.body, region)
  }
  loadRegionFonts(region)
  return region
}

/**
 * Detect the region from the UI language and apply it. Call once from an
 * extension-page entry (dashboard / popup / PDF reader).
 */
export function ensureCjkFonts(language?: string): CjkRegion {
  return setCjkRegion(
    typeof language === "string"
      ? cjkRegionFromLanguage(language)
      : detectCjkRegion(),
  )
}
