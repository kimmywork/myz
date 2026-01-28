import { normalizeHighlightStyle } from "@/shared/highlightUtils.ts";
import { isNodeFromMyz } from "@/shared/serializer.ts";
import { MyZRecord, HIGHLIGHT_STYLES, DEFAULT_COLORS } from "@/shared/types.ts";

function createHighlightElement(record: MyZRecord) {
  const highlight = document.createElement("span");
  highlight.className = "myz-highlight";
  decorateHighlightElement(highlight, record);
  return highlight;
}

export function wrapSimpleRange(range: Range, record: MyZRecord) {
  const fragment = range.cloneContents();
  if (!fragment || !fragment.childNodes.length) {
    return false;
  }
  const highlight = createHighlightElement(record);
  highlight.appendChild(fragment);
  range.deleteContents();
  range.insertNode(highlight);
  return true;
}

export function wrapRangeAcrossNodes(range: Range, record: MyZRecord) {
  const textNodes = collectTextNodes(range);
  if (!textNodes.length) {
    return false;
  }
  let applied = false;
  textNodes.forEach((node) => {
    const didWrap = wrapTextNodeSegment(node, range, record);
    applied = didWrap || applied;
  });
  return applied;
}

function collectTextNodes(range: Range): Text[] {
  const nodes: Text[] = [];
  const iterator = document.createNodeIterator(
    range.commonAncestorContainer,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode(node) {
        // Ignore nodes that belong to the extension UI or highlights
        if (isNodeFromMyz(node)) {
          return NodeFilter.FILTER_REJECT;
        }
        if (!range.intersectsNode(node)) {
          return NodeFilter.FILTER_REJECT;
        }
        if (!node.textContent || !node.textContent.trim()) {
          return NodeFilter.FILTER_REJECT;
        }
        return NodeFilter.FILTER_ACCEPT;
      },
    },
  );
  let current;
  while ((current = iterator.nextNode() as Text | null)) {
    nodes.push(current);
  }
  return nodes;
}

function wrapTextNodeSegment(node: Text, range: Range, record: MyZRecord) {
  const offsets = computeSegmentOffsets(node, range);
  if (!offsets || offsets.end <= offsets.start) {
    return false;
  }
  let target = node;
  const length = node.textContent.length;
  if (offsets.end < length) target.splitText(offsets.end);
  if (offsets.start > 0) target = target.splitText(offsets.start);
  if (!target || !target.textContent.trim()) return false;
  const parent = target.parentNode;
  if (!parent) return false;
  const highlight = createHighlightElement(record);
  parent.insertBefore(highlight, target);
  highlight.appendChild(target);
  return true;
}

function computeSegmentOffsets(node: Text, range: Range) {
  const length = node.textContent.length;
  let start = 0;
  let end = length;

  if (node === range.startContainer) {
    start = range.startOffset;
  }
  if (node === range.endContainer) {
    end = range.endOffset;
  }

  const startPosition = range.startContainer.compareDocumentPosition(node);
  if (startPosition & Node.DOCUMENT_POSITION_FOLLOWING) {
    start = 0;
  }
  const endPosition = range.endContainer.compareDocumentPosition(node);
  if (endPosition & Node.DOCUMENT_POSITION_PRECEDING) {
    end = length;
  }

  start = Math.max(0, Math.min(start, length));
  end = Math.max(start, Math.min(end, length));
  return { start, end };
}

export function decorateHighlightElement(
  element: HTMLElement,
  record: MyZRecord,
) {
  if (!element) {
    return;
  }
  const style = normalizeHighlightStyle(record?.style);
  const color = resolveHighlightColor(record?.color);
  Object.values(HIGHLIGHT_STYLES).forEach((value) => {
    element.classList.remove(`myz-highlight--${value}`);
  });
  element.classList.add(`myz-highlight--${style}`);
  if (record?.id) {
    element.dataset.highlightId = record.id;
  }
  element.dataset.highlightStyle = style;
  element.style.setProperty("--myz-highlight-color", color);

  // Inline fallbacks so highlights remain visible even if the stylesheet is removed.
  element.style.backgroundColor = "transparent";
  element.style.textDecoration = "";
  element.style.textDecorationColor = "";
  element.style.textDecorationThickness = "";
  if (style === HIGHLIGHT_STYLES.PAINT) {
    element.style.backgroundColor = color;
  } else if (style === HIGHLIGHT_STYLES.UNDERLINE) {
    element.style.textDecoration = "underline";
    element.style.textDecorationColor = color;
    element.style.textDecorationThickness = "2px";
  } else if (style === HIGHLIGHT_STYLES.WAVY) {
    element.style.textDecoration = "underline wavy";
    element.style.textDecorationColor = color;
    element.style.textDecorationThickness = "2px";
  }
}

export function resolveHighlightColor(color: string | undefined): string {
  if (typeof color === "string") {
    const trimmed = color.trim();
    if (/^#[0-9a-fA-F]{6}$/.test(trimmed)) {
      return trimmed;
    }
  }
  return DEFAULT_COLORS[0];
}
