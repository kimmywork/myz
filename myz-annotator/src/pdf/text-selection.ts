/**
 * Geometry-based text selection for the PDF text layer.
 *
 * The native browser selection maps points in the whitespace between blocks to
 * an unpredictable later span (pdf.js lays every run out absolutely), so a drag
 * past the end of a paragraph can swallow the next ones. These helpers map
 * viewport points back onto the geometry-derived lines/blocks and drive the
 * window selection directly, matching how HTML/EPUB selection behaves.
 */

import {
  groupIntoBlocks,
  groupIntoLines,
  unionRect,
  verticalDistance,
  type MeasuredRect,
  type TextRect,
} from "./text-blocks.js";

interface SpanItem {
  el: HTMLElement;
  node: Text;
  rect: TextRect;
}

interface TextPosition {
  node: Text;
  offset: number;
}

function rectOf(el: HTMLElement): TextRect {
  const rect = el.getBoundingClientRect();
  return {
    top: rect.top,
    bottom: rect.bottom,
    left: rect.left,
    right: rect.right,
  };
}

function collectSpans(pageEl: HTMLElement): SpanItem[] {
  const spans = Array.from(
    pageEl.querySelectorAll<HTMLElement>(".textLayer span"),
  );
  const items: SpanItem[] = [];
  for (const el of spans) {
    const node = el.firstChild;
    if (!(node instanceof Text) || !node.data.length) {
      continue;
    }
    const rect = rectOf(el);
    if (rect.bottom - rect.top <= 0 || rect.right - rect.left <= 0) {
      continue;
    }
    items.push({ el, node, rect });
  }
  return items;
}

function linesOf(pageEl: HTMLElement): SpanItem[][] {
  return groupIntoLines(collectSpans(pageEl));
}

function lineRect(line: SpanItem[]): MeasuredRect {
  return unionRect(line.map((item) => item.rect));
}

function firstNonEmpty(line: SpanItem[]): SpanItem {
  return line.find((item) => item.node.data.trim().length > 0) ?? line[0];
}

function lastNonEmpty(line: SpanItem[]): SpanItem {
  for (let index = line.length - 1; index >= 0; index -= 1) {
    if (line[index].node.data.trim().length > 0) {
      return line[index];
    }
  }
  return line[line.length - 1];
}

function startOfLine(line: SpanItem[]): TextPosition {
  const item = firstNonEmpty(line);
  let offset = 0;
  while (offset < item.node.data.length && /\s/.test(item.node.data[offset])) {
    offset += 1;
  }
  return { node: item.node, offset };
}

function endOfLine(line: SpanItem[]): TextPosition {
  const item = lastNonEmpty(line);
  let offset = item.node.data.length;
  while (offset > 0 && /\s/.test(item.node.data[offset - 1])) {
    offset -= 1;
  }
  return { node: item.node, offset };
}

function startOfItem(item: SpanItem): TextPosition {
  return { node: item.node, offset: 0 };
}

function caretAt(x: number, y: number): TextPosition | null {
  const doc = document as Document & {
    caretPositionFromPoint?: (
      x: number,
      y: number,
    ) => { offsetNode: Node; offset: number } | null;
    caretRangeFromPoint?: (x: number, y: number) => Range | null;
  };
  if (typeof doc.caretPositionFromPoint === "function") {
    const position = doc.caretPositionFromPoint(x, y);
    if (position && position.offsetNode instanceof Text) {
      return { node: position.offsetNode, offset: position.offset };
    }
    return null;
  }
  if (typeof doc.caretRangeFromPoint === "function") {
    const range = doc.caretRangeFromPoint(x, y);
    if (range && range.startContainer instanceof Text) {
      return { node: range.startContainer, offset: range.startOffset };
    }
  }
  return null;
}

function positionInItem(item: SpanItem, x: number, y: number): TextPosition {
  const caret = caretAt(x, y);
  if (caret && (caret.node === item.node || item.el.contains(caret.node))) {
    return caret;
  }
  const width = Math.max(1, item.rect.right - item.rect.left);
  const ratio = Math.min(1, Math.max(0, (x - item.rect.left) / width));
  return {
    node: item.node,
    offset: Math.round(ratio * item.node.data.length),
  };
}

/** Character position under a point that lies inside the line's box. */
function positionInLine(line: SpanItem[], x: number, y: number): TextPosition {
  const rect = lineRect(line);
  if (x <= rect.left) {
    return startOfLine(line);
  }
  if (x >= rect.right) {
    return endOfLine(line);
  }
  const item =
    line.find((entry) => x <= entry.rect.right) ?? line[line.length - 1];
  if (x <= item.rect.left) {
    return startOfItem(item);
  }
  return positionInItem(item, x, y);
}

