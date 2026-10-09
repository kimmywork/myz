import { isHighlightRecord } from "../highlightUtils"
import type { MyZRecord } from "../types.ts"
import { buildPath, resolvePath, type PathSegment } from "./path.ts"
import { charOffsetWithinElement, nodeForCharOffset } from "./text.ts"

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

export function unwrapNode(node: Node) {
  const parent = node.parentNode
  if (!parent) return
  while (node.firstChild) parent.insertBefore(node.firstChild, node)
  parent.removeChild(node)
  parent.normalize()
}

function clampOffset(node: Node, requested: number) {
  if (node.nodeType === Node.TEXT_NODE) {
    return Math.min(requested, (node as Text).textContent.length)
  }
  return Math.min(requested, node.childNodes.length)
}

export function serializeRange(
  range: Range,
  highlightCache: Map<string, MyZRecord>,
  applyHighlight: (rec: MyZRecord) => void = () => {},
): SerializedRange | null {
  try {
    // If the page already contains MyZ wrapper nodes, temporarily unwrap them
    // so we compute paths against the original DOM. Afterwards we reapply
    // existing highlights from cache. This avoids path indexing shifts caused
    // by wrapper elements.
    const ownerDocument = range.startContainer.ownerDocument ?? document
    const existing = Array.from(
      ownerDocument.querySelectorAll(".myz-highlight"),
    )
    const ids: string[] = existing
      .map((n) => (n as HTMLElement).dataset?.highlightId)
      .filter(Boolean) as string[]

    try {
      existing.forEach((node) => unwrapNode(node))
      // Store a path to the nearest element ancestor plus a character offset
      // within that element, which is resilient to text-node merging/splitting.
      return serializeRangePaths(range)
    } finally {
      // Reapply highlights from cache; ignore failures.
      ids.forEach((id) => {
        try {
          const rec = highlightCache.get(id)
          if (rec && isHighlightRecord(rec)) applyHighlight(rec)
        } catch {
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
    return {
      start: {
        path: buildPath(startElement),
        charOffset: charOffsetWithinElement(
          startElement,
          range.startContainer,
          range.startOffset,
        ),
      },
      end: {
        path: buildPath(endElement),
        charOffset: charOffsetWithinElement(
          endElement,
          range.endContainer,
          range.endOffset,
        ),
      },
    }
  } catch {
    return null
  }
}

export function deserializeRange(
  serialized?: SerializedRange,
  rootDocument: Document = document,
) {
  if (!serialized?.start || !serialized?.end) return null
  const range = rootDocument.createRange()
  // Prefer the new element+charOffset format. Fall back to the old node+offset
  // format for backward compatibility.
  try {
    let startNode = null
    let startOffset = 0
    if (typeof serialized.start.charOffset === "number") {
      const el = resolvePath(
        serialized.start.path,
        rootDocument,
      ) as Element | null
      if (!el) return null
      const resolved = nodeForCharOffset(el, serialized.start.charOffset)
      if (!resolved) return null
      startNode = resolved.node
      startOffset = resolved.offset
    } else {
      startNode = resolvePath(serialized.start.path, rootDocument)
      if (!startNode) return null
      startOffset = clampOffset(startNode, serialized.start.offset!)
    }

    let endNode = null
    let endOffset = 0
    if (typeof serialized.end.charOffset === "number") {
      const el = resolvePath(serialized.end.path, rootDocument)
      if (!el) return null
      const resolved = nodeForCharOffset(el, serialized.end.charOffset)
      if (!resolved) return null
      endNode = resolved.node
      endOffset = resolved.offset
    } else {
      endNode = resolvePath(serialized.end.path, rootDocument)
      if (!endNode) return null
      endOffset = clampOffset(endNode, serialized.end.offset!)
    }

    range.setStart(startNode, startOffset)
    range.setEnd(endNode, endOffset)
    return range
  } catch {
    return null
  }
}
