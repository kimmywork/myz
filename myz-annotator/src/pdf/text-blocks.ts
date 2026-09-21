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
 * by a sub-pixel of baseline).
 */
export function groupIntoLines<T extends Positioned>(
  items: T[],
  topToleranceRatio = 0.6,
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
      if (Math.abs(item.rect.top - lineRect.top) <= tolerance) {
        line.push(item);
        continue;
      }
    }
    lines.push([item]);
  }
  return lines;
}

/**
 * Groups consecutive lines into blocks (paragraphs). A gap larger than
 * `gapRatio` times the line height starts a new block; tighter leading stays
 * in the same paragraph.
 */
export function groupIntoBlocks<T extends Positioned>(
  lines: T[][],
  gapRatio = 1.25,
): T[][][] {
  const blocks: T[][][] = [];
  let current: T[][] = [];
  let previous: MeasuredRect | null = null;
  for (const line of lines) {
    const rect = unionRect(line.map((entry) => entry.rect));
    if (!previous) {
      current = [line];
    } else {
      const gap = rect.top - previous.bottom;
      const threshold = Math.max(previous.height, rect.height) * gapRatio;
      if (gap > threshold) {
        blocks.push(current);
        current = [line];
      } else {
        current.push(line);
      }
    }
    previous = rect;
  }
  if (current.length) {
    blocks.push(current);
  }
  return blocks;
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
