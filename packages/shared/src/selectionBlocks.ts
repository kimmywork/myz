/**
 * Selection → paragraph blocks.
 *
 * `Range.toString()` flattens a selection into one string with no reliable
 * block boundaries (and PDF text layers carry no separators at all), so
 * structure must come from the document rather than from newline heuristics.
 * Grouping the range's text nodes by their nearest block-level ancestor keeps
 * the document's paragraph structure, so each block can be translated on its
 * own and the result keeps the same shape.
 */

const BLOCK_TAGS = new Set([
  "ADDRESS",
  "ARTICLE",
  "ASIDE",
  "BLOCKQUOTE",
  "DD",
  "DIV",
  "DL",
  "DT",
  "FIGCAPTION",
  "FIGURE",
  "FOOTER",
  "FORM",
  "H1",
  "H2",
  "H3",
  "H4",
  "H5",
  "H6",
  "HEADER",
  "HR",
  "LI",
  "MAIN",
  "NAV",
  "OL",
  "P",
  "PRE",
  "SECTION",
  "TABLE",
  "TBODY",
  "TD",
  "TFOOT",
  "TH",
  "THEAD",
  "TR",
  "UL",
])

function blockAncestor(node: Node, root: Node): Element | null {
  let element =
    node.nodeType === Node.ELEMENT_NODE
      ? (node as Element)
      : (node.parentElement ?? null)
  while (element && element !== root) {
    if (BLOCK_TAGS.has(element.tagName)) {
      return element
    }
    element = element.parentElement
  }
  return null
}

/**
 * Splits a range into paragraph strings, one per block-level element. Inline
 * runs inside one block are joined; separate blocks (headings, paragraphs,
 * list items) stay separate.
 */
export function selectionBlocks(range: Range): string[] {
  if (range.collapsed) {
    return []
  }
  const root = range.commonAncestorContainer
  const walkerRoot = root.nodeType === Node.TEXT_NODE ? root.parentNode : root
  const ownerDocument = root.ownerDocument ?? document
  if (!walkerRoot) {
    return []
  }
  const blocks: { element: Element | null; parts: string[] }[] = []
  const walker = ownerDocument.createTreeWalker(walkerRoot, NodeFilter.SHOW_TEXT)
  let node = walker.nextNode() as Text | null
  while (node) {
    if (node.data.trim() && range.intersectsNode(node)) {
      const start = node === range.startContainer ? range.startOffset : 0
      const end =
        node === range.endContainer ? range.endOffset : node.data.length
      const text = node.data.slice(start, end)
      if (text.trim()) {
        const element = blockAncestor(node, walkerRoot)
        const last = blocks[blocks.length - 1]
        if (last && last.element === element) {
          last.parts.push(text)
        } else {
          blocks.push({ element, parts: [text] })
        }
      }
    }
    node = walker.nextNode() as Text | null
  }
  return blocks
    .map((block) => block.parts.join("").replace(/\s+/g, " ").trim())
    .filter(Boolean)
}
