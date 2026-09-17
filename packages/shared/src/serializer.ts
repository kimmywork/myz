import { isHighlightRecord } from "./highlightUtils"
import type { MyZRecord } from "./types.ts"

export function isMyzWrapper(node: Node): boolean {
  if (node && node.nodeType === node.ELEMENT_NODE) {
    const element = node as Element
    return element.classList && element.classList.contains("myz-highlight")
  }
  return false
}

export function isNodeFromMyz(node: Node): boolean {
  if (!node) return false
  if (node.nodeType === node.ELEMENT_NODE) {
    const el = node as Element
    if (el.classList && el.classList.contains("myz-highlight")) return true
    if (el.closest && el.closest("[data-myz-host]")) return true
    return false
  }
  if (node.parentElement && node.parentElement.closest) {
    return !!node.parentElement.closest("[data-myz-host]")
  }
  return false
}

export function findPrimaryDescendant(el: Element): Element | null {
  if (!el) return null
  const queue = Array.from(el.childNodes || [])
  while (queue.length) {
    const n = queue.shift() as Element
    if (!isNodeFromMyz(n) && !isMyzWrapper(n)) return n
    if (n.childNodes && n.childNodes.length)
      queue.push(...Array.from(n.childNodes))
  }
  return null
}

export function getLogicalChildNodes(
  parent: Node,
): { dom: Node; logical: Node }[] {
  const out: { dom: Node; logical: Node }[] = []
  Array.from(parent.childNodes).forEach((child) => {
    if (shouldIgnoreForPath(child)) {
      return
    }
    if (!isMyzWrapper(child) && isNodeFromMyz(child)) return
    if (isMyzWrapper(child)) {
      Array.from(child.childNodes).forEach((inner) => {
        if (isNodeFromMyz(inner)) return
        out.push({ dom: inner, logical: inner })
      })
    } else {
      out.push({ dom: child, logical: child })
    }
  })
  return out
}

export interface ChildAndLogical {
  child: Node | null
  logical: Node | null
}

export interface PathSegment {
  name: string
  index: number
}

export function getDirectChildAndLogical(
  node: Node,
  parent: ParentNode,
): ChildAndLogical {
  let child = node
  while (child && child.parentNode && child.parentNode !== parent) {
    child = child.parentNode
  }
  if (!child || child.parentNode !== parent)
    return { child: null, logical: null }
  if (shouldIgnoreForPath(child)) {
    return { child: null, logical: null }
  }
  if (isMyzWrapper(child)) {
    if (child !== node) return { child, logical: node }
    const el = child as Element
    return { child, logical: findPrimaryDescendant(el) || child }
  }
  return { child, logical: child }
}

export function nodeName(node: Node | null): string {
  return node && node.nodeType === node.TEXT_NODE
    ? "#text"
    : node && node.nodeName
      ? node.nodeName.toLowerCase()
      : ""
}

export function sameNodeType(a: Node, b: Node | null) {
  if (!a || !b) return false
  if (a.nodeType !== b.nodeType) return false
  if (a.nodeType === Node.TEXT_NODE) return true
  return a.nodeName === b.nodeName
}

export function buildPath(node: Node): PathSegment[] {
  const path: PathSegment[] = []
  let current = node
  while (current && current !== document) {
    const parent = current.parentNode
    if (!parent) break
    const { child: _, logical: directLogical } = getDirectChildAndLogical(
      current,
      parent,
    )
    const logicalChildren = getLogicalChildNodes(parent).map((o) => o.logical)
    const siblings = logicalChildren.filter((childNode) =>
      sameNodeType(childNode, directLogical),
    )
    const index = siblings.indexOf(directLogical!!)
    const seg: PathSegment = { name: nodeName(directLogical), index }
    path.unshift(seg)
    current = parent
  }
  return path
}

function resolvePath(path: PathSegment[]): Node | null {
  // Normalize root to an element to start iteration
  let current: Node = document
  if (Array.isArray(path) && path.length && current && current.nodeName) {
    const firstName = path[0] && path[0].name
    if (
      typeof firstName === "string" &&
      firstName.toLowerCase() === (current.nodeName || "").toLowerCase()
    ) {
      path = path.slice(1)
    }
  }
  for (const segment of path) {
    const logicalList = getLogicalChildNodes(current)
    const pairs = logicalList.filter((entry) => {
      const logical = entry.logical
      if (segment.name === "#text") return logical.nodeType === Node.TEXT_NODE
      return (
        logical.nodeType === Node.ELEMENT_NODE &&
        logical.nodeName.toLowerCase() === segment.name
      )
    })
    const chosenPair = pairs[segment.index] || null
    if (!chosenPair) return null
    current = chosenPair.dom
  }
  return current
}

