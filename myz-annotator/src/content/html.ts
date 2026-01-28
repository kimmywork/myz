const ALLOWED_HTML_TAGS = new Set([
  "a",
  "b",
  "strong",
  "em",
  "i",
  "u",
  "s",
  "code",
  "pre",
  "blockquote",
  "mark",
  "span",
  "sup",
  "sub",
  "p",
  "div",
  "ul",
  "ol",
  "li",
  "br",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "table",
  "thead",
  "tbody",
  "tr",
  "td",
  "th",
]);

const IGNORED_TEXT_TAGS = new Set(["STYLE", "SCRIPT", "NOSCRIPT", "TEMPLATE"]);

const ALLOWED_HTML_ATTRS: { [key: string]: Set<string> } = {
  a: new Set<string>(["href", "title"]),
  td: new Set<string>(["colspan", "rowspan"]),
  th: new Set<string>(["colspan", "rowspan"]),
};

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

export function serializeRangeToHtml(range: Range): string {
  try {
    const fragment = range.cloneContents();
    if (!fragment || !fragment.childNodes.length) {
      return "";
    }
    const container = document.createElement("div");
    container.appendChild(fragment);
    sanitizeNode(container);
    return container.innerHTML.trim();
  } catch (error) {
    console.warn("Failed to serialize selection HTML", error);
    return "";
  }
}

function sanitizeNode(root: Element) {
  Array.from(root.childNodes).forEach((child) => {
    if (child.nodeType === Node.ELEMENT_NODE) {
      sanitizeElement(child as Element);
    } else if (child.nodeType === Node.COMMENT_NODE) {
      root.removeChild(child);
    }
  });
}

function sanitizeElement(element: Element) {
  const tag = element.tagName.toLowerCase();
  if (!ALLOWED_HTML_TAGS.has(tag)) {
    const parent = element.parentNode;
    if (!parent) {
      return;
    }
    const children = Array.from(element.childNodes);
    children.forEach((child) => parent.insertBefore(child, element));
    parent.removeChild(element);
    children.forEach((child) => {
      if (child.nodeType === Node.ELEMENT_NODE) {
        sanitizeElement(child as Element);
      }
    });
    return;
  }

  Array.from(element.attributes).forEach((attr) => {
    if (!isAllowedAttribute(tag, attr.name)) {
      element.removeAttribute(attr.name);
      return;
    }
    if (attr.name === "href") {
      const sanitizedHref = normalizeHref(attr.value);
      if (sanitizedHref) {
        element.setAttribute("href", sanitizedHref);
      } else {
        element.removeAttribute("href");
      }
    }
  });

  if (tag === "a" && element.hasAttribute("href")) {
    element.setAttribute("target", "_blank");
    element.setAttribute("rel", "noopener noreferrer");
  }

  sanitizeNode(element);
}

function isAllowedAttribute(tag: string, name: string): boolean {
  const whitelist = ALLOWED_HTML_ATTRS[tag];
  if (!whitelist) {
    return false;
  }
  return whitelist.has(name);
}

function normalizeHref(value: string): string | null {
  if (!value || typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  try {
    const parsed = new URL(trimmed, window.location.href);
    const protocol = parsed.protocol.toLowerCase();
    if (
      protocol === "http:" ||
      protocol === "https:" ||
      protocol === "mailto:"
    ) {
      return parsed.toString();
    }
    return null;
  } catch (error) {
    return null;
  }
}

export function isElementInViewport(el: Element): boolean {
  if (!el || !(el instanceof Element)) return false;
  const rect = el.getBoundingClientRect();
  if (!rect || rect.width === 0 || rect.height === 0) return false;
  const vw = window.innerWidth || document.documentElement.clientWidth || 0;
  const vh = window.innerHeight || document.documentElement.clientHeight || 0;
  return rect.bottom > 0 && rect.right > 0 && rect.top < vh && rect.left < vw;
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

function isElementVisible(el: Element): boolean {
  if (!el || !(el instanceof Element)) return false;
  const rects = el.getClientRects();
  if (!rects || rects.length === 0) return false;
  const style = getComputedStyle(el);
  if (style.display === "none" || style.visibility === "hidden") {
    return false;
  }
  return rects[0].width > 0 && rects[0].height > 0;
}

function isBlockElement(el: Element): boolean {
  if (!el || !(el instanceof Element)) return false;
  if (BLOCK_TAG_SET.has(el.tagName)) return true;
  const display = getComputedStyle(el).display;
  return BLOCK_DISPLAY_SET.has(display);
}

function isIgnoredTextTag(el: Element | null): boolean {
  if (!el) return false;
  return IGNORED_TEXT_TAGS.has(el.tagName);
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

function extractInlineText(el: Element): string {
  const parts: string[] = [];
  el.childNodes.forEach((node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      parts.push(node.textContent || "");
      return;
    }
    if (node.nodeType === Node.ELEMENT_NODE) {
      const child = node as Element;
      if (isIgnoredTextTag(child)) {
        return;
      }
      if (isBlockElement(child)) {
        return;
      }
      parts.push(normalizeParagraphText(child));
    }
  });
  return parts.join(" ").replace(/\s+/g, " ").trim();
}

interface HTMLLeaf {
  element: HTMLElement;
  text: string;
}

export function collectLeafBlocks(
  maxCount: number = 300,
  minLength: number = 80,
  root: Element = document.body || document.documentElement,
  filter?: (node: HTMLElement) => boolean,
): HTMLLeaf[] {
  const results: HTMLLeaf[] = [];
  const selected = new WeakSet<HTMLElement>();
  const walker = document.createTreeWalker(
    root,
    NodeFilter.SHOW_ELEMENT,
  );
  // const start = performance.now();
  let node;
  while ((node = walker.nextNode()) && results.length < maxCount) {
    if (!(node instanceof HTMLElement)) continue;
    if (!isElementVisible(node)) continue;
    if (!isBlockElement(node)) continue;
    if (filter && !filter(node)) continue;
    if (hasSelectedAncestor(node, selected)) continue;

    const children = Array.from(node.children);
    const hasBlockChild = children.some((child) => isBlockElement(child));

    let text = "";
    if (hasBlockChild) {
      text = extractInlineText(node);
    } else {
      text = normalizeParagraphText(node);
    }

    if (text && text.length >= minLength) {
      results.push({ element: node, text });
      if (!hasBlockChild) {
        selected.add(node);
      }
    }
  }
  // const duration = Math.round(performance.now() - start);
  // console.log(
  //   "[MyZ Vectoria] collected candidates",
  //   results.length,
  //   "in",
  //   duration,
  //   "ms",
  // );
  return results;
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

export function flashElement(el: HTMLElement): void {
  if (!el || typeof el.classList?.add !== "function") return;
  el.classList.add("myz-ai-chunk-flash");
  setTimeout(() => el.classList.remove("myz-ai-chunk-flash"), 1200);
}

export function waitForNextPaint() {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(resolve);
    });
  });
}
