/**
 * Geometry-only grouping of PDF text-layer spans into lines and blocks
 * (paragraphs).
 *
 * pdf.js positions every text run as an absolutely positioned `<span>` with no
 * block structure in the DOM, so the browser cannot tell a paragraph from the
 * next. These pure helpers derive the structure from the spans' rectangles so
 * selection can snap to whole lines/blocks like it does on HTML pages.
 */

export interface TextRect {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

export interface Positioned {
  rect: TextRect;
}

export interface MeasuredRect extends TextRect {
  height: number;
  width: number;
}

export function measureRect(rect: TextRect): MeasuredRect {
  return {
    ...rect,
    height: rect.bottom - rect.top,
    width: rect.right - rect.left,
  };
}

export function unionRect(rects: TextRect[]): MeasuredRect {
  const top = Math.min(...rects.map((rect) => rect.top));
  const bottom = Math.max(...rects.map((rect) => rect.bottom));
  const left = Math.min(...rects.map((rect) => rect.left));
  const right = Math.max(...rects.map((rect) => rect.right));
  return {
    top,
    bottom,
    left,
    right,
    height: bottom - top,
    width: right - left,
  };
}

/**
 * Groups spans into visual lines: a span joins the current line when its top
 * is within a fraction of the line height (pdf.js runs on one line can differ
 * by a sub-pixel of baseline). A large horizontal gap starts a new segment so
 * side-by-side columns are not treated as one line.
 */
export function groupIntoLines<T extends Positioned>(
  items: T[],
  topToleranceRatio = 0.6,
  horizontalGapRatio = 1.5,
): T[][] {
  const sorted = [...items].sort(
    (a, b) => a.rect.top - b.rect.top || a.rect.left - b.rect.left,
  );
  const lines: T[][] = [];
  for (const item of sorted) {
    const line = lines[lines.length - 1];
    if (line) {
      const lineRect = unionRect(line.map((entry) => entry.rect));
      const itemHeight = item.rect.bottom - item.rect.top;
      const tolerance = Math.max(
        1,
        Math.min(lineRect.height, itemHeight) * topToleranceRatio,
      );
      const sameRow = Math.abs(item.rect.top - lineRect.top) <= tolerance;
      const gap =
        item.rect.left > lineRect.right
          ? item.rect.left - lineRect.right
          : lineRect.left > item.rect.right
            ? lineRect.left - item.rect.right
            : 0;
      const maxGap =
        Math.max(itemHeight, lineRect.height, 12) * horizontalGapRatio;
      if (sameRow && gap <= maxGap) {
        line.push(item);
        continue;
      }
    }
    lines.push([item]);
  }
  return lines;
}

/** True when two segments share enough horizontal range to be one column. */
function horizontallyAligned(a: MeasuredRect, b: MeasuredRect): boolean {
  const overlap = Math.min(a.right, b.right) - Math.max(a.left, b.left);
  return overlap > Math.min(a.width, b.width) * 0.5;
}

interface Block<T> {
  lines: T[][];
  last: MeasuredRect;
  minLeft: number;
}

/**
 * Groups consecutive, horizontally-aligned lines into blocks (paragraphs).
 *
 * A new block starts when the vertical gap is larger than `gapRatio` times the
 * line height (space between paragraphs), when the line is indented past the
 * block's left edge (first-line indent), or when the line height differs
 * noticeably (a heading after body text). This keeps continuous-leading
 * paragraphs — where the indent is the only signal — apart, and keeps separate
 * columns separate.
 */
export function groupIntoBlocks<T extends Positioned>(
  lines: T[][],
  gapRatio = 1.25,
): T[][][] {
  const segments = lines.map((line) => ({
    line,
    rect: unionRect(line.map((entry) => entry.rect)),
  }));
  segments.sort((a, b) => a.rect.top - b.rect.top || a.rect.left - b.rect.left);

  const blocks: Block<T>[] = [];
  for (const segment of segments) {
    let target: Block<T> | null = null;
    for (const block of blocks) {
      const gap = segment.rect.top - block.last.bottom;
      if (gap < -1) {
        continue;
      }
      const threshold =
        Math.max(block.last.height, segment.rect.height) * gapRatio;
      if (gap > threshold || !horizontallyAligned(block.last, segment.rect)) {
        continue;
      }
      const indentThreshold = Math.max(6, block.last.height * 0.5);
      if (segment.rect.left - block.minLeft > indentThreshold) {
        continue;
      }
      const heightDiff = Math.abs(segment.rect.height - block.last.height);
      if (heightDiff > Math.max(block.last.height, segment.rect.height) * 0.3) {
        continue;
      }
      if (!target || block.last.bottom > target.last.bottom) {
        target = block;
      }
    }
    if (target) {
      target.lines.push(segment.line);
      target.last = segment.rect;
      target.minLeft = Math.min(target.minLeft, segment.rect.left);
    } else {
      blocks.push({
        lines: [segment.line],
        last: segment.rect,
        minLeft: segment.rect.left,
      });
    }
  }
  return blocks.map((block) => block.lines);
}

/** Vertical distance from `y` to the rect (0 when inside). */
export function verticalDistance(rect: TextRect, y: number): number {
  if (y < rect.top) {
    return rect.top - y;
  }
  if (y > rect.bottom) {
    return y - rect.bottom;
  }
  return 0;
}
