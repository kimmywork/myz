/**
 * The fold display (2026-11-24 定稿，用户示例：A…G 划了 A/G):
 *
 * ```
 * A                     ← 划线（清晰）
 * blurred B             ← 上侧提示：这一侧下一个要揭开的块
 * …… fold               ← 唯一的分割线（中间没有剩余内容时消失）
 * blurred F             ← 下侧提示
 * G                     ← 划线（清晰）
 * ```
 *
 * 点击提示或缝的对应半区 → 揭开**该侧紧邻划线处的下一个块**（上侧 B→C→…
 * 向中间推进，下侧 F→E→… 反向推进），提示随之前进；点「…」本体全部揭开。
 * 提示块本身模糊（遮起来并且模糊），揭开的内容渐入显示。
 *
 * Annotated units stay sharp in `.myz-snapshot-region` (tagged with a stable
 * `data-region` index for the scroll anchoring); a record's note lives on a
 * page-margin comment icon (popover on click).
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

/** One hidden run's unfold state (2026-11-24 边到中推进). */
export interface SnapshotGapState {
  /** Blocks revealed from the highlight above, in reading order. */
  upRev: number;
  /** Blocks revealed from the highlight below, in reverse reading order. */
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

  /** One unfolded stretch, fading in (渐入); tagged for the scroll anchor. */
  const revealed = (html: string, gap: number, side?: "up" | "down") =>
    html
      ? `<div class="myz-snapshot-revealed" data-revealed="gap-${gap}${
          side ? `-${side}` : ""
        }">${html}</div>`
      : "";

  /**
   * A short blurred preview of the block this side will reveal next — so the
   * reader can see content is still hidden there. Clicking it reveals exactly
   * that block (same action as the seam half).
   */
  const foldHint = (blockHtml: string, gap: number, side: "up" | "down") =>
    `<div class="myz-snapshot-fold-hint" data-gap="${gap}" data-side="${side}" ` +
    `tabindex="0" role="button" aria-label="${
      side === "up" ? "向上展开一段" : "向下展开一段"
    }" title="${side === "up" ? "向上展开一段" : "向下展开一段"}">` +
    `${blockHtml}</div>`;

  /**
   * The single 「…」 seam of a hidden run: upper half unfolds upward, lower
   * half downward, the glyph unfolds everything. Hidden once nothing remains
   * in the middle (2026-11-24).
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

  /**
   * Renders one hidden run. Unfold grows from the two highlight edges inward:
   * the up side reveals the pool's top block first (B, then C…), the down
   * side its bottom block first (F, then E…); each side's hint is exactly the
   * block it will reveal next.
   */
  const renderGap = (blocks: Node[], gap: number): string => {
    const state = gaps[gap];
    const serialized = blocks.map(serialize);
    const total = serialized.length;
    if (state?.expanded) return revealed(serialized.join(""), gap);
    const upRev = Math.min(state?.upRev ?? 0, total);
    const downRev = Math.min(state?.downRev ?? 0, total - upRev);
    const pool = serialized.slice(upRev, total - downRev);
    return [
      revealed(serialized.slice(0, upRev).join(""), gap, "up"),
      pool.length ? foldHint(pool[0], gap, "up") : "",
      pool.length > 1 ? tear(gap) : "",
      pool.length > 1 ? foldHint(pool[pool.length - 1], gap, "down") : "",
      revealed(serialized.slice(total - downRev).join(""), gap, "down"),
    ]
      .filter(Boolean)
      .join("");
  };

  const out: string[] = [];
  let pending: Node[] = [];
  let gapIndex = 0;
  let regionIndex = 0;
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
      `<div class="myz-snapshot-region" data-region="${regionIndex}">` +
        `${serialize(unit.node)}${noteCards(unit.node)}</div>`,
    );
    regionIndex += 1;
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
