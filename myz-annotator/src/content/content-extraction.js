/**
 * Content extraction utilities for AI and other features
 */

import { isNodeFromMyz } from "../shared/serializer.js";

const MAX_CONTENT_LENGTH = 15000;
const CONTENT_STRATEGIES = [
  // Strategy 1: Main content areas
  () => document.querySelector("main, article, [role='main']"),
  // Strategy 2: Common content classes
  () =>
    document.querySelector(".post-content, .entry-content, .article-content"),
  // Strategy 3: Heuristic-based selection
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

export function extractPageContentForAi() {
  try {
    const contentElement = findPrimaryContentElement() || document.body;

    const clone = contentElement.cloneNode(true);

    // Remove MyZ wrapper elements to avoid duplication
    clone.querySelectorAll(".myz-highlight").forEach((el) => {
      const parent = el.parentNode;
      while (el.firstChild) parent.insertBefore(el.firstChild, el);
      parent.removeChild(el);
    });

    // Remove noise elements
    const noiseSelectors = [
      "nav",
      "header",
      "footer",
      "aside",
      "script",
      "style",
      "noscript",
      ".nav",
      ".navigation",
      ".menu",
      ".sidebar",
      ".ads",
      ".advertisement",
      ".social-share",
      ".comments",
      ".comment",
      ".popup",
      ".modal",
      "#nav",
      "#header",
      "#footer",
      "#sidebar",
      "#ads",
      "#comments",
      '[role="navigation"]',
    ];

    noiseSelectors.forEach((selector) => {
      clone.querySelectorAll(selector).forEach((el) => {
        if (!el.closest(".myz-highlight")) {
          el.remove();
        }
      });
    });

    // Extract clean text
    let text = clone.textContent || "";
    text = text.replace(/\s+/g, " ").trim();

    // Truncate if needed
    if (text.length > MAX_CONTENT_LENGTH) {
      text = text.substring(0, MAX_CONTENT_LENGTH) + "... (truncated)";
    }

    return {
      text,
      title: document.title || "",
      url: window.location.href,
    };
  } catch (error) {
    console.error("Content extraction failed:", error);
    return {
      text: document.body.textContent?.replace(/\s+/g, " ").trim() || "",
      title: document.title || "",
      url: window.location.href,
    };
  }
}

// Also export a simplified version
export function extractSelectedTextSafely() {
  const selection = window.getSelection();
  if (selection && selection.toString().trim()) {
    return {
      text: selection.toString().trim(),
      title: document.title || "",
      url: window.location.href,
    };
  }
  return null;
}
