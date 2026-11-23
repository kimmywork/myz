/**
 * The blur-fade display (user decision 2026-11-23, refined same day):
 * 「只显示高亮的部分，其他渐入渐出式模糊掉」.
 *
 * The whole copy stays in its place — nothing is dropped and nothing hides
 * behind expanders — but only the annotated regions render sharp. Everything
 * else is blurred out in place with a fade at the edges (渐出) and reveals on
 * click (渐入), so the layout keeps the surrounding context while reading
 * stays pinned to the highlights.
 */

/** Container tags that exist only to group blocks and may be split through. */
const WRAPPER_SELECTOR =
  "div, section, article, main, ul, ol, dl, table, tbody, thead, tfoot, figure";

/** Block tags that make up the body's units. */
const BLOCK_SELECTOR =
  "p, li, h1, h2, h3, h4, h5, h6, blockquote, pre, td, th, dd, dt, figure, hr, div, section";

interface Unit {
  node: Node;
  marked: boolean;
}

function hasMark(node: Node): boolean {
  return (
    node.nodeType === Node.ELEMENT_NODE &&
    (node as Element).querySelector("mark") !== null
  );
}

function serialize(node: Node): string {
  return node.nodeType === Node.ELEMENT_NODE
    ? (node as Element).outerHTML
    : node.textContent || "";
}

/**
 * Flattens the body into units: leaf blocks that contain a mark stay sharp,
 * unmarked subtrees stay whole as blur units. A wrapper is split through only
 * when its children are blocks themselves — inline content (`<p><em>…`) must
 * never be taken apart.
 */
function unitsOf(node: Node): Unit[] {
  // Whitespace between blocks is layout, not content.
  if (node.nodeType === Node.TEXT_NODE) {
    return (node.textContent || "").trim() ? [{ node, marked: false }] : [];
  }
  if (node.nodeType !== Node.ELEMENT_NODE) {
    return [{ node, marked: false }];
  }
  const element = node as Element;
  const marked = hasMark(element);
  if (!marked) return [{ node, marked: false }];

  const elementChildren = Array.from(element.children);
  const splittable =
    elementChildren.length > 0 &&
    element.matches(WRAPPER_SELECTOR) &&
    elementChildren.every((child) => child.matches(BLOCK_SELECTOR));
  if (!splittable) return [{ node, marked: true }];
  return Array.from(element.childNodes).flatMap(unitsOf);
}

/**
 * Rewrites marked-up snapshot html into the blur-fade display.
 *
 * Consecutive unmarked units collapse into one `.myz-snapshot-dim` wrapper
 * (one continuous faded blur region per run); annotated units stay sharp in
 * `.myz-snapshot-region`. With no marks at all there is nothing to pin: the
 * body comes back unchanged and renders sharp.
 */
export function buildSnapshotDisplay(
  html: string,
  activeRecordId?: string,
): string {
  if (typeof document === "undefined") return html;
  const container = document.createElement("div");
  container.innerHTML = html;
  const withActive = withActiveAnchor(container.innerHTML, activeRecordId);
  if (!container.querySelector("mark")) return withActive;

  container.innerHTML = withActive;
  // The stored body is one root element (the content container); its children
  // are the units. Wrapper chains around the body are split through as well.
  const units =
    container.children.length === 1
      ? unitsOf(container.firstElementChild as Element)
      : Array.from(container.childNodes).flatMap(unitsOf);

  const out: string[] = [];
  let pending: Node[] = [];
  const flush = () => {
    if (!pending.length) return;
    out.push(
      `<div class="myz-snapshot-dim" title="点击展开这段上下文">${pending
        .map(serialize)
        .join("")}</div>`,
    );
    pending = [];
  };
  for (const unit of units) {
    if (!unit.marked) {
      pending.push(unit.node);
      continue;
    }
    flush();
    out.push(`<div class="myz-snapshot-region">${serialize(unit.node)}</div>`);
  }
  flush();
  return out.join("");
}

/**
 * Marks the active record's `<mark>` so the view can emphasise and scroll to
 * it: adds `is-active` to `mark[data-myz-anchor="<recordId>"]`.
 */
export function withActiveAnchor(html: string, recordId?: string): string {
  if (!recordId || typeof document === "undefined") return html;
  const container = document.createElement("div");
  container.innerHTML = html;
  container.querySelectorAll("mark[data-myz-anchor]").forEach((mark) => {
    if (mark.getAttribute("data-myz-anchor") === recordId) {
      mark.classList.add("is-active");
    }
  });
  return container.innerHTML;
}
