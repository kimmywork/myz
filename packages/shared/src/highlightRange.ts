import { isNodeFromMyz } from "./serializer"

/**
 * Range → highlight wrapper, shared by the web content script and the EPUB
 * reader.
 *
 * The important rule: never wrap a whole range in one element. A range can
 * span block elements, and a `<span>`/`<mark>` cannot legally contain them —
 * wrapping the whole thing corrupts the layout. Instead the range is split per
 * text node and each segment is wrapped separately.
 *
 * Everything is resolved through `ownerDocument`, so the same code works in
 * the page `document` and inside the EPUB iframe document.
 */

export type HighlightWrapperFactory = () => HTMLElement

export function collectRangeTextNodes(range: Range): Text[] {
  const root = range.commonAncestorContainer
  const ownerDocument = root.ownerDocument ?? document
  const nodes: Text[] = []
  const iterator = ownerDocument.createNodeIterator(
    root,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode(node) {
        if (isNodeFromMyz(node)) {
          return NodeFilter.FILTER_REJECT
        }
        if (!range.intersectsNode(node)) {
          return NodeFilter.FILTER_REJECT
        }
        if (!node.textContent || !node.textContent.trim()) {
          return NodeFilter.FILTER_REJECT
        }
        return NodeFilter.FILTER_ACCEPT
      },
    },
  )
  let current: Node | null
  while ((current = iterator.nextNode())) {
    nodes.push(current as Text)
  }
  return nodes
}

export function computeSegmentOffsets(node: Text, range: Range) {
  const length = node.textContent?.length ?? 0
  let start = 0
  let end = length

  if (node === range.startContainer) {
    start = range.startOffset
  }
  if (node === range.endContainer) {
    end = range.endOffset
  }

  const startPosition = range.startContainer.compareDocumentPosition(node)
  if (startPosition & Node.DOCUMENT_POSITION_FOLLOWING) {
    start = 0
  }
  const endPosition = range.endContainer.compareDocumentPosition(node)
  if (endPosition & Node.DOCUMENT_POSITION_PRECEDING) {
    end = length
  }

  start = Math.max(0, Math.min(start, length))
  end = Math.max(start, Math.min(end, length))
  return { start, end }
}

function wrapTextNodeSegment(
  node: Text,
  range: Range,
  createWrapper: HighlightWrapperFactory,
): boolean {
  const offsets = computeSegmentOffsets(node, range)
  if (!offsets || offsets.end <= offsets.start) {
    return false
  }
  let target = node
  const length = node.textContent?.length ?? 0
  if (offsets.end < length) {
    target.splitText(offsets.end)
  }
  if (offsets.start > 0) {
    target = target.splitText(offsets.start)
  }
  if (!target || !target.textContent?.trim()) {
    return false
  }
  const parent = target.parentNode
  if (!parent) {
    return false
  }
  const wrapper = createWrapper()
  parent.insertBefore(wrapper, target)
  wrapper.appendChild(target)
  return true
}

/** Splits the range per text node and wraps each segment. */
export function wrapRangeAcrossNodes(
  range: Range,
  createWrapper: HighlightWrapperFactory,
): boolean {
  const textNodes = collectRangeTextNodes(range)
  if (!textNodes.length) {
    return false
  }
  let applied = false
  textNodes.forEach((node) => {
    applied = wrapTextNodeSegment(node, range, createWrapper) || applied
  })
  return applied
}

/**
 * Last-resort fragment wrapper, used only when text-node wrapping does not
 * apply. Kept as the shared escape hatch so both hosts behave identically.
 */
export function wrapSimpleRange(
  range: Range,
  createWrapper: HighlightWrapperFactory,
): boolean {
  const fragment = range.cloneContents()
  if (!fragment || !fragment.childNodes.length) {
    return false
  }
  const wrapper = createWrapper()
  wrapper.appendChild(fragment)
  range.deleteContents()
  range.insertNode(wrapper)
  return true
}
