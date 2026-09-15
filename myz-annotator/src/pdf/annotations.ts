import type { MyZRecord } from "@myz/shared/types";

export interface PdfRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PdfSelection {
  pageNumber: number;
  text: string;
  occurrenceIndex: number;
  rects: PdfRect[];
}

export function collectTextNodes(root: HTMLElement): {
  nodes: Text[];
  text: string;
} {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  let text = "";
  let node = walker.nextNode();
  while (node) {
    const textNode = node as Text;
    nodes.push(textNode);
    text += textNode.data;
    node = walker.nextNode();
  }
  return { nodes, text };
}

function offsetOf(nodes: Text[], container: Node, offset: number): number {
  let acc = 0;
  for (const node of nodes) {
    if (node === container) {
      return acc + offset;
    }
    acc += node.data.length;
  }
  return acc;
}

function nodeAtOffset(
  nodes: Text[],
  offset: number,
): { node: Text; offset: number } | null {
  let acc = 0;
  for (const node of nodes) {
    const length = node.data.length;
    if (offset <= acc + length) {
      return { node, offset: offset - acc };
    }
    acc += length;
  }
  return null;
}

function closestPage(node: Node | null): HTMLElement | null {
  if (!node) {
    return null;
  }
  const element =
    node.nodeType === Node.ELEMENT_NODE
      ? (node as Element)
      : (node.parentElement ?? null);
  return element ? (element.closest(".pdf-page") as HTMLElement | null) : null;
}

function countOccurrences(haystack: string, needle: string): number {
  if (!needle) {
    return 0;
  }
  let count = 0;
  let index = haystack.indexOf(needle);
  while (index >= 0) {
    count += 1;
    index = haystack.indexOf(needle, index + needle.length);
  }
  return count;
}

function locateTextRange(
  pageEl: HTMLElement,
  text: string,
  occurrenceIndex: number,
): Range | null {
  const layer = pageEl.querySelector<HTMLElement>(".textLayer");
  if (!layer || !text) {
    return null;
  }
  const { nodes, text: full } = collectTextNodes(layer);
  let index = -1;
  let from = 0;
  for (let i = 0; i <= occurrenceIndex; i += 1) {
    index = full.indexOf(text, from);
    if (index < 0) {
      return null;
    }
    from = index + text.length;
  }
  const start = nodeAtOffset(nodes, index);
  const end = nodeAtOffset(nodes, index + text.length);
  if (!start || !end) {
    return null;
  }
  const range = document.createRange();
  range.setStart(start.node, start.offset);
  range.setEnd(end.node, end.offset);
  return range;
}

/**
 * Applies underline / wavy decorations directly to the text-layer spans so
 * they hug the glyphs (an overlay line at the line-box bottom sits visibly
 * below the text).
 */
function applySpanDecorations(
  pageEl: HTMLElement,
  records: MyZRecord[],
  activeId: string | null,
): void {
  const layer = pageEl.querySelector<HTMLElement>(".textLayer");
  if (!layer) {
    return;
  }
  layer
    .querySelectorAll<HTMLElement>("span.myz-deco-underline,span.myz-deco-wavy")
    .forEach((span) => {
      span.classList.remove("myz-deco-underline", "myz-deco-wavy", "is-active");
      span.style.removeProperty("--myz-color");
      span.removeAttribute("data-myz-id");
    });
  const pageNumber = Number(pageEl.dataset.page || 0);
  records.forEach((record) => {
    const locator = record.pdfLocator;
    if (!locator || locator.pageNumber !== pageNumber) {
      return;
    }
    const style = record.style;
    if (style !== "underline" && style !== "wavy") {
      return;
    }
    const range = locateTextRange(
      pageEl,
      locator.text,
      locator.occurrenceIndex || 0,
    );
    if (!range) {
      return;
    }
    const walker = document.createTreeWalker(layer, NodeFilter.SHOW_TEXT);
    const startNode = range.startContainer;
    const endNode = range.endContainer;
    let active = false;
    let node = walker.nextNode();
    while (node) {
      const textNode = node as Text;
      if (textNode === startNode) {
        active = true;
      }
      if (active) {
        const parent = textNode.parentElement;
        if (parent && parent.tagName === "SPAN") {
          parent.classList.add(
            style === "wavy" ? "myz-deco-wavy" : "myz-deco-underline",
          );
          if (record.color) {
            parent.style.setProperty("--myz-color", record.color);
          }
          parent.dataset.myzId = record.id;
          if (record.id === activeId) {
            parent.classList.add("is-active");
          }
        }
      }
      if (textNode === endNode) {
        break;
      }
      node = walker.nextNode();
    }
  });
}

/**
 * Reads the current window selection and converts it into a PDF locator.
 * Returns null when there is no single-page, non-empty text selection.
 */
