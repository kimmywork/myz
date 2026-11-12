/**
 * Capture-time text context (§I7).
 *
 * A record made from a screenshot should say *what text it came from*, and
 * that can only be read while the selection still exists — once the capture
 * clears the ranges it is gone. The logic is deliberately small: the selection
 * if there is one, otherwise the surrounding sentence-sized slice of its block.
 * Paragraph inference belongs to the record side, not here.
 */

/** Longest context kept, so a huge selection cannot bloat the record. */
export const CONTEXT_MAX_CHARS = 800;

/** How much text to take on each side when falling back to the block. */
export const CONTEXT_NEARBY_CHARS = 200;

/** Collapses layout whitespace so the stored context reads as one passage. */
export function normalizeContextText(value: string | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

/** Clips to `max` characters, adding an ellipsis when it cut something. */
export function clipContextText(
  value: string,
  max = CONTEXT_MAX_CHARS,
): string {
  const text = normalizeContextText(value);
  if (text.length <= max) return text;
  return `${text.slice(0, max)}…`;
}

/**
 * `radius` characters on each side of `offset`, clipped at the block's edges.
 *
 * @param text Whole block text.
 * @param offset Character offset of the selection start inside `text`.
 * @param radius Characters to take on each side.
 */
export function sliceAround(
  text: string,
  offset: number,
  radius = CONTEXT_NEARBY_CHARS,
): string {
  const normalized = normalizeContextText(text);
  if (!normalized) return "";
  const safeOffset = Math.min(Math.max(offset, 0), normalized.length);
  const start = Math.max(0, safeOffset - radius);
  const end = Math.min(normalized.length, safeOffset + radius);
  const prefix = start > 0 ? "…" : "";
  const suffix = end < normalized.length ? "…" : "";
  return `${prefix}${normalized.slice(start, end)}${suffix}`;
}

/** The nearest element whose text reads as one block (paragraph-ish). */
function blockOf(node: Node | null): HTMLElement | null {
  const start: Element | null =
    node instanceof Element ? node : (node?.parentElement ?? null);
  let element: Element | null = start;
  while (element && !element.textContent?.trim()) {
    element = element.parentElement;
  }
  return element instanceof HTMLElement ? element : null;
}

/**
 * Context text for a capture taken over `range`.
 *
 * @returns The selection, or the text around it, or `undefined` when the
 *   capture has nothing to say about text.
 */
export function selectionContextText(
  selection: Selection | null,
  range: Range | null,
): string | undefined {
  const selected = normalizeContextText(selection?.toString());
  if (selected) return clipContextText(selected);
  if (!range) return undefined;

  const block = blockOf(range.startContainer);
  const blockText = normalizeContextText(block?.textContent);
  if (!blockText) return undefined;

  // Offset of the selection start within the block, so the slice is centred on
  // where the user actually was rather than on the block's beginning.
  let offset = 0;
  if (block) {
    try {
      const before = range.cloneRange();
      before.selectNodeContents(block);
      before.setEnd(range.startContainer, range.startOffset);
      offset = normalizeContextText(before.toString()).length;
    } catch {
      offset = 0;
    }
  }
  const nearby = sliceAround(blockText, offset);
  return nearby ? clipContextText(nearby) : undefined;
}