function lineContainsY(line: SpanItem[], y: number, tolerance = 2): boolean {
  const rect = lineRect(line);
  return y >= rect.top - tolerance && y <= rect.bottom + tolerance;
}

function horizontalDistance(rect: TextRect, x: number): number {
  if (x < rect.left) {
    return rect.left - x;
  }
  if (x > rect.right) {
    return x - rect.right;
  }
  return 0;
}

/** Line under the point, preferring one that also contains `x` (columns). */
function lineAtPoint(
  lines: SpanItem[][],
  x: number,
  y: number,
): SpanItem[] | null {
  const candidates = lines.filter((line) => lineContainsY(line, y));
  if (!candidates.length) {
    return null;
  }
  const containing = candidates.find((line) => {
    const rect = lineRect(line);
    return x >= rect.left - 2 && x <= rect.right + 2;
  });
  if (containing) {
    return containing;
  }
  return candidates.reduce(
    (best, line) => {
      const distance = horizontalDistance(lineRect(line), x);
      return distance < best.distance ? { line, distance } : best;
    },
    { line: candidates[0], distance: Number.POSITIVE_INFINITY },
  ).line;
}

/**
 * Nearest line to the point; vertical distance dominates but horizontal
 * distance breaks ties so a point in one column does not resolve to another.
 */
function nearestLineIndex(lines: SpanItem[][], x: number, y: number): number {
  let best = 0;
  let bestDistance = Number.POSITIVE_INFINITY;
  lines.forEach((line, index) => {
    const rect = lineRect(line);
    const distance = verticalDistance(rect, y) + horizontalDistance(rect, x);
    if (distance < bestDistance - 1e-6) {
      bestDistance = distance;
      best = index;
    }
  });
  return best;
}

/** Anchor endpoint: the character under the point, or the nearest line edge. */
function resolveAnchor(
  lines: SpanItem[][],
  x: number,
  y: number,
): TextPosition {
  const containing = lineAtPoint(lines, x, y);
  if (containing) {
    return positionInLine(containing, x, y);
  }
  const index = nearestLineIndex(lines, x, y);
  const line = lines[index];
  return y < lineRect(line).top ? startOfLine(line) : endOfLine(line);
}

/**
 * Focus endpoint. Inside a line it maps to a character; in the gap between
 * blocks it clamps to the block boundary in the drag direction, so overshoot
 * never bleeds into the next paragraph.
 */
function resolveFocus(
  lines: SpanItem[][],
  x: number,
  y: number,
  forward: boolean,
): TextPosition {
  const containing = lineAtPoint(lines, x, y);
  if (containing) {
    return positionInLine(containing, x, y);
  }
  const index = nearestLineIndex(lines, x, y);
  const line = lines[index];
  if (y < lineRect(line).top) {
    if (forward && index > 0) {
      return endOfLine(lines[index - 1]);
    }
    return startOfLine(line);
  }
  if (forward) {
    return endOfLine(line);
  }
  return index < lines.length - 1
    ? startOfLine(lines[index + 1])
    : endOfLine(line);
}

function clampOffset(position: TextPosition): TextPosition {
  return {
    node: position.node,
    offset: Math.min(Math.max(0, position.offset), position.node.data.length),
  };
}

function applySelection(anchor: TextPosition, focus: TextPosition): boolean {
  const start = clampOffset(anchor);
  const end = clampOffset(focus);
  if (start.node === end.node && start.offset === end.offset) {
    return false;
  }
  const anchorRange = document.createRange();
  anchorRange.setStart(start.node, start.offset);
  const focusRange = document.createRange();
  focusRange.setStart(end.node, end.offset);
  const forward =
    anchorRange.compareBoundaryPoints(Range.START_TO_START, focusRange) <= 0;
  const range = document.createRange();
  range.setStart(
    forward ? start.node : end.node,
    forward ? start.offset : end.offset,
  );
  range.setEnd(
    forward ? end.node : start.node,
    forward ? end.offset : start.offset,
  );
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
  return true;
}

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
  if (!lines.length) {
    return false;
  }
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
  if (!lines.length) {
    return false;
  }
  const blocks = groupIntoBlocks(lines);
  const line = lineAtPoint(lines, x, y) ?? lines[nearestLineIndex(lines, x, y)];
  const block = blocks.find((candidate) => candidate.includes(line));
  if (!block) {
    return false;
  }
  return applySelection(
    startOfLine(block[0]),
    endOfLine(block[block.length - 1]),
  );
}
