import type { MyZRecord } from "@myz/shared/types";

export interface PdfRect {
  x: number;
  y: number;
  width: number;
  height: number;
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