export function extractSelection(stage: HTMLElement): PdfSelection | null {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
    return null;
  }
  const range = selection.getRangeAt(0);
  const startPage = closestPage(range.startContainer);
  const endPage = closestPage(range.endContainer);
  if (!startPage || startPage !== endPage || !stage.contains(startPage)) {
    // multi-page selections are explicitly rejected at this stage
    return null;
  }
  const text = range.toString().trim();
  if (!text) {
    return null;
  }
  const textLayer = startPage.querySelector<HTMLElement>(".textLayer");
  if (!textLayer) {
    return null;
  }
  const { nodes, text: fullText } = collectTextNodes(textLayer);
  const startOffset = offsetOf(nodes, range.startContainer, range.startOffset);
  const occurrenceIndex = countOccurrences(
    fullText.slice(0, startOffset),
    text,
  );
  const pageRect = startPage.getBoundingClientRect();
  const rects: PdfRect[] = Array.from(range.getClientRects())
    .filter((rect) => rect.width > 0 && rect.height > 0)
    .map((rect) => ({
      x: (rect.left - pageRect.left) / pageRect.width,
      y: (rect.top - pageRect.top) / pageRect.height,
      width: rect.width / pageRect.width,
      height: rect.height / pageRect.height,
    }));
  if (!rects.length) {
    return null;
  }
  return {
    pageNumber: Number(startPage.dataset.page || 0),
    text,
    occurrenceIndex,
    rects: mergeRects(rects),
  };
}

/** Programmatically selects `target` inside a page's text layer (test use). */
export function selectTextInPage(pageEl: HTMLElement, target: string): boolean {
  const layer = pageEl.querySelector<HTMLElement>(".textLayer");
  if (!layer) {
    return false;
  }
  const { nodes, text } = collectTextNodes(layer);
  const index = text.indexOf(target);
  if (index < 0) {
    return false;
  }
  const start = nodeAtOffset(nodes, index);
  const end = nodeAtOffset(nodes, index + target.length);
  if (!start || !end) {
    return false;
  }
  const range = document.createRange();
  range.setStart(start.node, start.offset);
  range.setEnd(end.node, end.offset);
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
  return true;
}

/**
 * Paints stored annotations for a page into its overlay layer. Rects are
 * normalized to the page box, so overlays survive zoom changes.
 *
 * Each record is wrapped in a group with a single opacity so overlapping
 * rects don't composite into double-dark ink; the ink / underline / wavy
 * decoration is applied per rect via CSS.
 */
export function renderOverlays(
  pageEl: HTMLElement,
  records: MyZRecord[],
  activeId: string | null,
): void {
  const overlay = pageEl.querySelector<HTMLElement>(".pdf-overlayLayer");
  if (!overlay) {
    return;
  }
  overlay.replaceChildren();
  const pageNumber = Number(pageEl.dataset.page || 0);
  records.forEach((record) => {
    const locator = record.pdfLocator;
    if (!locator || locator.pageNumber !== pageNumber) {
      return;
    }
    const rects = mergeRects(locator.rects || []);
    if (!rects.length) {
      return;
    }
    const style = record.style || "clip";
    const group = document.createElement("div");
    group.className =
      "pdf-annotation-group" + (record.id === activeId ? " is-active" : "");
    group.dataset.style = style;
    group.dataset.id = record.id;
    if (record.color) {
      group.style.setProperty("--myz-color", record.color);
    }
    rects.forEach((rect) => {
      const div = document.createElement("div");
      div.className = "pdf-annotation";
      div.dataset.id = record.id;
      div.dataset.style = style;
      div.style.left = `${rect.x * 100}%`;
      div.style.top = `${rect.y * 100}%`;
      div.style.width = `${rect.width * 100}%`;
      div.style.height = `${rect.height * 100}%`;
      group.append(div);
    });
    overlay.append(group);
  });
  applySpanDecorations(pageEl, records, activeId);
}

export function countPageAnnotations(
  pageEl: HTMLElement,
  records: MyZRecord[],
): number {
  const pageNumber = Number(pageEl.dataset.page || 0);
  return records.filter(
    (record) =>
      record.pdfLocator &&
      record.pdfLocator.pageNumber === pageNumber &&
      (record.pdfLocator.rects || []).length > 0,
  ).length;
}

const LINE_Y_TOLERANCE = 0.006;
const LINE_X_GAP = 0.004;

/**
 * Merges rects that sit on the same text line so a multi-span selection
 * produces a single box per line instead of overlapping ones (which caused
 * double ink and double underline lines).
 */
export function mergeRects(rects: PdfRect[]): PdfRect[] {
  const sorted = [...rects].sort((a, b) => a.y - b.y || a.x - b.x);
  const merged: PdfRect[] = [];
  for (const rect of sorted) {
    const last = merged[merged.length - 1];
    const sameLine = last && Math.abs(last.y - rect.y) <= LINE_Y_TOLERANCE;
    const touching = last && rect.x <= last.x + last.width + LINE_X_GAP;
    if (last && sameLine && touching) {
      const right = Math.max(last.x + last.width, rect.x + rect.width);
      const bottom = Math.max(last.y + last.height, rect.y + rect.height);
      last.width = right - last.x;
      last.height = bottom - last.y;
    } else {
      merged.push({ ...rect });
    }
  }
  return merged;
}
