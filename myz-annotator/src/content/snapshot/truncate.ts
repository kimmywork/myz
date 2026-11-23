/**
 * Snapshot truncation (§3.4, revised 2026-11-23).
 *
 * Only endless-scroll pages are truncated at all: article pages capture the
 * whole readable body. A feed has no "whole", so the capture extends from the
 * record's anchor to both sides and stops after `run` consecutive elements
 * that hit **no record of this page** (§3.4: 「以 record 为锚向两侧扩展，
 * 连续 N 个元素都没有命中相邻 record 时停止」). That keeps the cluster of the
 * user's highlights plus a little air, without dragging an endless tail in.
 *
 * N is `SNAPSHOT_TRUNCATION_RUN` (3). The value follows the prose-gap probe
 * (`scripts/measure/truncation-threshold.mjs`, widest observed gap + 1); the
 * record-hit variant still owes its own probe on a real feed (§6-2), so treat
 * 3 as the conservative starting point, not a tuned constant.
 */

/** Consecutive record-less siblings that end the capture. */
export const SNAPSHOT_TRUNCATION_RUN = 3;

/**
 * Hard cap on how many siblings one side may add, whatever the runs look like.
 *
 * A dense cluster of highlights would otherwise extend without a limit, so
 * this bounds the work regardless of the stop rule.
 */
export const SNAPSHOT_MAX_SIBLINGS_PER_SIDE = 200;

export interface TruncationOptions {
  /** Record-less run that ends the capture. */
  run?: number;
  /** Per-side sibling cap. */
  maxPerSide?: number;
}

/** Collapses whitespace so needles compare like the page text does. */
export function normalizeWindowText(value: string | null | undefined): string {
  return (value || "").replace(/\s+/g, " ").trim();
}

/**
 * Whitespace between blocks is layout, not content: it must neither hit a
 * record nor consume the record-less run budget.
 */
function isBlankLayout(node: Node): boolean {
  return node.nodeType === Node.TEXT_NODE && !(node.textContent || "").trim();
}

/**
 * Whether one sibling hits any of the page's record texts.
 *
 * The needle is compared collapsed and truncated to 120 chars — the same
 * comparison `containerAround` resolves the anchor with — so inline markup or
 * line breaks inside the quote do not hide the hit.
 */
export function hitsRecord(node: Node, needles: readonly string[]): boolean {
  const text = normalizeWindowText(node.textContent);
  if (!text) return false;
  return needles.some((needle) => needle && text.includes(needle));
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
 * Walks outward one sibling at a time and stops after `run` consecutive
 * siblings that hit no record of this page.
 */
export function siblingWindow(
  root: Element,
  anchor: Node,
  needles: readonly string[],
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
    const node = children[index];
    if (isBlankLayout(node)) {
      first = index;
      continue;
    }
    if (hitsRecord(node, needles)) misses = 0;
    else misses += 1;
    if (misses >= run || added >= maxPerSide) break;
    first = index;
    added += 1;
  }

  let last = start;
  misses = 0;
  added = 0;
  for (let index = start + 1; index < children.length; index += 1) {
    const node = children[index];
    if (isBlankLayout(node)) {
      last = index;
      continue;
    }
    if (hitsRecord(node, needles)) misses = 0;
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
  needles: readonly string[],
  options: TruncationOptions = {},
): Element {
  if (!anchor || !root.contains(anchor)) return root.cloneNode(true) as Element;

  const { first, last } = siblingWindow(root, anchor, needles, options);
  const clone = root.cloneNode(false) as Element;
  // Node slice, so direct text nodes ride along with their siblings.
  Array.from(root.childNodes)
    .slice(first, last + 1)
    .forEach((child) => clone.appendChild(child.cloneNode(true)));
  return clone;
}
