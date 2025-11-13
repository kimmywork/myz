import { ZEN_SELECTOR_MAP } from "./zen-config.js";

function resolveSelectorForUrl(url) {
  try {
    for (const rule of ZEN_SELECTOR_MAP) {
      const { pattern, selector } = rule || {};
      if (!selector) continue;
      if (typeof pattern === "string" && url.includes(pattern)) {
        return selector;
      }
      if (pattern instanceof RegExp && pattern.test(url)) {
        return selector;
      }
    }
  } catch (err) {
    console.warn("[Zen] Error resolving selector for URL:", err);
  }
  return null;
}

function findArticleElement() {
  const url = window.location.href;
  const mappedSelector = resolveSelectorForUrl(url);
  const candidates = [
    mappedSelector,
    "article",
    "#article",
    "#article-content",
    ".article",
    ".article-content",
    '[role="article"]',
  ].filter(Boolean);
  for (const sel of candidates) {
    try {
      const el = document.querySelector(sel);
      if (el) return el;
    } catch (err) {
      console.warn("[Zen] Error resolving selector for URL:", err);
    }
  }
  return null;
}

export function hasArticleElement() {
  return Boolean(findArticleElement());
}

export function isZenModeEnabled() {
  return document.documentElement.classList.contains("myz-zen-enabled");
}

export function getZenTargetElement() {
  const current = document.querySelector(".myz-zen-target-keep");
  if (current) return current;
  return findArticleElement();
}

export function enableZenMode() {
  if (isZenModeEnabled()) return true;
  const article = findArticleElement();
  if (!article) return false;
  const styleId = "myz-zen-style";
  let style = document.getElementById(styleId);
  if (!style) {
    style = document.createElement("style");
    style.id = styleId;
    style.textContent = buildZenCss();
    document.head.appendChild(style);
  }
  // Mark the target; do NOT move DOM nodes to preserve highlight ranges
  article.classList.add("myz-zen-target-keep");
  // Mark ancestors so CSS can keep them visible without :has()
  const ancestors = [];
  let cur = article.parentElement;
  while (cur && cur !== document.body) {
    ancestors.push(cur);
    cur.classList.add("myz-zen-ancestor-keep");
    cur = cur.parentElement;
  }
  // Always keep body visible as ancestor
  document.body.classList.add("myz-zen-ancestor-keep");
  // Persist for cleanup
  window.__myzZenAncestors = ancestors;
  document.documentElement.classList.add("myz-zen-enabled");
  return true;
}

export function disableZenMode() {
  if (!isZenModeEnabled()) return true;
  document.documentElement.classList.remove("myz-zen-enabled");
  const el = document.querySelector(".myz-zen-target-keep");
  el && el.classList.remove("myz-zen-target-keep");
  try {
    const ancestors = Array.isArray(window.__myzZenAncestors)
      ? window.__myzZenAncestors
      : [];
    ancestors.forEach((node) => node.classList.remove("myz-zen-ancestor-keep"));
    document.body.classList.remove("myz-zen-ancestor-keep");
  } catch (err) {
    console.warn("[Zen] Error during cleanup:", err);
  }

  return true;
}

export function toggleZenMode() {
  if (isZenModeEnabled()) {
    disableZenMode();
    return "off";
  }
  const ok = enableZenMode();
  return ok ? "on" : "error";
}

function buildZenCss() {
  // Pure CSS approach: hide everything except the marked target, its descendants,
  // and explicitly marked ancestors. Avoid :has() for broader compatibility.
  return `
html.myz-zen-enabled, html.myz-zen-enabled body {
  background: #f8fafc !important;
}
/* Hide all elements except target, its descendants, and marked ancestors */
html.myz-zen-enabled body *:not(.myz-zen-target-keep):not(.myz-zen-target-keep *):not(.myz-zen-ancestor-keep) {
  display: none !important;
}
/* Normalize ancestor containers to minimize layout influence and center target */
html.myz-zen-enabled .myz-zen-ancestor-keep {
  padding: 0 !important;
  margin: 0 !important;
  background: transparent !important;
  border: 0 !important;
  box-shadow: none !important;
  width: 100% !important;
  max-width: none !important;
  position: static !important;
}

html.myz-zen-enabled .myz-zen-target-keep {
  display: block !important;
  color: #0f172a !important;
  line-height: 1.8 !important;
  font-size: 18px !important;
  /* Default to 80% width and center on larger screens */
  width: 80% !important;
  margin: 0 auto !important;
  padding: 24px !important;
}
html.myz-zen-enabled .myz-zen-target-keep img, html.myz-zen-enabled .myz-zen-target-keep video, html.myz-zen-enabled .myz-zen-target-keep svg {
  max-width: 100% !important;
  height: auto !important;
}
html.myz-zen-enabled .myz-zen-target-keep a {
  color: #2563eb !important;
  text-decoration: none !important;
}
html.myz-zen-enabled .myz-zen-target-keep pre, html.myz-zen-enabled .myz-zen-target-keep code {
  background: #f1f5f9 !important;
  border-radius: 6px !important;
  padding: 0.25em 0.45em !important;
}
/* On small screens, let the target take full width */
@media (max-width: 768px) {
  html.myz-zen-enabled .myz-zen-target-keep {
    width: 100% !important;
  }
}
@media print {
  html.myz-zen-enabled body *:not(.myz-zen-target-keep):not(.myz-zen-target-keep *):not(.myz-zen-ancestor-keep) {
    display: none !important;
  }
  html.myz-zen-enabled .myz-zen-target-keep {
    margin: 0 !important;
    padding: 0 !important;
    color: #000 !important;
    background: #fff !important;
  }
}
`;
}
