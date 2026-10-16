import type { MyZRecord } from "@myz/shared/types";
import { applySpanDecorations } from "./annotations/decorations.js";
import { mergeRects, type PdfRect } from "./annotations/geometry.js";
import {
  closestPage,
  collectTextNodes,
  countOccurrences,
  nodeAtOffset,
  offsetOf,
} from "./annotations/text-range.js";
import { selectionBlocksForRange } from "./text-selection.js";

export type { PdfRect } from "./annotations/geometry.js";
export { mergeRects, countPageAnnotations } from "./annotations/geometry.js";
export { collectTextNodes } from "./annotations/text-range.js";

export interface PdfSelection {
  pageNumber: number;
  text: string;
  /** Paragraph blocks reconstructed from the geometry (for translation). */
  blocks: string[];
  occurrenceIndex: number;
  rects: PdfRect[];
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
  if (!text) return null;
  const textLayer = startPage.querySelector<HTMLElement>(".textLayer");
  if (!textLayer) return null;
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
  if (!rects.length) return null;
  const blocks = selectionBlocksForRange(startPage, range);
  return {
    pageNumber: Number(startPage.dataset.page || 0),
    text,
    blocks: blocks.length ? blocks : [text],
    occurrenceIndex,
    rects: mergeRects(rects),
  };
}

/** Programmatically selects `target` inside a page's text layer (test use). */
export function selectTextInPage(pageEl: HTMLElement, target: string): boolean {
  const layer = pageEl.querySelector<HTMLElement>(".textLayer");
  if (!layer) return false;
  const { nodes, text } = collectTextNodes(layer);
  const index = text.indexOf(target);
  if (index < 0) return false;
  const start = nodeAtOffset(nodes, index);
  const end = nodeAtOffset(nodes, index + target.length);
  if (!start || !end) return false;
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
 * normalized to the page box, so overlays survive zoom changes. Each record is
 * wrapped in a group with a single opacity so overlapping rects don't composite
 * into double-dark ink; the ink / underline / wavy decoration is applied per
 * rect via CSS.
 */
export function renderOverlays(
  pageEl: HTMLElement,
  records: MyZRecord[],
  activeId: string | null,
): void {
  const overlay = pageEl.querySelector<HTMLElement>(".pdf-overlayLayer");
  if (!overlay) return;
  overlay.replaceChildren();
  const pageNumber = Number(pageEl.dataset.page || 0);
  records.forEach((record) => {
    const locator = record.pdfLocator;
    if (!locator || locator.pageNumber !== pageNumber) return;
    const rects = mergeRects(locator.rects || []);
    if (!rects.length) return;
    const style = record.style || "clip";
    const group = document.createElement("div");
    group.className =
      "pdf-annotation-group" + (record.id === activeId ? " is-active" : "");
    group.dataset.style = style;
    group.dataset.id = record.id;
    if (record.color) group.style.setProperty("--myz-color", record.color);
    rects.forEach((rect) => {
      // Grow the overlay vertically so tall glyphs (CJK) are not left outside
      // the paint; the group's single opacity keeps overlaps from darkening.
      const padY = rect.height * 0.14;
      const top = Math.max(0, rect.y - padY);
      const bottom = Math.min(1, rect.y + rect.height + padY);
      const div = document.createElement("div");
      div.className = "pdf-annotation";
      div.dataset.id = record.id;
      div.dataset.style = style;
      div.style.left = `${rect.x * 100}%`;
      div.style.top = `${top * 100}%`;
      div.style.width = `${rect.width * 100}%`;
      div.style.height = `${(bottom - top) * 100}%`;
      group.append(div);
    });
    overlay.append(group);
  });
  applySpanDecorations(pageEl, records, activeId);
}
