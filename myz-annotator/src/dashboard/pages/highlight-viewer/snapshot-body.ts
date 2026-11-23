/**
 * The viewer's second view: a saved page body (§I8).
 *
 * Read-only on purpose — no interactions on the copy itself. The snapshot HTML
 * comes from a page we captured, but it still passes through the shared
 * sanitizer before `innerHTML`: stripping scripts at capture time is not a
 * security boundary once the data has been sitting in storage.
 */
import type { PageSnapshot } from "@myz/core/page-snapshot";
import { sanitizeHtmlString } from "@myz/shared/sanitizeHtml";

/** One record's text to mark inside the page's copy. */
export interface SnapshotMark {
  /** Record id; lands in `data-myz-anchor` so the active one can be styled. */
  id: string;
  text: string;
}

/**
 * Finds the record's text inside one text node, tolerating different
 * whitespace.
 *
 * The snapshot keeps the page's original spacing (`the  selected\nsentence`)
 * while the record stores a normalized quote, so a plain `indexOf` misses. This
 * compares on normalized text and maps the hit back to the node's own offsets.
 *
 * @returns Offsets into the original node text, or `null`.
 */
export function matchInNode(
  content: string,
  needle: string,
): { start: number; length: number } | null {
  const direct = content.indexOf(needle);
  if (direct >= 0) return { start: direct, length: needle.length };

  const collapsed = content.replace(/\s+/g, " ");
  const target = needle.replace(/\s+/g, " ");
  const hit = collapsed.indexOf(target);
  if (hit < 0) return null;

  // Map each normalized character back to its offset in the original text.
  const offsets: number[] = [];
  let index = 0;
  while (index < content.length) {
    offsets.push(index);
    if (/\s/.test(content[index])) {
      while (index + 1 < content.length && /\s/.test(content[index + 1])) {
        index += 1;
      }
    }
    index += 1;
  }
  const start = offsets[hit] ?? 0;
  const lastNormalized = hit + target.length - 1;
  const endOffset = offsets[lastNormalized] ?? content.length - 1;
  return { start, length: endOffset - start + 1 };
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
  let output = html;
  for (const mark of marks) {
    output = highlightOneText(output, mark);
  }
  return output;
}

function highlightOneText(html: string, mark: SnapshotMark): string {
  const needle = (mark.text || "").replace(/\s+/g, " ").trim();
  if (!needle || typeof document === "undefined") return html;

  const container = document.createElement("div");
  container.innerHTML = html;
  const short = needle.length > 120 ? needle.slice(0, 120) : needle;

  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  const targets: Array<{ node: Text; start: number; length: number }> = [];
  while (walker.nextNode()) {
    const node = walker.currentNode as Text;
    const found = matchInNode(node.textContent || "", short);
    if (found) targets.push({ node, ...found });
  }

  for (const { node, start: index, length } of targets) {
    const range = document.createRange();
    range.setStart(node, index);
    range.setEnd(node, index + length);
    const element = document.createElement("mark");
    element.setAttribute("data-myz-snapshot-mark", "1");
    element.setAttribute("data-myz-anchor", mark.id);
    try {
      range.surroundContents(element);
    } catch {
      // A range spanning elements cannot be wrapped; leaving the text
      // unhighlighted is acceptable in a read-only view.
    }
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
