/**
 * The fold display (2026-11-23 定稿，用户拍板):
 * 「两个划线之间的隐藏内容收起折叠，只留一条『…』分割线；所有隐藏段落都
 * 通过这一条展开」。
 *
 * Annotated units stay sharp in `.myz-snapshot-region`; a record's note lives
 * on a page-margin comment icon (popover on click). Every hidden run between
 * regions collapses to zero height behind ONE 「…」 seam:
 *
 * - click the seam's upper half → one more block unfolds upward from it;
 * - click its lower half → one block unfolds downward;
 * - click the 「…」 glyph → the whole run unfolds.
 *
 * Unfolded blocks fade in (渐入); the folded remainder is covered with a
 * blurred fade edge (遮起来并且模糊) toward the seam's side.
 */

/** Container tags that exist only to group blocks and may be split through. */
const WRAPPER_SELECTOR =
  "div, section, article, main, ul, ol, dl, table, tbody, thead, tfoot, figure";

/** Block tags that make up the body's units. */
const BLOCK_SELECTOR =
  "p, li, h1, h2, h3, h4, h5, h6, blockquote, pre, td, th, dd, dt, figure, hr, div, section, article, main, ul, ol, dl, table, tbody, thead, tfoot, tr, header, footer, nav, aside";

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

/** HTML-escapes text so re-serializing cannot turn entities into live tags. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function serialize(node: Node): string {
  return node.nodeType === Node.ELEMENT_NODE
    ? (node as Element).outerHTML
    : // A text node can legally hold `<` or `&` (the sanitizer keeps them as
      // entities). Emitting them raw would decode them into markup once the
      // joined string is re-parsed via `innerHTML` (CodeRabbit #135).
      escapeHtml(node.textContent || "");
}

/** Lucide-style message-square glyph for the 页边 comment icon. */
const COMMENT_SVG =
  '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" ' +
  'stroke="currentColor" stroke-width="2" stroke-linecap="round" ' +
  'stroke-linejoin="round" aria-hidden="true">' +
  '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>';

/**
 * Flattens the body into units: leaf blocks that contain a mark stay sharp,
 * unmarked subtrees stay whole as fold units. A wrapper is split through only
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

/** One hidden run's progressive-reveal state (2026-11-23 折叠模型定稿). */
export interface SnapshotGapState {
  /** Blocks revealed upward from the divider (its inner end grows up). */
  upRev: number;
  /** Blocks revealed downward from the divider. */
  downRev: number;
  /** Everything revealed (the 「…」 glyph click). */
  expanded: boolean;
}

/**
 * Rewrites marked-up snapshot html into the fold display.
 *
 * With no marks at all there is nothing to pin: the body comes back
 * unchanged and renders sharp.
 */
export function buildSnapshotDisplay(
  html: string,
  activeRecordId?: string,
  notes: Readonly<Record<string, string>> = {},
  gaps: readonly SnapshotGapState[] = [],
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

  /** Page-margin comment icons for the marks inside one region. */
  const noteCards = (node: Node): string => {
    if (node.nodeType !== Node.ELEMENT_NODE) return "";
    const icons: string[] = [];
    const seen = new Set<string>();
    (node as Element).querySelectorAll("mark[data-myz-anchor]").forEach((m) => {
      const id = m.getAttribute("data-myz-anchor") || "";
      const note = notes[id];
      if (!note || seen.has(id)) return;
      seen.add(id);
      icons.push(
        `<button type="button" class="myz-snapshot-note-icon" ` +
          `data-note-for="${escapeHtml(id)}" title="查看批注" ` +
          `aria-label="查看批注">${COMMENT_SVG}</button>`,
      );
    });
    return icons.length
      ? `<div class="myz-snapshot-note-icons">${icons.join("")}</div>`
      : "";
  };

  /** One unfolded stretch, fading in (渐入); tagged for the scroll follow. */
  const revealed = (
    html: string,
    gap: number,
    side?: "up" | "down",
    open?: boolean,
  ) =>
    html
      ? `<div class="myz-snapshot-revealed" data-revealed="gap-${gap}${
          side ? `-${side}` : ""
        }"${open ? ` data-open="${side}"` : ""}>${html}</div>`
      : "";

  /**
   * The single 「…」 seam of a hidden run: upper half unfolds upward, lower
   * half downward, the glyph unfolds everything.
   */
  const tear = (gap: number) =>
    `<div class="myz-snapshot-tear" data-gap="${gap}" data-tear="gap-${gap}">` +
    `<button type="button" class="myz-snapshot-tear-half" data-gap="${gap}" ` +
    `data-side="up" aria-label="向上展开一段" title="向上展开一段"></button>` +
    `<button type="button" class="myz-snapshot-tear-half" data-gap="${gap}" ` +
    `data-side="down" aria-label="向下展开一段" title="向下展开一段"></button>` +
    `<span class="myz-snapshot-tear-glyph" role="button" tabindex="0" ` +
    `data-gap="${gap}" aria-label="展开全部" title="展开全部">…</span>` +
    `</div>`;

  /** Renders one hidden run: collapsed behind its single seam. */
  const renderGap = (blocks: Node[], gap: number): string => {
    const state = gaps[gap];
    const serialized = blocks.map(serialize);
    if (state?.expanded) return revealed(serialized.join(""), gap);
    // The seam sits at the run's middle; unfold grows from it outward.
    const mid = Math.ceil(blocks.length / 2);
    const upRev = Math.min(state?.upRev ?? 0, mid);
    const downRev = Math.min(state?.downRev ?? 0, blocks.length - mid);
    const upShown = serialized.slice(mid - upRev, mid);
    const downShown = serialized.slice(mid, mid + downRev);
    return [
      revealed(upShown.join(""), gap, "up", upRev < mid),
      tear(gap),
      revealed(downShown.join(""), gap, "down", downRev < blocks.length - mid),
    ].join("");
  };

  const out: string[] = [];
  let pending: Node[] = [];
  let gapIndex = 0;
  const flush = () => {
    if (!pending.length) return;
    out.push(renderGap(pending, gapIndex));
    gapIndex += 1;
    pending = [];
  };
  for (const unit of units) {
    if (!unit.marked) {
      pending.push(unit.node);
      continue;
    }
    flush();
    out.push(
      `<div class="myz-snapshot-region">${serialize(unit.node)}${noteCards(
        unit.node,
      )}</div>`,
    );
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
