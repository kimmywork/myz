/**
 * Geometry-based text selection for the PDF text layer.
 *
 * The native browser selection maps points in the whitespace between blocks to
 * an unpredictable later span (pdf.js lays every run out absolutely), so a drag
 * past the end of a paragraph can swallow the next ones. These helpers map
 * viewport points back onto the geometry-derived lines/blocks and drive the
 * window selection directly, matching how HTML/EPUB selection behaves.
 * Line/position helpers live under `pdf/text-selection/`.
 */

import { groupIntoBlocks } from "./text-blocks.js";
import {
  applySelection,
  lineAtPoint,
  nearestLineIndex,
  resolveAnchor,
  resolveFocus,
} from "./text-selection/positions.js";
import { endOfLine, linesOf, startOfLine } from "./text-selection/spans.js";

/** The `.pdf-page` containing the viewport point, if any. */
export function pageAtPoint(
  stage: HTMLElement,
  x: number,
  y: number,
  tolerance = 8,
): HTMLElement | null {
  const pages = Array.from(stage.querySelectorAll<HTMLElement>(".pdf-page"));
  for (const pageEl of pages) {
    const rect = pageEl.getBoundingClientRect();
    if (
      x >= rect.left - tolerance &&
      x <= rect.right + tolerance &&
      y >= rect.top - tolerance &&
      y <= rect.bottom + tolerance
    ) {
      return pageEl;
    }
  }
  return null;
}

/**
 * Replaces the native drag selection with a geometry-snapped range. Returns
 * false when the geometry is unusable (no text, or the drag spans pages), so
 * the caller can fall back to the native selection.
 */
export function selectByDrag(
  pageEl: HTMLElement,
  start: { x: number; y: number },
  end: { x: number; y: number },
): boolean {
  const lines = linesOf(pageEl);
  if (!lines.length) return false;
  const anchor = resolveAnchor(lines, start.x, start.y);
  const forward =
    end.y > start.y + 2 || (Math.abs(end.y - start.y) <= 2 && end.x >= start.x);
  const focus = resolveFocus(lines, end.x, end.y, forward);
  return applySelection(anchor, focus);
}

/** Selects the whole block (paragraph) containing the point. */
export function selectBlockAtPoint(
  pageEl: HTMLElement,
  x: number,
  y: number,
): boolean {
  const lines = linesOf(pageEl);
  if (!lines.length) return false;
  const blocks = groupIntoBlocks(lines);
  const line = lineAtPoint(lines, x, y) ?? lines[nearestLineIndex(lines, x, y)];
  const block = blocks.find((candidate) => candidate.includes(line));
  if (!block) return false;
  return applySelection(
    startOfLine(block[0]),
    endOfLine(block[block.length - 1]),
  );
}

/**
 * Reconstructs the selected text as paragraph blocks from the geometry. The
 * PDF text layer has no separators between runs, so `Range.toString()` glues
 * blocks together ("settingsof"); grouping the intersected lines back into
 * their blocks (with spaces between lines) restores the paragraph structure.
 */
export function selectionBlocksForRange(
  pageEl: HTMLElement,
  range: Range,
): string[] {
  const lines = linesOf(pageEl);
  if (!lines.length) return [];
  const result: string[] = [];
  for (const block of groupIntoBlocks(lines)) {
    const parts: string[] = [];
    for (const line of block) {
      for (const item of line) {
        if (!range.intersectsNode(item.node)) continue;
        const start =
          item.node === range.startContainer ? range.startOffset : 0;
        const end =
          item.node === range.endContainer
            ? range.endOffset
            : item.node.data.length;
        const text = item.node.data.slice(start, end);
        if (text.trim()) parts.push(text);
      }
    }
    const joined = parts.join(" ").replace(/\s+/g, " ").trim();
    if (joined) result.push(joined);
  }
  return result;
}