export function getDescendantTextNodes(el: Node): Text[] {
  const out: Text[] = []
  const it = document.createNodeIterator(el, NodeFilter.SHOW_TEXT, {
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

export function unwrapNode(node: Node) {
  const parent = node.parentNode
  if (!parent) {
    return
  }
  while (node.firstChild) {
    parent.insertBefore(node.firstChild, node)
  }
  parent.removeChild(node)
  parent.normalize()
}

function clampOffset(node: Node, requested: number) {
  if (node.nodeType === Node.TEXT_NODE) {
    const textNode = node as Text
    return Math.min(requested, textNode.textContent.length)
  }
  return Math.min(requested, node.childNodes.length)
}

function shouldIgnoreForPath(node?: Node): boolean {
  if (!node) {
    return false
  }
  if (isArchiveInjectedNode(node)) {
    return true
  }
  return false
}

function isArchiveInjectedNode(node: Node): boolean {
  const hostname = window.location.hostname || ""
  if (hostname !== "web.archive.org") {
    return false
  }

  if (node.nodeType === Node.COMMENT_NODE) {
    const value = String(node.textContent || "")
    const lower = value.toLowerCase()
    if (
      lower.includes("wayback machine") ||
      lower.includes("file archived") ||
      lower.includes("wayback toolbar insert")
    ) {
      return true
    }
  }

  if (node.nodeType !== Node.ELEMENT_NODE) {
    return false
  }

  const el = node as Element

  const id = (el.getAttribute && el.getAttribute("id")) || ""
  if (id.startsWith("wm-")) {
    return true
  }

  const dataOwner = el.getAttribute && el.getAttribute("data-owner")
  if (dataOwner && dataOwner.toLowerCase() === "wayback-machine") {
    return true
  }

  const classList = el.classList ? Array.from(el.classList) : []
  if (
    classList.some(
      (value) => value.startsWith("wb-") || value === "wayback-toolbar",
    )
  ) {
    return true
  }

  const tagName = node.nodeName ? node.nodeName.toLowerCase() : ""
  if (tagName === "script" || tagName === "style" || tagName === "link") {
    const ref = el.getAttribute("src") || el.getAttribute("href") || ""
    if (ref.includes("/_static/") || ref.includes("wayback")) {
      return true
    }
  }

  if (tagName === "div") {
    const role = el.getAttribute("role") || ""
    if (role === "navigation" && classList.includes("wb-toolbar")) {
      return true
    }
    if (id === "donato" || id === "wm-ipp-base") {
      return true
    }
  }

  return false
}

export function serializeRange(
  range: Range,
  highlightCache: Map<string, MyZRecord>,
  applyHighlight: (rec: MyZRecord) => void = () => {},
): SerializedRange | null {
  try {
    // If the page already contains MyZ wrapper nodes, temporarily unwrap
    // them so we compute paths against the original DOM. Afterwards we
    // reapply existing highlights from cache. This avoids path indexing
    // shifts caused by wrapper elements.
    const existing = Array.from(document.querySelectorAll(".myz-highlight"))
    const ids: string[] = existing
      .map((n) => (n as HTMLElement).dataset?.highlightId)
      .filter(Boolean) as string[]

    try {
      existing.forEach((node) => unwrapNode(node))
      // More robust serialization: store a path to the nearest element
      // ancestor plus a character offset within that element. This is
      // resilient to text-node merging/splitting when wrappers are
      // removed and prevents indices from becoming invalid.
      return serializeRangePaths(range)
    } finally {
      // Reapply highlights from cache; ignore failures.
      ids.forEach((id) => {
        try {
          const rec = highlightCache.get(id)
          if (rec && isHighlightRecord(rec)) {
            applyHighlight(rec)
          }
        } catch (e) {
          // swallow
        }
      })
    }
  } catch (error) {
    console.error("Failed to serialize range", error)
    return null
  }
}

/**
 * Compute the serialized path for a range against the current DOM. Unlike
 * `serializeRange`, it does not unwrap/reapply existing highlights, so it is
 * safe to call while highlights are mounted (e.g. when rebuilding a stale
 * range from text).
 */
export function serializeRangePaths(range: Range): SerializedRange | null {
  try {
    const startElement =
      range.startContainer.nodeType === Node.TEXT_NODE
        ? range.startContainer.parentNode!
        : range.startContainer
    const endElement =
      range.endContainer.nodeType === Node.TEXT_NODE
        ? range.endContainer.parentNode!
        : range.endContainer

    const startChar = charOffsetWithinElement(
      startElement,
      range.startContainer,
      range.startOffset,
    )
    const endChar = charOffsetWithinElement(
      endElement,
      range.endContainer,
      range.endOffset,
    )

    return {
      start: {
        path: buildPath(startElement),
        charOffset: startChar,
      },
      end: {
        path: buildPath(endElement),
        charOffset: endChar,
      },
    }
  } catch (error) {
    return null
  }
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
  const iterator = document.createNodeIterator(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (isNodeFromMyz(node)) return NodeFilter.FILTER_REJECT
      return NodeFilter.FILTER_ACCEPT
    },
  })
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
  return {
    haystack: normalizedChars.join(""),
    rawIndexMap,
    positions,
  }
}

function rangeFromNormalizedIndex(
  index: NormalizedTextIndex,
  startIndex: number,
  endIndex: number,
): Range | null {
  const rawStart = index.rawIndexMap[startIndex]
  const rawEnd = index.rawIndexMap[endIndex]
  if (rawStart === undefined || rawEnd === undefined) {
    return null
  }
  const startPosition = index.positions[rawStart]
  const endPosition = index.positions[rawEnd]
  if (!startPosition || !endPosition) {
    return null
  }
  try {
    const range = document.createRange()
    range.setStart(startPosition.node, startPosition.offset)
    range.setEnd(endPosition.node, endPosition.offset + 1)
    return range
  } catch (error) {
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
  if (needle.length < 4) {
    return null
  }
  const index = buildNormalizedTextIndex(root)
  const { haystack } = index

  const exact = haystack.indexOf(needle)
  if (exact !== -1 && countOccurrences(haystack, needle) === 1) {
    return rangeFromNormalizedIndex(index, exact, exact + needle.length - 1)
  }

  const maxLength = Math.min(needle.length, 160)
  const minLength = Math.min(24, needle.length)
  for (let length = maxLength; length >= minLength; length -= 4) {
    const step = Math.max(4, Math.floor(length / 4))
    for (
      let offset = 0;
      offset + length <= needle.length;
      offset += step
    ) {
      const anchor = needle.slice(offset, offset + length)
      const found = haystack.indexOf(anchor)
      if (found === -1) continue
      if (countOccurrences(haystack, anchor) !== 1) continue
      return rangeFromNormalizedIndex(index, found, found + length - 1)
    }
  }
  return null
}

/**
 * Resolve as much of a stored path as still matches the DOM and return the
 * deepest resolved node. Used to narrow a text search to the record's original
 * region when the full path is stale.
 */
export function resolvePartialPath(path: PathSegment[]): Node | null {
  let current: Node = document
  if (Array.isArray(path) && path.length && current.nodeName) {
    const firstName = path[0] && path[0].name
    if (
      typeof firstName === "string" &&
      firstName.toLowerCase() === (current.nodeName || "").toLowerCase()
    ) {
      path = path.slice(1)
    }
  }
  let deepest: Node | null = document.body
  for (const segment of path) {
    const logicalList = getLogicalChildNodes(current)
    const pairs = logicalList.filter((entry) => {
      const logical = entry.logical
      if (segment.name === "#text") return logical.nodeType === Node.TEXT_NODE
      return (
        logical.nodeType === Node.ELEMENT_NODE &&
        logical.nodeName.toLowerCase() === segment.name
      )
    })
    const chosen = pairs[segment.index] || null
    if (!chosen) break
    current = chosen.dom
    deepest = current
  }
  return deepest
}

export interface SerializedRange {
  start?: {
    charOffset: number
    path: PathSegment[]
    offset?: number
  }
  end?: {
    charOffset: number
    path: PathSegment[]
    offset?: number
  }
}

export function deserializeRange(serialized?: SerializedRange) {
  if (!serialized?.start || !serialized?.end) {
    return null
  }
  const range = document.createRange()
  // Prefer the new element+charOffset format. Fall back to the old
  // node+offset format for backward compatibility.
  try {
    // Start
    let startNode = null
    let startOffset = 0
    if (serialized.start && typeof serialized.start.charOffset === "number") {
      const el = resolvePath(serialized.start.path) as Element | null
      if (!el) return null
      const resolved = nodeForCharOffset(el, serialized.start.charOffset)
      if (!resolved) return null
      startNode = resolved.node
      startOffset = resolved.offset
    } else {
      startNode = resolvePath(serialized.start.path)
      if (!startNode) return null
      startOffset = clampOffset(startNode, serialized.start.offset!)
    }

    // End
    let endNode = null
    let endOffset = 0
    if (serialized.end && typeof serialized.end.charOffset === "number") {
      const el = resolvePath(serialized.end.path)
      if (!el) return null
      const resolved = nodeForCharOffset(el, serialized.end.charOffset)
      if (!resolved) return null
      endNode = resolved.node
      endOffset = resolved.offset
    } else {
      endNode = resolvePath(serialized.end.path)
      if (!endNode) return null
      endOffset = clampOffset(endNode, serialized.end.offset!)
    }

    range.setStart(startNode, startOffset)
    range.setEnd(endNode, endOffset)
    return range
  } catch (error) {
    console.error("Failed to reconstruct range", error)
    return null
  }
}
