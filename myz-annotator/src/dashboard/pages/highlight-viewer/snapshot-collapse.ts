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

/** One hidden run's progressive-reveal state (2026-11-23 撕裂式渐进展开). */
export interface SnapshotGapState {
  /**
   * Blocks per chunk. Below the block count the run is split at ~半屏 a
   * chunk with 「…」 seams between (2026-11-23 revision: seams close
   * together, not one seam in the middle of a huge gap).
   */
  chunkSize: number;
  /** Chunk indexes revealed so far (each click opens one). */
  revealed: readonly number[];
  /** Everything revealed (clicking a seam). */
  expanded: boolean;
  /** Measurement done; guards the measure → re-render loop. */
  measured?: boolean;
}

/**
 * Rewrites marked-up snapshot html into the blur-fade display.
 *
 * Consecutive unmarked units collapse into one `.myz-snapshot-dim` wrapper
 * (one continuous faded blur region per run); annotated units stay sharp in
 * `.myz-snapshot-region`, and a record's note renders in the document's side
 * gutter as a Word-review-style comment. With no marks at all there is
 * nothing to pin: the body comes back unchanged and renders sharp.
 *
 * A long hidden run (over half a screen, decided by the caller's measurement)
 * splits at its middle into a tear seam (「…」): clicking one side reveals one
 * block on that side, step by step, the rest staying blurred; clicking the
 * seam reveals the whole run.
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

  /** Word-review-style comment cards for the marks inside one region. */
  const noteCards = (node: Node): string => {
    if (node.nodeType !== Node.ELEMENT_NODE) return "";
    const cards: string[] = [];
    const seen = new Set<string>();
    (node as Element).querySelectorAll("mark[data-myz-anchor]").forEach((m) => {
      const id = m.getAttribute("data-myz-anchor") || "";
      const note = notes[id];
      if (!note || seen.has(id)) return;
      seen.add(id);
      cards.push(
        `<aside class="myz-snapshot-note" data-myz-anchor="${escapeHtml(id)}">` +
          `${escapeHtml(note)}</aside>`,
      );
    });
    return cards.length
      ? `<div class="myz-snapshot-notes">${cards.join("")}</div>`
      : "";
  };

  const dimAttrs = (gap: number, chunk?: number) =>
    `class="myz-snapshot-dim" data-gap="${gap}"` +
    (chunk !== undefined ? ` data-chunk="${chunk}"` : "") +
    ` tabindex="0" role="button" aria-expanded="false" ` +
    `title="${chunk !== undefined ? "点击展开这一段" : "点击展开这段上下文"}"`;

  /** One revealed stretch, fading in (渐入); tagged for the scroll follow. */
  const revealed = (html: string, gap: number, chunk?: number) =>
    html
      ? `<div class="myz-snapshot-revealed" data-revealed="gap-${gap}${
          chunk !== undefined ? `-${chunk}` : ""
        }">${html}</div>`
      : "";

  /** The tear seam of a split run. */
  const tear = (gap: number, seam: number) =>
    `<div class="myz-snapshot-tear" data-gap="${gap}" data-seam="${seam}" tabindex="0" role="button" ` +
    `aria-expanded="false" title="展开这段中间内容"><span aria-hidden="true">…</span>` +
    `<span class="sr-only">展开这段中间内容</span></div>`;

  /** Renders one hidden run with its progressive-reveal state. */
  const renderGap = (blocks: Node[], gap: number): string => {
    const state = gaps[gap];
    const serialized = blocks.map(serialize);
    const chunk = state?.chunkSize ?? 0;
    if (state?.expanded) return revealed(serialized.join(""), gap);
    if (!chunk || chunk >= blocks.length) {
      return `<div ${dimAttrs(gap)}>${serialized.join("")}</div>`;
    }
    // Chunked at ~半屏: seams close together, each chunk opens on its own.
    const out: string[] = [];
    const count = Math.ceil(blocks.length / chunk);
    for (let i = 0; i < count; i += 1) {
      if (i > 0) out.push(tear(gap, i));
      const slice = serialized.slice(i * chunk, (i + 1) * chunk).join("");
      out.push(
        state?.revealed.includes(i)
          ? revealed(slice, gap, i)
          : `<div ${dimAttrs(gap, i)}>${slice}</div>`,
      );
    }
    return out.join("");
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
