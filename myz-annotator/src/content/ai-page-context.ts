import { findPrimaryContentElement } from "./content-extraction.js";
import { normalizeWhitespace } from "@/shared/highlightUtils.js";
import { isNodeFromMyz } from "@/shared/serializer.js";
import { collectLeafBlocks } from "./html.js";

const IGNORED_CLASS_PATTERN =
  /(comment|nav|menu|sidebar|footer|header|login|subscribe|popup|modal|ads?)/;
const CHUNK_CHAR_LIMIT = 1800;
const DEFAULT_MAX_TOTAL_CHARS = Number.POSITIVE_INFINITY;
const DEFAULT_MAX_CHUNKS = 80;
const activeAnchors: Set<Element> = new Set();

function isEligibleBlock(node: HTMLElement): boolean {
  if (isNodeFromMyz(node)) {
    return false;
  }
  const className = (node.className || "").toString().toLowerCase();
  const id = (node.id || "").toLowerCase();
  if (IGNORED_CLASS_PATTERN.test(className + id)) {
    return false;
  }
  return true;
}

function registerAnchor(node: Element, chunkId: string) {
  if (!node) {
    return;
  }
  node.setAttribute("data-myz-ai-chunk", chunkId);
  node.classList.add("myz-ai-chunk-anchor");
  activeAnchors.add(node);
}

