import type { MyZRecord } from "@myz/shared/types";
import { locateTextRange } from "./text-range.js";

const DECORATION_CLASSES = "span.myz-deco-underline, span.myz-deco-wavy";

/**
 * Removes previously applied decoration wrappers, restoring the original text
 * nodes (pdf.js keeps one text node per span, so `normalize` re-merges them).
 */
function clearSpanDecorations(layer: HTMLElement): void {
  layer.querySelectorAll<HTMLElement>(DECORATION_CLASSES).forEach((wrapper) => {
    const parent = wrapper.parentNode;
    if (!parent) return;
    while (wrapper.firstChild) parent.insertBefore(wrapper.firstChild, wrapper);
    parent.removeChild(wrapper);
    parent.normalize();
  });
}

interface RangeTextNode {
  node: Text;
  start: number;
  end: number;
}

/** Text nodes intersecting `range`, with their in-range local offsets. */
function textNodesInRange(range: Range): RangeTextNode[] {
  const ancestor =
    range.commonAncestorContainer.nodeType === Node.TEXT_NODE
      ? range.commonAncestorContainer.parentNode
      : range.commonAncestorContainer;
  if (!ancestor) return [];
  const walker = document.createTreeWalker(ancestor, NodeFilter.SHOW_TEXT);
  const result: RangeTextNode[] = [];
  let node = walker.nextNode() as Text | null;
  while (node) {
    if (range.intersectsNode(node)) {
      const start = node === range.startContainer ? range.startOffset : 0;
      const end =
        node === range.endContainer ? range.endOffset : node.data.length;
      if (end > start) result.push({ node, start, end });
    }
    node = walker.nextNode() as Text | null;
  }
  return result;
}

/**
 * Wraps only the text inside `range` in a decoration span. A pdf.js text span
 * can hold a whole run (often a full line), so decorating the parent span would
 * underline text outside the selection; splitting at the range bounds keeps the
 * decoration glued to exactly the selected characters.
 */
function decorateRange(
  range: Range,
  className: string,
  record: MyZRecord,
  active: boolean,
): void {
  for (const { node, start, end } of textNodesInRange(range)) {
    let selected: Text = node;
    if (end < selected.data.length) selected.splitText(end);
    if (start > 0) selected = selected.splitText(start);
    const wrapper = document.createElement("span");
    wrapper.className = className;
    wrapper.dataset.myzId = record.id;
    if (record.color) wrapper.style.setProperty("--myz-color", record.color);
    if (active) wrapper.classList.add("is-active");
    selected.parentNode?.insertBefore(wrapper, selected);
    wrapper.append(selected);
  }
}

/**
 * Applies underline / wavy decorations directly to the text-layer spans so they
 * hug the glyphs (an overlay line at the line-box bottom sits visibly below).
 */
export function applySpanDecorations(
  pageEl: HTMLElement,
  records: MyZRecord[],
  activeId: string | null,
): void {
  const layer = pageEl.querySelector<HTMLElement>(".textLayer");
  if (!layer) return;
  clearSpanDecorations(layer);
  const pageNumber = Number(pageEl.dataset.page || 0);
  records.forEach((record) => {
    const locator = record.pdfLocator;
    if (!locator || locator.pageNumber !== pageNumber) return;
    const style = record.style;
    if (style !== "underline" && style !== "wavy") return;
    const range = locateTextRange(
      pageEl,
      locator.text,
      locator.occurrenceIndex || 0,
    );
    if (!range) return;
    decorateRange(
      range,
      style === "wavy" ? "myz-deco-wavy" : "myz-deco-underline",
      record,
      record.id === activeId,
    );
  });
}
