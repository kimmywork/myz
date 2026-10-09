import { isHighlightRecord } from "@myz/shared/highlightUtils";
import {
  deserializeRange,
  findRangeByNormalizedText,
  resolvePartialPath,
  serializeRangePaths,
  unwrapNode,
} from "@myz/shared/serializer";
import type { MyZRecord } from "@myz/shared/types";
import { wrapRangeAcrossNodes, wrapSimpleRange } from "../apply-highlight.ts";

export function removeHighlightFromDom(id: string) {
  const nodes = document.querySelectorAll(`[data-highlight-id="${id}"]`);
  nodes.forEach((node) => unwrapNode(node));
}

export function applyHighlight(record: MyZRecord) {
  if (!isHighlightRecord(record)) return false;
  if (!record?.range) return false;
  try {
    const range = deserializeRange(record.range);
    if (!range || range.collapsed) return false;
    removeHighlightFromDom(record.id);
    // Prefer wrapping by collecting and wrapping individual text-node
    // segments. This avoids cloning the whole fragment which can split inline
    // elements (links) and leave empty anchors when multiple highlights are
    // created in the same paragraph. Fall back to the simple fragment wrapper.
    let applied = false;
    try {
      applied = wrapRangeAcrossNodes(range, record);
    } catch (e) {
      applied = false;
    }
    if (!applied) applied = wrapSimpleRange(range, record);
    if (applied) return true;
  } catch (error) {
    console.warn("Unable to apply highlight", error, record);
  }
  return false;
}

/**
 * When a stored range no longer resolves, try to relocate the record by its
 * text and rewrite `record.range`. Returns true when it relocated and applied.
 */
export function rebuildHighlightRange(record: MyZRecord): boolean {
  if (!record?.text) return false;
  // Prefer the deepest still-valid ancestor of the stored path so the text
  // search stays close to where the highlight used to be.
  let range: Range | null = null;
  const startPath = record.range?.start?.path;
  if (startPath?.length) {
    const partial = resolvePartialPath(startPath);
    if (partial && partial !== document.body && partial.isConnected) {
      range = findRangeByNormalizedText(partial, record.text);
    }
  }
  if (!range) range = findRangeByNormalizedText(document.body, record.text);
  if (!range || range.collapsed) return false;
  const serialized = serializeRangePaths(range);
  if (!serialized) return false;
  record.range = serialized;
  return applyHighlight(record);
}
