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

/** Wraps the record's text in `<mark>` inside the snapshot body. */
export function highlightSnapshotText(html: string, text: string): string {
  const needle = (text || "").replace(/\s+/g, " ").trim();
  if (!needle || typeof document === "undefined") return html;

  const container = document.createElement("div");
  container.innerHTML = html;
  const short = needle.length > 120 ? needle.slice(0, 120) : needle;

  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  const targets: Text[] = [];
  while (walker.nextNode()) {
    const node = walker.currentNode as Text;
    if ((node.textContent || "").includes(short)) targets.push(node);
  }

  for (const node of targets) {
    const content = node.textContent || "";
    const index = content.indexOf(short);
    if (index < 0) continue;
    const range = document.createRange();
    range.setStart(node, index);
    range.setEnd(node, index + short.length);
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
