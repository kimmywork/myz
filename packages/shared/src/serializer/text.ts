import { isNodeFromMyz } from "./path.ts"

export function getDescendantTextNodes(el: Node): Text[] {
  const out: Text[] = []
  const ownerDocument = el.ownerDocument ?? document
  const it = ownerDocument.createNodeIterator(el, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (isNodeFromMyz(node)) return NodeFilter.FILTER_REJECT
      if (!node.textContent) return NodeFilter.FILTER_REJECT
      return NodeFilter.FILTER_ACCEPT
    },
  })
  let cur
  while ((cur = it.nextNode() as Text)) out.push(cur)
  return out
}

export function getTextLength(node?: Node): number {
  if (!node) return 0
  if (node.nodeType === Node.TEXT_NODE)
    return (node as Text).textContent.length
  let sum = 0
  node.childNodes.forEach((c) => {
    if (isNodeFromMyz(c)) return
    sum += getTextLength(c)
  })
  return sum
}

export function charOffsetWithinElement(
  element: Node,
  container: Node,
  offset: number,
): number {
  if (!element) return 0
  const texts = getDescendantTextNodes(element)
  if (container.nodeType === Node.TEXT_NODE) {
    let acc = 0
    for (const tn of texts as Text[]) {
      if (tn === container)
        return acc + Math.min(offset, tn.textContent.length)
      acc += tn.textContent.length
    }
    return acc
  }
  let sum = 0
  const children = Array.from(container.childNodes || [])
  for (let i = 0; i < offset && i < children.length; i += 1) {
    const ch = children[i]
    if (isNodeFromMyz(ch)) continue
    sum += getTextLength(ch)
  }
  return sum
}

export function nodeForCharOffset(
  element: Node,
  charOffset: number,
): { node: Node; offset: number } | null {
  const texts = getDescendantTextNodes(element)
  let acc = 0
  for (const tn of texts) {
    const len = tn.textContent.length
    if (charOffset <= acc + len) {
      return { node: tn, offset: Math.max(0, charOffset - acc) }
    }
    acc += len
  }
  if (texts.length) {
    const last = texts[texts.length - 1]
    return { node: last, offset: last.textContent.length }
  }
  return null
}

function collapseWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim()
}

interface NormalizedTextIndex {
  haystack: string
  rawIndexMap: number[]
  positions: { node: Text; offset: number }[]
}

function buildNormalizedTextIndex(root: Node): NormalizedTextIndex {
  const chars: string[] = []
  const positions: { node: Text; offset: number }[] = []
  const ownerDocument = root.ownerDocument ?? document
  const iterator = ownerDocument.createNodeIterator(
    root,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode(node) {
        if (isNodeFromMyz(node)) return NodeFilter.FILTER_REJECT
        return NodeFilter.FILTER_ACCEPT
      },
    },
  )
  let current: Node | null
  while ((current = iterator.nextNode())) {
    const textNode = current as Text
    const value = textNode.textContent || ""
    for (let i = 0; i < value.length; i += 1) {
      chars.push(value[i])
      positions.push({ node: textNode, offset: i })
    }
  }
  const raw = chars.join("")

  const normalizedChars: string[] = []
  const rawIndexMap: number[] = []
  let previousSpace = false
  for (let i = 0; i < raw.length; i += 1) {
    const char = raw[i]
    if (/\s/.test(char)) {
      if (previousSpace || normalizedChars.length === 0) continue
      normalizedChars.push(" ")
      rawIndexMap.push(i)
      previousSpace = true
    } else {
      normalizedChars.push(char)
      rawIndexMap.push(i)
      previousSpace = false
    }
  }
  while (
    normalizedChars.length &&
    normalizedChars[normalizedChars.length - 1] === " "
  ) {
    normalizedChars.pop()
    rawIndexMap.pop()
  }
  return { haystack: normalizedChars.join(""), rawIndexMap, positions }
}

function rangeFromNormalizedIndex(
  index: NormalizedTextIndex,
  startIndex: number,
  endIndex: number,
  ownerDocument: Document = document,
): Range | null {
  const rawStart = index.rawIndexMap[startIndex]
  const rawEnd = index.rawIndexMap[endIndex]
  if (rawStart === undefined || rawEnd === undefined) return null
  const startPosition = index.positions[rawStart]
  const endPosition = index.positions[rawEnd]
  if (!startPosition || !endPosition) return null
  try {
    const range = ownerDocument.createRange()
    range.setStart(startPosition.node, startPosition.offset)
    range.setEnd(endPosition.node, endPosition.offset + 1)
    return range
  } catch {
    return null
  }
}

function countOccurrences(haystack: string, needle: string): number {
  if (!needle) return 0
  let count = 0
  let from = 0
  while (from <= haystack.length - needle.length) {
    const found = haystack.indexOf(needle, from)
    if (found === -1) break
    count += 1
    if (count > 1) return count
    from = found + needle.length
  }
  return count
}

/**
 * Rebuild a range by searching for the record's text. Used when the stored
 * element path no longer resolves (the page DOM changed).
 *
 * First tries a unique exact match of the whole text. If the page was edited,
 * falls back to the longest unique contiguous substring ("anchor") so a small
 * edit does not lose the highlight. Returns null when no unique anchor exists,
 * rather than guessing between repeated paragraphs.
 */
export function findRangeByNormalizedText(
  root: Node,
  text: string,
): Range | null {
  const needle = collapseWhitespace(text || "")
  if (needle.length < 4) return null
  const ownerDocument = root.ownerDocument ?? document
  const index = buildNormalizedTextIndex(root)
  const { haystack } = index

  const exact = haystack.indexOf(needle)
  if (exact !== -1 && countOccurrences(haystack, needle) === 1) {
    return rangeFromNormalizedIndex(
      index,
      exact,
      exact + needle.length - 1,
      ownerDocument,
    )
  }

  const maxLength = Math.min(needle.length, 160)
  const minLength = Math.min(24, needle.length)
  for (let length = maxLength; length >= minLength; length -= 4) {
    const step = Math.max(4, Math.floor(length / 4))
    for (let offset = 0; offset + length <= needle.length; offset += step) {
      const anchor = needle.slice(offset, offset + length)
      const found = haystack.indexOf(anchor)
      if (found === -1) continue
      if (countOccurrences(haystack, anchor) !== 1) continue
      return rangeFromNormalizedIndex(
        index,
        found,
        found + length - 1,
        ownerDocument,
      )
    }
  }
  return null
}
