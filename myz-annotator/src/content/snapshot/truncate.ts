/**
 * Snapshot span (§3.4, 2026-11-24 定稿：包含这页所有划线的最小连续区域).
 *
 * 划线区块之间的一切都进快照（显示端把非划线部分折叠掉），两侧各留几个
 * 上下文块，其余一概不收。范围由划线直接定义，所以：
 *
 * - 「高亮一定在快照里」是结构性的——不需要任何容器保真补丁；
 * - 无限滚动页自动被 span 约束：首末划线之外的尾部/头部噪音进不来；
 * - 没有 run 计数、没有 site 表、没有整页 vs 窗口两种模式。
 *
 * 找不到任何划线落点时退回整个可读根：那时「足够完整」优先，10 MB 的
 * 单快照上限是极端情况的兜底。
 */

/** Context blocks captured beyond the outermost record on each side. */
export const SNAPSHOT_CONTEXT_BLOCKS = 2;

/** Collapses whitespace so needles compare like the page text does. */
export function normalizeWindowText(value: string | null | undefined): string {
  return (value || "").replace(/\s+/g, " ").trim();
}

/**
 * Whether one sibling hits any of the page's record texts.
 *
 * The needle is compared collapsed and truncated to 120 chars — the same
 * comparison `containerAround` resolves records with — so inline markup or
 * line breaks inside the quote do not hide the hit.
 */
export function hitsRecord(node: Node, needles: readonly string[]): boolean {
  const text = normalizeWindowText(node.textContent);
  if (!text) return false;
  return needles.some((needle) => needle && text.includes(needle));
}

/** Whitespace between blocks is layout, not content. */
function isBlankLayout(node: Node): boolean {
  return node.nodeType === Node.TEXT_NODE && !(node.textContent || "").trim();
}

/**
 * The children's normalized text, concatenated with single spaces, plus each
 * child's `[start, end)` range in it. Lets a quote be located even when its
 * endpoints live in different children.
 */
function rootTextIndex(children: readonly Node[]): {
  value: string;
  starts: number[];
  ends: number[];
} {
  const starts: number[] = [];
  const ends: number[] = [];
  let value = "";
  children.forEach((child, index) => {
    if (value) value += " ";
    starts[index] = value.length;
    value += normalizeWindowText(child.textContent);
    ends[index] = value.length;
  });
  return { value, starts, ends };
}

/**
 * The root-level child span holding every record hit, extended by the
 * context blocks on each side.
 *
 * Hits are resolved against the **normalized root text**, then mapped back to
 * the children they cover. Comparing one child at a time loses a quote that
 * crosses a block boundary (`alpha ` in one paragraph, `beta` in the next):
 * neither child contains the whole needle, so that record dropped out of the
 * span while the other record's span won — the snapshot then missed a
 * highlight it is supposed to structurally contain (CodeRabbit #136).
 *
 * Hits may sit deeper than the root child (a record's block inside a section):
 * the section carries it, and the fold display splits containers back into
 * blocks, so capture granularity here is not a loss.
 *
 * @returns `null` when no record text lands in the root.
 */
export function recordSpan(
  root: Element,
  needles: readonly string[],
): { first: number; last: number } | null {
  const children = Array.from(root.childNodes);
  const text = rootTextIndex(children);
  let first = -1;
  let last = -1;

  const cover = (from: number, to: number) => {
    children.forEach((node, index) => {
      if (isBlankLayout(node)) return;
      // Child ranges are [start, end); touching an endpoint is not overlap.
      if (text.ends[index] <= from || text.starts[index] >= to) return;
      if (first < 0 || index < first) first = index;
      if (index > last) last = index;
    });
  };

  for (const needle of needles) {
    if (!needle) continue;
    // Every occurrence counts: the same sentence twice on a page must not
    // shrink the span below a highlighted copy.
    let from = text.value.indexOf(needle);
    while (from >= 0) {
      cover(from, from + needle.length);
      from = text.value.indexOf(needle, from + 1);
    }
  }
  if (first < 0) return null;
  // Extend by context blocks; whitespace rides free — it is layout between
  // blocks, not a block, and must not eat the context budget.
  let added = 0;
  for (
    let index = first - 1;
    index >= 0 && added < SNAPSHOT_CONTEXT_BLOCKS;
    index -= 1
  ) {
    first = index;
    if (!isBlankLayout(children[index])) added += 1;
  }
  added = 0;
  for (
    let index = last + 1;
    index < children.length && added < SNAPSHOT_CONTEXT_BLOCKS;
    index += 1
  ) {
    last = index;
    if (!isBlankLayout(children[index])) added += 1;
  }
  return { first, last };
}

/**
 * A clone of `root` containing the record span.
 *
 * Falls back to the whole root when no record text lands in it: with nothing
 * to anchor, 「足够完整」 beats an empty capture — the per-snapshot size cap
 * is the backstop for a feed stored behind a failed match.
 */
export function spanAround(root: Element, needles: readonly string[]): Element {
  const span = recordSpan(root, needles);
  if (!span) return root.cloneNode(true) as Element;
  const clone = root.cloneNode(false) as Element;
  // Node slice, so direct text nodes ride along with their siblings.
  Array.from(root.childNodes)
    .slice(span.first, span.last + 1)
    .forEach((child) => clone.appendChild(child.cloneNode(true)));
  return clone;
}