export function clearAiPageChunkAnchors() {
  activeAnchors.forEach((node) => {
    try {
      node.removeAttribute("data-myz-ai-chunk");
      node.classList.remove("myz-ai-chunk-anchor", "myz-ai-chunk-flash");
    } catch {
      // ignore detached nodes
    }
  });
  activeAnchors.clear();
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export interface AIContextOptions {
  chunkCharLimit?: number;
  maxTotalChars?: number;
  maxChunks?: number;
  registerAnchors?: boolean;
}

export function captureAiPageContext(options: AIContextOptions = {}) {
  const { registerAnchors = true } = options;
  if (registerAnchors) {
    clearAiPageChunkAnchors();
  }

  const chunkCharLimit = clampNumber(
    Number(options.chunkCharLimit) || CHUNK_CHAR_LIMIT,
    800,
    4000,
  );
  const requestedTotal = Number(options.maxTotalChars);
  const maxTotalChars =
    Number.isFinite(requestedTotal) && requestedTotal > 0
      ? requestedTotal
      : DEFAULT_MAX_TOTAL_CHARS;
  const shouldLimitTotalChars =
    Number.isFinite(maxTotalChars) && maxTotalChars > 0;
  const maxChunks = clampNumber(
    Number(options.maxChunks) || DEFAULT_MAX_CHUNKS,
    5,
    120,
  );

  const root = findPrimaryContentElement() || document.body;
  const blocks = collectLeafBlocks(maxChunks * 3, 5, root, isEligibleBlock);
  const chunks: Array<{
    id: string;
    order: number;
    text: string;
    prefix: string;
    anchorId: string;
    wordCount: number;
  }> = [];
  let chunkParts: string[] = [];
  let chunkLength = 0;
  let chunkIndex = 0;
  let totalChars = 0;
  let wordCount = 0;
  let anchorNode: Element | null = null;
  let truncated = false;
  const resetChunkState = () => {
    chunkParts = [];
    chunkLength = 0;
    anchorNode = null;
  };

  function flushChunk() {
    if (!chunkParts.length || !anchorNode) {
      resetChunkState();
      return;
    }
    const text = normalizeWhitespace(chunkParts.join("\n"));
    if (!text) {
      resetChunkState();
      return;
    }
    const chunkId = `myz-chunk-${Date.now().toString(36)}-${chunkIndex.toString().padStart(3, "0")}`;
    if (registerAnchors) {
      registerAnchor(anchorNode, chunkId);
    }
    const words = text.match(/\S+/g)?.length || 0;
    chunks.push({
      id: chunkId,
      order: chunkIndex,
      text,
      prefix: text.slice(0, 120),
      anchorId: chunkId,
      wordCount: words,
    });
    totalChars += text.length;
    wordCount += words;
    resetChunkState();
    chunkIndex += 1;
  }

  for (const { element: node, text } of blocks) {
    if (chunks.length >= maxChunks) {
      truncated = true;
      break;
    }

    if (shouldLimitTotalChars && totalChars + chunkLength >= maxTotalChars) {
      truncated = true;
      flushChunk();
      break;
    }
    
    const tag = node.tagName?.toLowerCase() || "";
    const isHeading = /^h[1-6]$/.test(tag);
    const minLength = isHeading ? 5 : 30;
    if (text.length < minLength && !isHeading) {
      continue;
    }

    let nextText = text;
    if (shouldLimitTotalChars) {
      const remaining = maxTotalChars - totalChars - chunkLength;
      if (remaining <= 0) {
        truncated = true;
        flushChunk();
        break;
      }
      if (nextText.length > remaining) {
        nextText = nextText.slice(0, remaining).trimEnd();
        truncated = true;
      }
      if (!nextText.trim()) {
        flushChunk();
        break;
      }
    }

    if (!anchorNode) {
      anchorNode = node;
    }
    chunkParts.push(nextText);
    chunkLength += nextText.length;

    if (chunkLength >= chunkCharLimit) {
      flushChunk();
    }

    if (truncated) {
      flushChunk();
      break;
    }
  }

  if (chunks.length < maxChunks && totalChars < maxTotalChars) {
    flushChunk();
  } else {
    resetChunkState();
  }

  if (!chunks.length && root) {
    const fallbackText = normalizeWhitespace(
      (root as HTMLElement).innerText ?? root.textContent ?? "",
    );
    if (fallbackText) {
      const maxFallbackChars = shouldLimitTotalChars
        ? Math.max(0, maxTotalChars - totalChars)
        : fallbackText.length;
      let offset = 0;
      let localIndex = 0;
      while (
        offset < fallbackText.length &&
        offset < maxFallbackChars &&
        (chunks.length < maxChunks || !maxChunks)
      ) {
        const segment = fallbackText.slice(
          offset,
          Math.min(offset + chunkCharLimit, maxFallbackChars),
        );
        if (!segment) {
          break;
        }
        const chunkId = `myz-chunk-${Date.now().toString(36)}-root-${localIndex}`;
        if (registerAnchors) {
          registerAnchor(root, chunkId);
        }
        const words = segment.match(/\S+/g)?.length || 0;
        chunks.push({
          id: chunkId,
          order: chunks.length,
          text: segment,
          prefix: segment.slice(0, 160),
          anchorId: chunkId,
          wordCount: words,
        });
        totalChars += segment.length;
        wordCount += words;
        offset += chunkCharLimit;
        localIndex += 1;
        if (chunks.length >= maxChunks) {
          truncated = true;
          break;
        }
        if (shouldLimitTotalChars && totalChars >= maxTotalChars) {
          truncated = true;
          break;
        }
      }
    }
  }

  return {
    title: document.title || "",
    url: window.location.href,
    chunkCount: chunks.length,
    totalChars,
    wordCount,
    chunkCharLimit,
    truncated: truncated || totalChars >= maxTotalChars,
    maxChunks,
    chunks,
  };
}

function getChunkSelector(chunkId: string): string {
  const escaped =
    typeof CSS !== "undefined" && CSS.escape
      ? CSS.escape(chunkId)
      : chunkId.replace(/["\\]/g, "\\$&");
  return `[data-myz-ai-chunk="${escaped}"]`;
}

function unwrapHighlight(node: Element) {
  if (!node || !node.parentNode) {
    return;
  }
  const parent = node.parentNode;
  while (node.firstChild) {
    parent.insertBefore(node.firstChild, node);
  }
  parent.removeChild(node);
}

function createFlashRange(range: Range) {
  const highlight = document.createElement("span");
  highlight.className = "myz-ai-chunk-flash";
  try {
    range.surroundContents(highlight);
  } catch {
    return;
  }
  highlight.scrollIntoView({ behavior: "smooth", block: "center" });
  setTimeout(() => {
    unwrapHighlight(highlight);
  }, 1600);
}

function findTextInChunk(
  root: Element,
  snippet: string,
): { node: Node; start: number; end: number } | null {
  const target = normalizeWhitespace(snippet);
  if (!target) {
    return null;
  }
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const node = walker.currentNode;
    const text = node.textContent ?? "";
    const index = text.indexOf(target);
    if (index !== -1) {
      return { node, start: index, end: index + target.length };
    }
  }
  return null;
}

function focusSnippet(target: Element, snippet: string) {
  const match = findTextInChunk(target, snippet);
  if (!match) {
    return false;
  }
  const range = document.createRange();
  range.setStart(match.node, match.start);
  range.setEnd(match.node, match.end);
  createFlashRange(range);
  return true;
}

export function scrollToAiChunk(chunkId: string, snippet = ""): boolean {
  const target = document.querySelector(getChunkSelector(chunkId));
  if (!target) {
    return false;
  }
  if (snippet && focusSnippet(target, snippet)) {
    return true;
  }
  target.classList.add("myz-ai-chunk-flash");
  target.scrollIntoView({ behavior: "smooth", block: "center" });
  setTimeout(() => {
    target.classList.remove("myz-ai-chunk-flash");
  }, 1600);
  return true;
}

export function extractPageContentForAi() {
  try {
    const result = captureAiPageContext({
      maxTotalChars: 15000,
      registerAnchors: false,
    });

    const text = result.chunks.map((c) => c.text).join("\n\n");

    return {
      text,
      title: result.title,
      url: result.url,
    };
  } catch (error) {
    console.error("Content extraction failed:", error);
    return {
      text: normalizeWhitespace(document.body.textContent || ""),
      title: document.title || "",
      url: window.location.href,
    };
  }
}
