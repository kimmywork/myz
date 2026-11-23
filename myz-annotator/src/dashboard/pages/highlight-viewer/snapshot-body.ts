/**
 * The viewer's second view: a saved page body (§I8).
 *
 * Read-only on purpose — no interactions on the copy itself. The snapshot HTML
 * comes from a page we captured, but it still passes through the shared
 * sanitizer before `innerHTML`: stripping scripts at capture time is not a
 * security boundary once the data has been sitting in storage.
 *
 * Placement (2026-11-23 fix): **one matcher serves both jobs** — anchor
 * resolution and marking. The body is flattened to whitespace-collapsed text
 * with block separators, and every normalized index maps back to a live text
 * node, so a quote that spans inline markup (`alpha <em>beta</em> gamma`) or
 * two paragraphs resolves *and* marks. The old per-text-node search claimed
 * "located" on such quotes and then silently failed to wrap them. Wrapping
 * reuses `@myz/shared/highlightRange` (split per text node, never wrap a
 * block-spanning range in one element).
 */
import type { PageSnapshot } from "@myz/core/page-snapshot";
import { wrapRangeAcrossNodes } from "@myz/shared/highlightRange";
import { sanitizeHtmlString } from "@myz/shared/sanitizeHtml";
import { normalizeAnchorText } from "./snapshot-anchor.js";

/** One record's text to mark inside the page's copy. */
export interface SnapshotMark {
  /** Record id; lands in `data-myz-anchor` so the active one can be styled. */
  id: string;
  text: string;
}

/** Block elements separated in the flattened text so quotes can span them. */
const BLOCK_SEPARATOR_SELECTOR =
  "p, div, li, br, h1, h2, h3, h4, h5, h6, blockquote, pre, td, th";

interface TextIndex {
  /** Whitespace-collapsed text of the container, block-separated. */
  text: string;
  /** `text[i]` lives at `map[i].node.textContent[map[i].offset]`. */
  map: Array<{ node: Text; offset: number }>;
}

/** Parses the body and inserts the block separators the flattening needs. */
export function prepareSnapshotContainer(html: string): HTMLElement {
  const container = document.createElement("div");
  container.innerHTML = html;
  container
    .querySelectorAll(BLOCK_SEPARATOR_SELECTOR)
    .forEach((element) => {
      element.after(document.createTextNode(" "));
    });
  return container;
}

/** Flattens a prepared container into normalized text with a node map. */
export function buildTextIndex(container: HTMLElement): TextIndex {
  const pieces: string[] = [];
  const map: Array<{ node: Text; offset: number }> = [];
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  let pendingSpace = false;
  while (walker.nextNode()) {
    const node = walker.currentNode as Text;
    const content = node.textContent || "";
    for (let offset = 0; offset < content.length; offset += 1) {
      if (/\s/.test(content[offset])) {
        // One space per run, mapped to its first raw character.
        if (!pendingSpace && pieces.length) {
          pieces.push(" ");
          map.push({ node, offset });
          pendingSpace = true;
        }
        continue;
      }
      pieces.push(content[offset]);
      map.push({ node, offset });
      pendingSpace = false;
    }
  }
  // The needle side is trimmed; the haystack must be too.
  if (pieces[pieces.length - 1] === " ") {
    pieces.pop();
    map.pop();
  }
  return { text: pieces.join(""), map };
}

/**
 * The flattened text of a stored body — the exact haystack the anchor
 * resolution counts against, so "located" and "marked" can never disagree.
 */
export function snapshotTextOf(html: string): string {
  if (typeof document === "undefined") return normalizeAnchorText(html);
  return buildTextIndex(prepareSnapshotContainer(html)).text;
}

/**
 * Wraps each record's text in `<mark data-myz-anchor="<id>">`.
 *
 * Only *located* records belong here (see `snapshot-anchor.ts`): a text that
 * occurs zero or several times must not be marked on a guess. Marks are added
 * after sanitization, so they survive the round trip.
 */
export function highlightSnapshotText(
  html: string,
  marks: readonly SnapshotMark[],
): string {
  if (!marks.length || typeof document === "undefined") return html;
  const container = prepareSnapshotContainer(html);
  for (const mark of marks) {
    const needle = normalizeAnchorText(mark.text);
    if (!needle) continue;
    // Rebuild per mark: wrapping splits text nodes, so the node map goes stale.
    const index = buildTextIndex(container);
    const at = index.text.indexOf(needle);
    if (at < 0) continue;
    const start = index.map[at];
    const end = index.map[at + needle.length - 1];
    if (!start || !end) continue;
    const range = container.ownerDocument.createRange();
    range.setStart(start.node, start.offset);
    range.setEnd(end.node, end.offset + 1);
    wrapRangeAcrossNodes(range, () => {
      const element = container.ownerDocument.createElement("mark");
      element.setAttribute("data-myz-snapshot-mark", "1");
      element.setAttribute("data-myz-anchor", mark.id);
      return element;
    });
  }
  return container.innerHTML;
}

/** The sanitized body with every located record marked, ready for `innerHTML`. */
export function renderSnapshotBody(
  snapshot: Pick<PageSnapshot, "html">,
  marks: readonly SnapshotMark[],
): string {
  const safe = sanitizeHtmlString(snapshot.html);
  return marks.length ? highlightSnapshotText(safe, marks) : safe;
}
