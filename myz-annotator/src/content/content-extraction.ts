/**
 * Content extraction utilities for AI and other features
 */
import { ZEN_SELECTOR_MAP } from "./zen-config.js";
import { normalizeWhitespace } from "@/shared/highlightUtils.js";

function resolveSelectorForUrl(url: string): string | null {
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
    console.warn("[ContentExtraction] Error resolving selector for URL:", err);
  }
  return null;
}

const CONTENT_STRATEGIES = [
  // Strategy 0: Explicit configuration
  () => {
    const selector = resolveSelectorForUrl(window.location.href);
    return selector ? document.querySelector(selector) : null;
  },
  // Strategy 1: Article (more specific content)
  () => document.querySelector("article, [role='article']"),
  // Strategy 2: Main (broader container)
  () => document.querySelector("main, [role='main']"),
  // Strategy 3: Common content classes and IDs
  () =>
    document.querySelector(
      "#article, #article-content, #content, #main, .post-content, .entry-content, .article-content, .article, .content, .main",
    ),
  // Strategy 4: Heuristic-based selection
  () => {
    const candidates = Array.from(
      document.querySelectorAll("div, section, article"),
    ).filter((el) => {
      const textLength = el.textContent?.length || 0;
      const hasParagraphs = el.querySelectorAll("p").length > 2;
      const isContentLikely = textLength > 500 && hasParagraphs;

      // Filter out noise
      const className = (el.className || "").toLowerCase();
      const id = (el.id || "").toLowerCase();
      const isNoise = /(nav|menu|sidebar|header|footer|comment|ad|popup)/.test(
        className + id,
      );

      return isContentLikely && !isNoise;
    });

    return candidates.sort(
      (a, b) => b.textContent.length - a.textContent.length,
    )[0];
  },
];

export function findPrimaryContentElement() {
  for (const strategy of CONTENT_STRATEGIES) {
    const match = strategy();
    if (match) {
      return match;
    }
  }
  return document.body;
}

// Also export a simplified version
export function extractSelectedTextSafely() {
  const selection = window.getSelection();
  if (selection && normalizeWhitespace(selection.toString())) {
    return {
      text: normalizeWhitespace(selection.toString()),
      title: document.title || "",
      url: window.location.href,
    };
  }
  return null;
}
