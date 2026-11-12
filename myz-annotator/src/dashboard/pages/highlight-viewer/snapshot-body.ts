/**
 * The viewer's second view: a saved page body (§I8).
 *
 * Read-only on purpose — no interactions, no anchor re-anchoring (that is I9).
 * The snapshot HTML comes from a page we captured, but it still passes through
 * the shared sanitizer before `innerHTML`: stripping scripts at capture time is
 * not a security boundary once the data has been sitting in storage.
 */
import type { PageSnapshot } from "@myz/core/page-snapshot";
import { sanitizeHtmlString } from "@myz/shared/sanitizeHtml";

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

/** Wraps the record's text in `<mark>` inside the snapshot body. */
export function highlightSnapshotText(html: string, text: string): string {
  const needle = (text || "").replace(/\s+/g, " ").trim();
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
    const mark = document.createElement("mark");
    mark.setAttribute("data-myz-snapshot-mark", "1");
    try {
      range.surroundContents(mark);
    } catch {
      // A range spanning elements cannot be wrapped; leaving the text
      // unhighlighted is acceptable in a read-only view.
    }
  }
  return container.innerHTML;
}

/** The sanitized body ready for `innerHTML`. */
export function renderSnapshotBody(
  snapshot: Pick<PageSnapshot, "html">,
  recordText: string | undefined,
): string {
  const safe = sanitizeHtmlString(snapshot.html);
  return recordText ? highlightSnapshotText(safe, recordText) : safe;
}
