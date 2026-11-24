/**
 * The fold display (2026-11-24 定稿):
 *
 * 「高亮的段落、普通的段落、blurred 部分都不做特殊处理，按排版高度展示」.
 *
 * Units are **real block elements only** — inline runs (`it <i>is</i>
 * deterministic…` in a `<figcaption>`, `<b>Data Parallel RMSNorm</b> Ideally…`)
 * stay one unit and are never split into pieces. Nothing is wrapped: the
 * display classes land directly on the blocks themselves, so a hint and its
 * revealed form are the same element at the same height — revealing is a
 * pure unblur with zero displacement (probe 2026-11-24: `filter` alone does
 * not change the box, so blurred and sharp blocks are geometrically equal).
 *
 * Hidden runs (blocks between two annotated regions) fold as:
 *
 * ```
 * A                       ← 划线（清晰）
 * blurred B               ← 上侧提示：该侧下一个揭开的块（整块、按原高度）
 * …… fold                 ← 唯一的分割线（池 ≥2 才有）
 * blurred F               ← 下侧提示
 * G                       ← 划线（清晰）
 * ```
 *
 * 揭示从两侧划线向中间推进（B→C→…、F→E→…）；池空则缝消失；点「…」全展开。
 * Hidden middle blocks stay in the DOM (`display: none`), so a reveal is an
 * in-place repaint (`repaintGap`) — same nodes, no innerHTML rebuild, no
 * animation replay on untouched blocks (2026-11-24 抖动修复). Every unit
 * carries stable ids (`data-myz-unit`, runs `data-myz-run`, regions
 * `data-region`, gaps `data-up-region`/`data-down-region`) so the view keeps
 * its visual anchor screen-fixed across repaints.
 */

/** Block tags that form the body's units. */
const BLOCK_SELECTOR =
  "p, li, h1, h2, h3, h4, h5, h6, blockquote, pre, td, th, dd, dt, figure, figcaption, caption, hr, div, section, article, main, ul, ol, dl, table, tbody, thead, tfoot, tr, header, footer, nav, aside";

/** Containers that only group blocks and may be split through. */
const SPLITTABLE_SELECTOR = "div, section, article, main";

function isBlockNode(node: Node): node is HTMLElement {
  return (
    node.nodeType === Node.ELEMENT_NODE &&
    node instanceof HTMLElement &&
    node.matches(BLOCK_SELECTOR)
  );
}

