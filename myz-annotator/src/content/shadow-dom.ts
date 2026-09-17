import shadowStyles from "./styles/shadow.css?inline";

const THEME_KEY = "myz:theme";
const SETTINGS_KEY = "myz::settings";

type EffectiveTheme = "light" | "dark";

/**
 * Resolve the user's theme the same way `@myz/shared/theme` does, without
 * touching the host page's `<html>`: the content overlay must not leak our
 * classes or attributes onto pages we do not own. The result is mirrored onto
 * the shadow mount point, which the token stylesheet can scope to.
 */
function resolveTheme(mode: unknown): EffectiveTheme {
  if (mode === "light" || mode === "dark") {
    return mode;
  }
  if (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-color-scheme: light)").matches
  ) {
    return "light";
  }
  return "dark";
}

function resolveScheme(stored: unknown): string {
  const scheme = (stored as { data?: { colorScheme?: unknown } } | undefined)
    ?.data?.colorScheme;
  return typeof scheme === "string" ? scheme : "paper";
}

function applyThemeAttributes(target: HTMLElement) {
  if (typeof chrome === "undefined" || !chrome.storage?.local) {
    target.dataset.theme = resolveTheme(undefined);
    target.dataset.scheme = "paper";
    return;
  }
  chrome.storage.local.get([THEME_KEY, SETTINGS_KEY], (result) => {
    target.dataset.theme = resolveTheme(result?.[THEME_KEY]);
    target.dataset.scheme = resolveScheme(result?.[SETTINGS_KEY]);
  });
}

function watchTheme(target: HTMLElement): void {
  if (typeof chrome === "undefined" || !chrome.storage?.onChanged) {
    return;
  }
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local") {
      return;
    }
    if (changes[SETTINGS_KEY]) {
      target.dataset.scheme = resolveScheme(
        changes[SETTINGS_KEY].newValue,
      );
    }
    if (changes[THEME_KEY]) {
      target.dataset.theme = resolveTheme(changes[THEME_KEY].newValue);
    }
  });
  if (typeof window !== "undefined" && typeof window.matchMedia === "function") {
    window
      .matchMedia("(prefers-color-scheme: light)")
      .addEventListener("change", () => applyThemeAttributes(target));
  }
}

export function createShadowHost(tag = "div", styles = shadowStyles) {
  const host = document.createElement(tag);
  host.setAttribute("data-myz-host", "1");
  const shadow = host.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent = styles;
  shadow.appendChild(style);
  const mountPoint = document.createElement("div");
  mountPoint.setAttribute("data-myz-mount", "1");
  applyThemeAttributes(mountPoint);
  watchTheme(mountPoint);
  shadow.appendChild(mountPoint);
  document.documentElement.appendChild(host);
  return { host, shadow, mountPoint };
}
