import { sanitizeNode } from "./sanitize.js";

// `white-space` values in which a bare "\n" in a text node produces a real
// visual line break. For `normal`/`nowrap` (and the unset default, serialized
// as ""/"normal") newlines collapse to a space, so Turndown — which mirrors
// that — must NOT be fed <br> for them. Only the "preserve newlines" family
// needs structural help: once `serializeRangeToHtml` strips CSS context,
// Turndown cannot tell those newlines apart from source-formatting whitespace
// and would flatten them. Converting them to <br> re-establishes the breaks.
const WHITE_SPACE_PRESERVES_NEWLINES = new Set([
  "pre",
  "pre-wrap",
  "pre-line",
  "break-spaces",
]);

export function serializeRangeToHtml(range: Range): string {
  try {
    // Capture each text node's computed `white-space` BEFORE cloning.
    // cloneContents() returns a detached fragment with no CSS context, so any
    // newlines the browser rendered as real breaks would be indistinguishable
    // from collapsible whitespace. Pair originals with clones by document
    // order and, where newlines are preserved, turn each "\n" into a <br>.
    // pre/code descendants are skipped (defuddle keeps them verbatim).
    const originalTextNodes = collectRangeTextNodes(range);
    const fragment = range.cloneContents();
    if (!fragment || !fragment.childNodes.length) return "";
    const container = document.createElement("div");
    container.appendChild(fragment);
    preserveSoftNewlines(container, originalTextNodes);
    sanitizeNode(container);
    return container.innerHTML.trim();
  } catch (error) {
    console.warn("Failed to serialize selection HTML", error);
    return "";
  }
}

// Document-order text nodes within `range`, each paired with the computed
// `white-space` of its parent. Uses intersectsNode (not compareBoundaryPoints,
// which returns -1 instead of 0 for coincident boundaries in jsdom).
function collectRangeTextNodes(range: Range) {
  const root =
    range.commonAncestorContainer.nodeType === Node.TEXT_NODE
      ? range.commonAncestorContainer.parentNode
      : (range.commonAncestorContainer as Node);
  if (!root) return [] as Array<{ preserveNewlines: boolean }>;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const result: Array<{ preserveNewlines: boolean }> = [];
  let node: Text | null;
  while ((node = walker.nextNode() as Text | null)) {
    if (!range.intersectsNode(node)) continue;
    const parentElement = node.parentElement;
    let preserveNewlines = false;
    if (parentElement) {
      // Skip pre/code: their newlines are preserved downstream by defuddle's
      // preformattedCode:true and would be mangled by inserting <br>.
      let cursor: Element | null = parentElement;
      let insidePreOrCode = false;
      while (cursor) {
        if (cursor.tagName === "PRE" || cursor.tagName === "CODE") {
          insidePreOrCode = true;
          break;
        }
        cursor = cursor.parentElement;
      }
      if (!insidePreOrCode) {
        const whiteSpace = getComputedStyle(parentElement).whiteSpace;
        preserveNewlines = WHITE_SPACE_PRESERVES_NEWLINES.has(
          whiteSpace.toLowerCase(),
        );
      }
    }
    result.push({ preserveNewlines });
  }
  return result;
}

// Walk the cloned fragment's text nodes in document order and, where the
// corresponding original node preserved newlines, replace each "\n" with a
// <br>. Pairs by index; if counts diverge we bail out rather than risk
// mis-assigning <br>.
function preserveSoftNewlines(
  root: Element,
  originalTextNodes: Array<{ preserveNewlines: boolean }>,
) {
  if (!originalTextNodes.length) return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const cloneNodes: Text[] = [];
  let node: Text | null;
  while ((node = walker.nextNode() as Text | null)) cloneNodes.push(node);
  if (cloneNodes.length !== originalTextNodes.length) return;
  for (let index = 0; index < cloneNodes.length; index += 1) {
    if (!originalTextNodes[index].preserveNewlines) continue;
    const textNode = cloneNodes[index];
    const value = textNode.nodeValue || "";
    if (!value.includes("\n")) continue;
    const fragment = document.createDocumentFragment();
    value.split("\n").forEach((part, partIndex) => {
      if (partIndex > 0) fragment.appendChild(document.createElement("br"));
      if (part) fragment.appendChild(document.createTextNode(part));
    });
    const parent = textNode.parentNode;
    if (parent) parent.replaceChild(fragment, textNode);
  }
}