function isBlankText(node: Node): boolean {
  return node.nodeType === Node.TEXT_NODE && !(node.textContent || "").trim();
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
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Lucide-style message-square glyph for the 页边 comment icon. */
const COMMENT_SVG =
  '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" ' +
  'stroke="currentColor" stroke-width="2" stroke-linecap="round" ' +
  'stroke-linejoin="round" aria-hidden="true">' +
  '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>';

/**
 * Collects display units: real blocks one by one, and each maximal run of
 * loose inline/text siblings as one span unit. Inline elements are never
 * units of their own (2026-11-24: `<i>is</i>` must stay inside its
 * `<figcaption>`, not become a "block").
 */
function collectUnits(root: HTMLElement): HTMLElement[] {
  const doc = root.ownerDocument ?? document;
  const units: HTMLElement[] = [];
  const walk = (container: Node) => {
    let loose: Node[] = [];
    /** Wraps the pending loose run into one unit at its own DOM position. */
    const flushLoose = (before: Node | null) => {
      // Edge whitespace separates blocks; only inner whitespace separates
      // words — trim the edges, keep the middle.
      while (loose.length && isBlankText(loose[0])) loose.shift();
      while (loose.length && isBlankText(loose[loose.length - 1])) loose.pop();
      if (!loose.length) return;
      const span = doc.createElement("span");
      const host = loose[0].parentNode ?? container;
      host.insertBefore(span, before);
      loose.forEach((node) => span.appendChild(node));
      units.push(span);
      loose = [];
    };
    for (const child of Array.from(container.childNodes)) {
      if (isBlockNode(child)) {
        flushLoose(child);
        const splittable =
          child.matches(SPLITTABLE_SELECTOR) &&
          Array.from(child.children).some((c) => c.matches(BLOCK_SELECTOR));
        if (splittable) walk(child);
        else units.push(child);
      } else {
        loose.push(child);
      }
    }
    flushLoose(null);
  };
  walk(root);
  return units;
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

/** A run block's display role — exactly one per block per state. */
type RunRole =
  | "revealed-up"
  | "revealed-down"
  | "revealed-all"
  | "hint-up"
  | "hint-down"
  | "hidden";

function runRoles(
  state: SnapshotGapState | undefined,
  total: number,
): RunRole[] {
  const roles: RunRole[] = new Array<RunRole>(total).fill("hidden");
  if (state?.expanded) {
    for (let i = 0; i < total; i += 1) roles[i] = "revealed-all";
    return roles;
  }
  const upRev = Math.min(Math.max(state?.upRev ?? 0, 0), total);
  const downRev = Math.min(Math.max(state?.downRev ?? 0, 0), total - upRev);
  for (let i = 0; i < upRev; i += 1) roles[i] = "revealed-up";
  for (let i = total - downRev; i < total; i += 1) roles[i] = "revealed-down";
  const start = upRev;
  const end = total - downRev;
  const pool = end - start;
  if (pool === 1) {
    roles[start] = "hint-up";
  } else if (pool >= 2) {
    roles[start] = "hint-up";
    roles[end - 1] = "hint-down";
  }
  return roles;
}

/** The 「…」 seam: halves unfold one block each, the glyph unfolds all. */
function tearElement(
  doc: Document,
  gap: number,
  upRegion: number,
  downRegion: number,
): HTMLElement {
  const el = doc.createElement("div");
  el.className = "myz-snapshot-tear";
  el.setAttribute("data-gap", String(gap));
  el.setAttribute("data-tear", `gap-${gap}`);
  el.setAttribute("data-up-region", String(upRegion));
  el.setAttribute("data-down-region", String(downRegion));
  el.innerHTML =
    `<button type="button" class="myz-snapshot-tear-half" data-gap="${gap}" ` +
    `data-side="up" aria-label="向上展开一段" title="向上展开一段"></button>` +
    `<button type="button" class="myz-snapshot-tear-half" data-gap="${gap}" ` +
    `data-side="down" aria-label="向下展开一段" title="向下展开一段"></button>` +
    `<span class="myz-snapshot-tear-glyph" role="button" tabindex="0" ` +
    `data-gap="${gap}" aria-label="展开全部" title="展开全部">…</span>`;
  return el;
}

/**
 * Attributes the hint role borrows from the block. A hint is a normal block
 * wearing button semantics; the block may already carry its own `title` (an
 * image credit), `role` or ARIA labels, so what was there has to come back
 * when the block stops being a hint (CodeRabbit #136).
 */
const HINT_OWNED_ATTRIBUTES = [
  "title",
  "role",
  "tabindex",
  "aria-expanded",
  "aria-label",
] as const;

/** Source values are stashed on the element itself, prefixed. */
const HINT_STASH_PREFIX = "data-myz-hint-";

/**
 * A hint is a normal block wearing button semantics; the block may already
 * carry its own `title` (an image credit), `role` or ARIA labels. Those are
 * stashed on the element — not in a Map keyed by node — because the view
 * serialises the body back to HTML between builds, so a node-keyed stash dies
 * with the old nodes (CodeRabbit #136).
 */
function borrowAttributes(unit: Element): void {
  for (const name of HINT_OWNED_ATTRIBUTES) {
    const original = unit.getAttribute(name);
    if (original === null) continue;
    unit.setAttribute(`${HINT_STASH_PREFIX}${name}`, original);
  }
}

function restoreAttributes(unit: Element): void {
  for (const name of HINT_OWNED_ATTRIBUTES) {
    const stash = `${HINT_STASH_PREFIX}${name}`;
    const original = unit.getAttribute(stash);
    unit.removeAttribute(stash);
    if (original === null) unit.removeAttribute(name);
    else unit.setAttribute(name, original);
  }
}

/**
 * Paints one hidden run's blocks in place — the single source of truth for
 * hint / revealed / hidden / seam state. Works on existing nodes (reveals
 * never rebuild the DOM); `fresh` marks blocks that just appeared so only
 * they play the entrance fade (2026-11-24 抖动修复).
 */
export function paintRun(
  root: HTMLElement,
  run: HTMLElement[],
  gap: number,
  upRegion: number,
  downRegion: number,
  state: SnapshotGapState | undefined,
  fresh = false,
): void {
  const doc = root.ownerDocument ?? document;
  const total = run.length;
  const roles = runRoles(state, total);

  run.forEach((unit, index) => {
    const role = roles[index];
    const wasHidden = unit.hasAttribute("data-myz-hidden");
    const wasHint = unit.classList.contains("myz-snapshot-fold-hint");
    unit.classList.remove(
      "myz-snapshot-fold-hint",
      "myz-snapshot-revealed",
      "myz-snapshot-fold-hidden",
    );
    unit.removeAttribute("data-myz-hidden");
    unit.removeAttribute("data-revealed");
    // Only hint-owned attributes are touched, and only on blocks that were
    // hints — a source `title`/`role` comes back exactly as it was.
    if (wasHint) {
      unit.removeAttribute("data-gap");
      unit.removeAttribute("data-side");
      restoreAttributes(unit);
    }
    if (role === "hidden") {
      unit.classList.add("myz-snapshot-fold-hidden");
      unit.setAttribute("data-myz-hidden", "1");
    } else if (role === "hint-up" || role === "hint-down") {
      const side = role === "hint-up" ? "up" : "down";
      borrowAttributes(unit);
      unit.classList.add("myz-snapshot-fold-hint");
      unit.setAttribute("data-gap", String(gap));
      unit.setAttribute("data-side", side);
      unit.setAttribute("tabindex", "0");
      unit.setAttribute("role", "button");
      unit.setAttribute("aria-expanded", "false");
      const label = side === "up" ? "向上展开一段" : "向下展开一段";
      unit.setAttribute("aria-label", label);
      unit.setAttribute("title", label);
    } else {
      unit.classList.add("myz-snapshot-revealed");
      unit.setAttribute(
        "data-revealed",
        role === "revealed-all"
          ? `gap-${gap}`
          : `gap-${gap}-${role === "revealed-up" ? "up" : "down"}`,
      );
    }
    // Entrance fade only where content just appeared (hidden → visible);
    // hint → revealed keeps the smooth unblur transition instead. Set-only:
    // removing the attr mid-flight would cancel a running fade on rapid
    // clicks.
    if (fresh && wasHidden && role !== "hidden") {
      unit.setAttribute("data-myz-fresh", "1");
    }
  });

  // The seam lives between the two hints; one per gap, gone when the pool
  // has fewer than two blocks left.
  const hintDownIndex = roles.indexOf("hint-down");
  const existing = root.querySelector(
    `[data-tear="gap-${gap}"]`,
  ) as HTMLElement | null;
  if (hintDownIndex < 0) {
    existing?.remove();
    return;
  }
  const anchor = run[hintDownIndex];
  const seam = existing ?? tearElement(doc, gap, upRegion, downRegion);
  if (
    seam.parentNode !== anchor.parentNode ||
    seam.nextElementSibling !== anchor
  ) {
    anchor.parentNode?.insertBefore(seam, anchor);
  }
}

/**
 * Re-paints one gap's run in place after a reveal. `root` is the snapshot
 * body; the run is found by its stable `data-myz-run` tag and the flank
 * region ids are read off its blocks. Same nodes, zero rebuild.
 */
export function repaintGap(
  root: HTMLElement,
  gap: number,
  state: SnapshotGapState,
  fresh = true,
): void {
  const run = Array.from(
    root.querySelectorAll<HTMLElement>(`[data-myz-run="${gap}"]`),
  );
  if (!run.length) return;
  const upRegion = Number(run[0].getAttribute("data-up-region") ?? "-1");
  const downRegion = Number(run[0].getAttribute("data-down-region") ?? "-1");
  paintRun(root, run, gap, upRegion, downRegion, state, fresh);
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

  const units = collectUnits(container);
  // Stable per-unit id in document order — the anchor the view re-finds
  // after a repaint (hint and revealed are the same unit).
  units.forEach((unit, index) =>
    unit.setAttribute("data-myz-unit", String(index)),
  );
  // Annotated regions are numbered in a first pass: a run's lower anchor is
  // the NEXT region, which must already carry its id when the run is painted
  // (CodeRabbit #136: reading it lazily left every `data-down-region` at -1).
  let regionIndex = 0;
  units.forEach((unit) => {
    if (!hasMark(unit)) return;
    unit.classList.add("myz-snapshot-region");
    unit.setAttribute("data-region", String(regionIndex));
    regionIndex += 1;
  });
  let gapIndex = 0;

  /** Page-margin comment icons appended inside an annotated block. */
  const noteIcons = (unit: HTMLElement) => {
    const icons: string[] = [];
    const seen = new Set<string>();
    unit.querySelectorAll("mark[data-myz-anchor]").forEach((m) => {
      const id = m.getAttribute("data-myz-anchor") || "";
      // Only the reader's own keys count: a record id like `constructor`
      // must not resolve through the prototype.
      if (!Object.prototype.hasOwnProperty.call(notes, id)) return;
      const note = notes[id];
      if (!note || seen.has(id)) return;
      seen.add(id);
      icons.push(
        `<button type="button" class="myz-snapshot-note-icon" ` +
          `data-note-for="${escapeHtml(id)}" title="查看批注" ` +
          `aria-label="查看批注">${COMMENT_SVG}</button>`,
      );
    });
    if (!icons.length) return;
    // span: valid inside <p>/<li> and absolutely positioned (no layout).
    const holder = unit.ownerDocument.createElement("span");
    holder.className = "myz-snapshot-note-icons";
    holder.innerHTML = icons.join("");
    unit.appendChild(holder);
  };

  let i = 0;
  while (i < units.length) {
    const unit = units[i];
    if (hasMark(unit)) {
      noteIcons(unit);
      i += 1;
      continue;
    }
    let j = i;
    while (j < units.length && !hasMark(units[j])) j += 1;
    // Runs sit between annotated regions; each side's region is the visual
    // anchor for unfolding from that side (A above / G below).
    const upRegion =
      i > 0 && hasMark(units[i - 1])
        ? Number(units[i - 1].getAttribute("data-region") ?? "-1")
        : -1;
    const downRegion =
      j < units.length && hasMark(units[j])
        ? Number(units[j].getAttribute("data-region") ?? "-1")
        : -1;
    const run = units.slice(i, j);
    run.forEach((block) => {
      block.setAttribute("data-myz-run", String(gapIndex));
      block.setAttribute("data-up-region", String(upRegion));
      block.setAttribute("data-down-region", String(downRegion));
    });
    paintRun(container, run, gapIndex, upRegion, downRegion, gaps[gapIndex]);
    gapIndex += 1;
    i = j;
  }

  return container.innerHTML;
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
