/**
 * Folding a page copy down to its annotated regions (§3.4 display, user
 * decision 2026-11-23: 「整篇正文，但是固定显示已经标注的区域，而不是完整的内容，
 * 除非用户展开前后的详情」).
 *
 * The stored snapshot is the whole content; this splits the marked-up body
 * into **annotated** units (always shown) and **gaps** (collapsed behind an
 * expand affordance until asked for). A unit is a leaf block containing a
 * `<mark>`; unmarked subtrees merge into one gap per run.
 */

export interface SnapshotSection {
  kind: "annotated" | "gap";
  /** Gap position relative to the annotated regions. */
  position: "before" | "between" | "after";
  html: string;
  /** Plain-text size, for the "展开 · N 字" affordance. */
  chars: number;
}

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

function charsOf(nodes: readonly Node[]): number {
  return nodes.reduce(
    (sum, node) => sum + (node.textContent || "").trim().length,
    0,
  );
}

/**
 * Flattens the body into units: leaf blocks that contain a mark are annotated
 * units, unmarked subtrees stay whole as gap units. A wrapper is split through
 * only when its children are blocks themselves — inline content (`<p><em>…`)
 * must never be taken apart.
 */
function unitsOf(node: Node): Unit[] {
  // Whitespace between blocks is layout, not content: it must not open a gap.
  if (node.nodeType === Node.TEXT_NODE) {
    return (node.textContent || "").trim() ? [{ node, marked: false }] : [];
  }
  if (node.nodeType !== Node.ELEMENT_NODE) {
    return [{ node, marked: false }];
  }
  const element = node as Element;
  const marked = hasMark(element);
  if (!marked) return [{ node, marked: false }];

  const children = Array.from(element.childNodes);
  const elementChildren = Array.from(element.children);
  const splittable =
    elementChildren.length > 0 &&
    element.matches(WRAPPER_SELECTOR) &&
    elementChildren.every((child) => child.matches(BLOCK_SELECTOR));
  if (!splittable) return [{ node, marked: true }];
  return children.flatMap(unitsOf);
}

/**
 * Splits marked-up snapshot html into annotated sections and gaps.
 *
 * With no marks at all there is nothing to pin: the body comes back as one
 * gap-less section list so the caller can render it whole.
 */
export function splitSnapshotSections(html: string): SnapshotSection[] {
  if (typeof document === "undefined") return [];
  const container = document.createElement("div");
  container.innerHTML = html;
  if (!container.querySelector("mark")) {
    return container.childNodes.length
      ? [
          {
            kind: "annotated",
            position: "between",
            html,
            chars: (container.textContent || "").trim().length,
          },
        ]
      : [];
  }

  // The stored body is one root element (the content container); its children
  // are the units. Wrapper chains around the body are split through as well.
  const units =
    container.children.length === 1
      ? unitsOf(container.firstElementChild as Element)
      : Array.from(container.childNodes).flatMap(unitsOf);

  const sections: SnapshotSection[] = [];
  let pendingGap: Node[] = [];
  const flushGap = () => {
    if (!pendingGap.length) return;
    sections.push({
      kind: "gap",
      position: "between",
      html: pendingGap.map(serialize).join(""),
      chars: charsOf(pendingGap),
    });
    pendingGap = [];
  };

  for (const unit of units) {
    if (!unit.marked) {
      pendingGap.push(unit.node);
      continue;
    }
    flushGap();
    sections.push({
      kind: "annotated",
      position: "between",
      html: serialize(unit.node),
      chars: charsOf([unit.node]),
    });
  }
  flushGap();

  // A gap sits before the annotations, between them, or after them.
  const firstAnnotation = sections.findIndex((s) => s.kind === "annotated");
  const lastAnnotation =
    sections.length -
    1 -
    [...sections].reverse().findIndex((s) => s.kind === "annotated");
  sections.forEach((section, index) => {
    if (section.kind !== "gap") return;
    section.position =
      index < firstAnnotation
        ? "before"
        : index > lastAnnotation
          ? "after"
          : "between";
  });

  return sections;
}

/**
 * Marks the active record's `<mark>` so the view can emphasise and scroll to
 * it: adds `is-active` to `mark[data-myz-anchor="<recordId>"]`.
 */
export function withActiveAnchor(html: string, recordId: string): string {
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
