/**
 * Snapshot truncation (§I9).
 *
 * A snapshot extends from the record's anchor outwards through the content
 * container's children. It has to stop somewhere, or a feed page would keep
 * growing without an edge.
 *
 * The stop rule is a run of elements that carry no prose. In an article that is
 * the ad/promo/card block between two paragraphs; in a long comment thread it
 * is the chunk of buttons and metadata between two comments. Three in a row
 * means we have left the prose behind.
 *
 * **What N serves — and does not.** These numbers were measured on article
 * pages with promo blocks, on a real long comment thread, and on a synthetic
 * feed sample. X's home timeline is *not* the target: I8's site rules refuse to
 * snapshot endless feeds at all, so this threshold never runs there. Do not
 * read it as "a value tuned for X".
 *
 * Measurement: `scripts/measure/truncation-threshold.mjs`. The widest gap
 * between two adjacent prose blocks across the samples was 2 elements, so N is
 * 3 — the observed maximum plus one.
 */

/** Consecutive prose-less siblings that end the capture. */
export const SNAPSHOT_TRUNCATION_RUN = 3;

/**
 * Hard cap on how many siblings one side may add, whatever the runs look like.
 *
 * The run rule alone is not enough: a container whose children are all prose
 * (one long article body split into paragraphs) would never reach a run of
 * three, and the snapshot would be the whole page. This bounds the work.
 */
export const SNAPSHOT_MAX_SIBLINGS_PER_SIDE = 200;

/** Elements that count as "prose" for the stop rule. */
const PROSE_SELECTOR =
  "p, li, blockquote, pre, table, h1, h2, h3, h4, h5, h6, dd, dt, figure";

/** A node counts as prose when it is text, or an element holding text. */
function isProseNode(node: Node): boolean {
  if (node.nodeType === Node.TEXT_NODE) {
    return (node.textContent || "").trim().length > 0;
  }
  return node.nodeType === Node.ELEMENT_NODE && isProseElement(node as Element);
}

/** An element with a real amount of text reads as prose regardless of tag. */
const PROSE_MIN_TEXT = 40;

export interface TruncationOptions {
  /** Prose-less run that ends the capture. */
  run?: number;
  /** Per-side sibling cap. */
  maxPerSide?: number;
}

/** True when this element reads as article prose. */
export function isProseElement(element: Element): boolean {
  if (element.matches(PROSE_SELECTOR)) {
    return (element.textContent || "").trim().length > 0;
  }
  return (element.textContent || "").trim().length >= PROSE_MIN_TEXT;
}

/**
 * The direct child of `root` that contains `node`, or `null`.
 *
 * The anchor can sit anywhere inside a paragraph, so walk up until the parent
 * is the container itself.
 */
export function childContaining(root: Element, node: Node | null): Node | null {
  let current: Node | null = node;
  while (current && current.parentNode !== root) {
    current = current.parentNode;
  }
  return current;
}

/**
 * Indexes to keep when extending from `anchor` inside `root`.
 *
 * Walks outward one sibling at a time, keeping prose and short connective
 * elements, and stops after `run` consecutive prose-less siblings.
 */
export function siblingWindow(
  root: Element,
  anchor: Node,
  options: TruncationOptions = {},
): { first: number; last: number } {
  const run = options.run ?? SNAPSHOT_TRUNCATION_RUN;
  const maxPerSide = options.maxPerSide ?? SNAPSHOT_MAX_SIBLINGS_PER_SIDE;
  // `childNodes`, not `children`: an article's opening and closing sentences can
  // be direct text nodes of the container, and slicing elements only would
  // silently drop them.
  const children = Array.from(root.childNodes) as Node[];
  const start = children.indexOf(anchor);
  if (start < 0) return { first: 0, last: Math.max(0, children.length - 1) };

  let first = start;
  let misses = 0;
  let added = 0;
  for (let index = start - 1; index >= 0; index -= 1) {
    if (isProseNode(children[index])) misses = 0;
    else misses += 1;
    if (misses >= run || added >= maxPerSide) break;
    first = index;
    added += 1;
  }

  let last = start;
  misses = 0;
  added = 0;
  for (let index = start + 1; index < children.length; index += 1) {
    if (isProseNode(children[index])) misses = 0;
    else misses += 1;
    if (misses >= run || added >= maxPerSide) break;
    last = index;
    added += 1;
  }

  return { first, last };
}

/**
 * A clone of `root` containing only the window around `anchor`.
 *
 * When no anchor is given, the whole root is cloned: not every capture knows
 * where the record sat (a snapshot taken from the page without a record).
 */
export function truncateAround(
  root: Element,
  anchor: Node | null,
  options: TruncationOptions = {},
): Element {
  if (!anchor || !root.contains(anchor)) return root.cloneNode(true) as Element;

  const { first, last } = siblingWindow(root, anchor, options);
  const clone = root.cloneNode(false) as Element;
  // Node slice, so direct text nodes ride along with their siblings.
  Array.from(root.childNodes)
    .slice(first, last + 1)
    .forEach((child) => clone.appendChild(child.cloneNode(true)));
  return clone;
}
