/**
 * Reads resolved design tokens for canvas painting. The canvas API needs literal
 * colors, so the live `--myz-*` values are resolved from the document root at
 * call time (which already carries the active scheme/theme).
 */

function readToken(name: string, fallback: string): string {
  if (typeof getComputedStyle !== "function") return fallback;
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
  return value || fallback;
}

export function readAccentColor(): string {
  return readToken("--myz-accent", "#1b365d");
}

export function readAccentHoverColor(): string {
  return readToken("--myz-accent-hover", "#152a4a");
}

export function readOnAccentColor(): string {
  return readToken("--myz-on-accent", "#faf9f5");
}
