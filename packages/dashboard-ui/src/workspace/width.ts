/* Workspace side-column width rules (design system §3.6 / §4.27).
 *
 * Widths live in local storage only — they are a per-device preference and are
 * never synced. A stored width of 0 means "collapsed".
 */

export const NAV_WIDTH_STORAGE_KEY = "myz.workspace.nav-width"
export const PANEL_WIDTH_STORAGE_KEY = "myz.workspace.panel-width"

export const NAV_WIDTH_DEFAULT = 240
export const NAV_WIDTH_MIN = 200
export const NAV_WIDTH_MAX = 320

export const PANEL_WIDTH_DEFAULT = 280
export const PANEL_WIDTH_MIN = 260
export const PANEL_WIDTH_MAX = 380

/** Keyboard resize step (§4.27: ←/→ adjust by 8px). */
export const WIDTH_STEP = 8

export type WidthStorage = Pick<Storage, "getItem" | "setItem">

export function clampWidth(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min
  }
  return Math.min(max, Math.max(min, Math.round(value)))
}

/** One keyboard step, clamped to the same bounds as dragging. */
export function stepWidth(
  current: number,
  delta: number,
  min: number,
  max: number,
): number {
  return clampWidth(current + delta, min, max)
}

/**
 * Reads a persisted width. Missing or malformed values fall back to the
 * default; a stored `0` is preserved because it means "collapsed".
 */
export function readStoredWidth(
  storage: WidthStorage | null | undefined,
  key: string,
  fallback: number,
  min: number,
  max: number,
): number {
  if (!storage) {
    return fallback
  }
  let raw: string | null = null
  try {
    raw = storage.getItem(key)
  } catch {
    return fallback
  }
  if (raw === null || raw === "") {
    return fallback
  }
  const parsed = Number(raw)
  if (!Number.isFinite(parsed)) {
    return fallback
  }
  if (parsed === 0) {
    return 0
  }
  if (parsed < min || parsed > max) {
    return clampWidth(parsed, min, max)
  }
  return Math.round(parsed)
}

export function writeStoredWidth(
  storage: WidthStorage | null | undefined,
  key: string,
  width: number,
): void {
  if (!storage) {
    return
  }
  try {
    storage.setItem(key, String(Math.round(width)))
  } catch {
    /* Storage can be unavailable (quota, disabled); width is cosmetic. */
  }
}

/** Toggle helper for Enter: collapsed (0) → default, otherwise → 0. */
export function toggleCollapsed(current: number, fallback: number): number {
  return current > 0 ? 0 : fallback
}

/** Access to `localStorage`, or null when it is unavailable. */
export function browserWidthStorage(): WidthStorage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage
  } catch {
    return null
  }
}
