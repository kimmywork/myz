import { wrapRangeAcrossNodes } from "@myz/shared/highlightRange";
import {
  deserializeRange,
  findRangeByNormalizedText,
  type SerializedRange,
} from "@myz/shared/serializer";
import {
  DEFAULT_COLOR,
  HIGHLIGHT_STYLES,
  RECORD_KINDS,
  type MyZRecord,
} from "@myz/shared/types";

type EpubLocator = NonNullable<MyZRecord["epubLocator"]>;

export interface EpubHighlightRecord {
  id: string;
  kind: RECORD_KINDS;
  text: string;
  color?: string;
  style?: HIGHLIGHT_STYLES;
  range?: SerializedRange;
  epubLocator?: EpubLocator;
  note?: string;
  tags?: string[];
}

const STYLE_CLASS: Record<string, string> = {
  [HIGHLIGHT_STYLES.PAINT]: "myz-highlight--paint",
  [HIGHLIGHT_STYLES.UNDERLINE]: "myz-highlight--underline",
  [HIGHLIGHT_STYLES.WAVY]: "myz-highlight--wavy",
};

function unwrapMark(node: Element): void {
  const parent = node.parentNode;
  if (!parent) {
    return;
  }
  while (node.firstChild) {
    parent.insertBefore(node.firstChild, node);
  }
  parent.removeChild(node);
  parent.normalize();
}

/** Removes every highlight wrapper from a rendered chapter document. */
export function clearHighlights(doc: Document): void {
  Array.from(doc.querySelectorAll(".myz-highlight")).forEach(unwrapMark);
}

function createMark(doc: Document, record: EpubHighlightRecord): HTMLElement {
  const mark = doc.createElement("mark");
  const style = record.style ?? HIGHLIGHT_STYLES.PAINT;
  mark.className = `myz-highlight ${STYLE_CLASS[style] ?? "myz-highlight--paint"}`;
  mark.dataset.highlightId = record.id;
  mark.style.setProperty(
    "--myz-highlight-color",
    record.color || DEFAULT_COLOR,
  );
  return mark;
}

/**
 * Wraps a range one text segment at a time instead of wrapping the whole range
 * in a single element. A `<mark>` cannot legally contain block elements, so a
 * chapter-sized paint selection wrapped as one element produced invalid markup
 * and broke the layout.
 */
function wrapRange(
  range: Range,
  doc: Document,
  record: EpubHighlightRecord,
): boolean {
  return wrapRangeAcrossNodes(range, () => createMark(doc, record));
}

/**
 * Paints the highlights that belong to one spine document. The stored element
 * path is the fast route; when reflow or a different render invalidated it, the
 * record's text quote is used to find the range again.
 */
export function applyHighlights(
  doc: Document,
  records: EpubHighlightRecord[],
  spineIndex: number,
): number {
  clearHighlights(doc);
  let applied = 0;
  for (const record of records) {
    if (record.kind !== RECORD_KINDS.HIGHLIGHT) {
      continue;
    }
    if (
      record.epubLocator &&
      Number.isFinite(record.epubLocator.spineIndex) &&
      record.epubLocator.spineIndex !== spineIndex
    ) {
      continue;
    }
    let range = record.range ? deserializeRange(record.range, doc) : null;
    if (!range && record.text) {
      range = findRangeByNormalizedText(doc.body, record.text);
    }
    if (!range) {
      continue;
    }
    if (wrapRange(range, doc, record)) {
      applied += 1;
    }
  }
  return applied;
}

/** Returns the non-collapsed selection range inside a rendered chapter. */
export function currentSelection(doc: Document): Range | null {
  const selection = doc.getSelection();
  if (!selection || selection.rangeCount === 0) {
    return null;
  }
  const range = selection.getRangeAt(0);
  if (range.collapsed || !range.toString().trim()) {
    return null;
  }
  return range;
}
