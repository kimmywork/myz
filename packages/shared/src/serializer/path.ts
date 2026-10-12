export interface ChildAndLogical {
  child: Node | null
  logical: Node | null
}

export interface PathSegment {
  name: string
  index: number
}

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
    if (shouldIgnoreForPath(child)) return
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

export function getDirectChildAndLogical(
  node: Node,
  parent: ParentNode,
): ChildAndLogical {
  let child: Node | null = node
  while (child && child.parentNode && child.parentNode !== parent) {
    child = child.parentNode
  }
  if (!child || child.parentNode !== parent)
    return { child: null, logical: null }
  if (shouldIgnoreForPath(child)) return { child: null, logical: null }
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
  const rootDocument = node.ownerDocument ?? document
  let current = node
  while (current && current !== rootDocument) {
    const parent = current.parentNode
    if (!parent) break
    const { logical: directLogical } = getDirectChildAndLogical(
      current,
      parent,
    )
    const logicalChildren = getLogicalChildNodes(parent).map((o) => o.logical)
    const siblings = logicalChildren.filter((childNode) =>
      sameNodeType(childNode, directLogical),
    )
    const index = siblings.indexOf(directLogical!)
    path.unshift({ name: nodeName(directLogical), index })
    current = parent
  }
  return path
}

export function resolvePath(
  path: PathSegment[],
  rootDocument: Document = document,
): Node | null {
  let current: Node = rootDocument
  const segments = stripRootSegment(path, current)
  for (const segment of segments) {
    const chosen = matchingLogicalChildren(current, segment)[segment.index] || null
    if (!chosen) return null
    current = chosen.dom
  }
  return current
}

/**
 * Resolve as much of a stored path as still matches the DOM and return the
 * deepest resolved node. Used to narrow a text search to the record's original
 * region when the full path is stale.
 */
export function resolvePartialPath(
  path: PathSegment[],
  rootDocument: Document = document,
): Node | null {
  let current: Node = rootDocument
  const segments = stripRootSegment(path, current)
  let deepest: Node | null = rootDocument.body ?? rootDocument
  for (const segment of segments) {
    const chosen = matchingLogicalChildren(current, segment)[segment.index] || null
    if (!chosen) break
    current = chosen.dom
    deepest = current
  }
  return deepest
}

/**
 * A stored path may begin with the root document's own node name; drop that
 * segment when it matches so the rest can be walked relative to the root.
 */
function stripRootSegment(path: PathSegment[], root: Node): PathSegment[] {
  if (!Array.isArray(path) || !path.length || !root || !root.nodeName) {
    return path
  }
  const firstName = path[0] && path[0].name
  if (
    typeof firstName === "string" &&
    firstName.toLowerCase() === (root.nodeName || "").toLowerCase()
  ) {
    return path.slice(1)
  }
  return path
}

/** Logical children of `current` that match a path segment's node name. */
function matchingLogicalChildren(
  current: Node,
  segment: PathSegment,
): { dom: Node; logical: Node }[] {
  return getLogicalChildNodes(current).filter((entry) => {
    const logical = entry.logical
    if (segment.name === "#text") return logical.nodeType === Node.TEXT_NODE
    return (
      logical.nodeType === Node.ELEMENT_NODE &&
      logical.nodeName.toLowerCase() === segment.name
    )
  })
}

function shouldIgnoreForPath(node?: Node): boolean {
  if (!node) return false
  return isArchiveInjectedNode(node)
}

function isArchiveInjectedNode(node: Node): boolean {
  const hostname = window.location.hostname || ""
  if (hostname !== "web.archive.org") return false

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

  if (node.nodeType !== Node.ELEMENT_NODE) return false
  const el = node as Element

  const id = (el.getAttribute && el.getAttribute("id")) || ""
  if (id.startsWith("wm-")) return true

  const dataOwner = el.getAttribute && el.getAttribute("data-owner")
  if (dataOwner && dataOwner.toLowerCase() === "wayback-machine") return true

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
    if (ref.includes("/_static/") || ref.includes("wayback")) return true
  }

  if (tagName === "div") {
    const role = el.getAttribute("role") || ""
    if (role === "navigation" && classList.includes("wb-toolbar")) return true
    if (id === "donato" || id === "wm-ipp-base") return true
  }

  return false
}
