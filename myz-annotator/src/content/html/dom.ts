const IGNORED_TEXT_TAGS = new Set(["STYLE", "SCRIPT", "NOSCRIPT", "TEMPLATE"]);

const BLOCK_DISPLAY_SET = new Set([
  "block",
  "list-item",
  "flex",
  "grid",
  "table",
  "inline-block",
]);
const BLOCK_TAG_SET = new Set([
  "P",
  "LI",
  "BLOCKQUOTE",
  "SECTION",
  "ARTICLE",
  "DIV",
  "UL",
  "OL",
]);

export interface ElementPosition {
  left: number;
  top: number;
  width: number;
  height: number;
}

function isElementVisible(el: Element): boolean {
  if (!el || !(el instanceof Element)) return false;
  const rects = el.getClientRects();
  if (!rects || rects.length === 0) return false;
  const style = getComputedStyle(el);
  if (style.display === "none" || style.visibility === "hidden") return false;
  return rects[0].width > 0 && rects[0].height > 0;
}

function isBlockElement(el: Element): boolean {
  if (!el || !(el instanceof Element)) return false;
  if (BLOCK_TAG_SET.has(el.tagName)) return true;
  return BLOCK_DISPLAY_SET.has(getComputedStyle(el).display);
}

function isIgnoredTextTag(el: Element | null): boolean {
  return !!el && IGNORED_TEXT_TAGS.has(el.tagName);
}

function isWithinIgnoredTag(el: Element | null): boolean {
  let current = el;
  while (current) {
    if (isIgnoredTextTag(current)) return true;
    current = current.parentElement;
  }
  return false;
}

function collectTextFromNode(root: Element): string {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const parts: string[] = [];
  while (walker.nextNode()) {
    const node = walker.currentNode;
    const parent = node.parentElement;
    if (!parent || isWithinIgnoredTag(parent)) continue;
    const text = node.textContent || "";
    if (text.trim()) parts.push(text);
  }
  return parts.join(" ");
}

export function normalizeParagraphText(node: Element): string {
  if (!node) return "";
  if (isIgnoredTextTag(node)) return "";
  const fromInnerText = (node as HTMLElement).innerText;
  const raw =
    fromInnerText && fromInnerText.trim()
      ? fromInnerText
      : collectTextFromNode(node);
  return raw.replace(/\s+/g, " ").trim();
}

function extractInlineText(el: Element): string {
  const parts: string[] = [];
  el.childNodes.forEach((node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      parts.push(node.textContent || "");
      return;
    }
    if (node.nodeType === Node.ELEMENT_NODE) {
      const child = node as Element;
      if (isIgnoredTextTag(child) || isBlockElement(child)) return;
      parts.push(normalizeParagraphText(child));
    }
  });
  return parts.join(" ").replace(/\s+/g, " ").trim();
}

export interface HTMLLeaf {
  element: HTMLElement;
  text: string;
}

export function isElementInViewport(el: Element): boolean {
  if (!el || !(el instanceof Element)) return false;
  const rect = el.getBoundingClientRect();
  if (!rect || rect.width === 0 || rect.height === 0) return false;
  const vw = window.innerWidth || document.documentElement.clientWidth || 0;
  const vh = window.innerHeight || document.documentElement.clientHeight || 0;
  return rect.bottom > 0 && rect.right > 0 && rect.top < vh && rect.left < vw;
}

export function getElementPageRect(el: Element): ElementPosition | null {
  const rect = el?.getBoundingClientRect?.();
  if (!rect) return null;
  return {
    left: rect.left + window.scrollX,
    top: rect.top + window.scrollY,
    width: rect.width,
    height: rect.height,
  };
}

export function isRectValid(rect?: ElementPosition | null): boolean {
  return !!(
    rect &&
    Number.isFinite(rect.left) &&
    Number.isFinite(rect.top) &&
    Number.isFinite(rect.width) &&
    Number.isFinite(rect.height) &&
    rect.width > 0 &&
    rect.height > 0
  );
}

function hasSelectedAncestor(
  node: HTMLElement,
  selected: WeakSet<HTMLElement>,
): boolean {
  let current = node?.parentElement;
  while (current) {
    if (selected.has(current)) return true;
    current = current.parentElement;
  }
  return false;
}

export function collectLeafBlocks(
  maxCount: number = 300,
  minLength: number = 80,
  root: Element = document.body || document.documentElement,
  filter?: (node: HTMLElement) => boolean,
): HTMLLeaf[] {
  const results: HTMLLeaf[] = [];
  const selected = new WeakSet<HTMLElement>();
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
  let node;
  while ((node = walker.nextNode()) && results.length < maxCount) {
    if (!(node instanceof HTMLElement)) continue;
    if (!isElementVisible(node)) continue;
    if (!isBlockElement(node)) continue;
    if (filter && !filter(node)) continue;
    if (hasSelectedAncestor(node, selected)) continue;

    const hasBlockChild = Array.from(node.children).some((child) =>
      isBlockElement(child),
    );
    const text = hasBlockChild
      ? extractInlineText(node)
      : normalizeParagraphText(node);
    if (text && text.length >= minLength) {
      results.push({ element: node, text });
      if (!hasBlockChild) selected.add(node);
    }
  }
  return results;
}

export function waitForNextPaint() {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(resolve);
    });
  });
}
