/**
 * DOM-based HTML sanitizer shared by the content script (live captures) and
 * the dashboard (imported records). Removes scripts/event handlers and
 * disallowed tags/attributes so sanitized markup is safe to feed to
 * `innerHTML`.
 */

const ALLOWED_HTML_TAGS = new Set([
  "a",
  "b",
  "strong",
  "em",
  "i",
  "u",
  "s",
  "code",
  "pre",
  "blockquote",
  "mark",
  "span",
  "sup",
  "sub",
  "p",
  "div",
  "ul",
  "ol",
  "li",
  "br",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "table",
  "thead",
  "tbody",
  "tr",
  "td",
  "th",
])

const ALLOWED_HTML_ATTRS: { [key: string]: Set<string> } = {
  a: new Set<string>(["href", "title"]),
  td: new Set<string>(["colspan", "rowspan"]),
  th: new Set<string>(["colspan", "rowspan"]),
}

function isAllowedAttribute(tag: string, name: string): boolean {
  const whitelist = ALLOWED_HTML_ATTRS[tag]
  return whitelist ? whitelist.has(name) : false
}

function normalizeHref(value: string): string | null {
  if (!value || typeof value !== "string") return null
  const trimmed = value.trim()
  if (!trimmed) return null
  const base =
    typeof window !== "undefined" ? window.location.href : "https://localhost/"
  try {
    const parsed = new URL(trimmed, base)
    const protocol = parsed.protocol.toLowerCase()
    if (
      protocol === "http:" ||
      protocol === "https:" ||
      protocol === "mailto:"
    ) {
      return parsed.toString()
    }
    return null
  } catch {
    return null
  }
}

/** Recursively sanitize the children of a DOM node in place. */
export function sanitizeNode(root: Element) {
  Array.from(root.childNodes).forEach((child) => {
    if (child.nodeType === Node.ELEMENT_NODE) {
      sanitizeElement(child as Element)
    } else if (child.nodeType === Node.COMMENT_NODE) {
      root.removeChild(child)
    }
  })
}

function sanitizeElement(element: Element) {
  const tag = element.tagName.toLowerCase()
  if (!ALLOWED_HTML_TAGS.has(tag)) {
    const parent = element.parentNode
    if (!parent) return
    const children = Array.from(element.childNodes)
    children.forEach((child) => parent.insertBefore(child, element))
    parent.removeChild(element)
    children.forEach((child) => {
      if (child.nodeType === Node.ELEMENT_NODE) {
        sanitizeElement(child as Element)
      }
    })
    return
  }

  Array.from(element.attributes).forEach((attr) => {
    if (!isAllowedAttribute(tag, attr.name)) {
      element.removeAttribute(attr.name)
      return
    }
    if (attr.name === "href") {
      const sanitizedHref = normalizeHref(attr.value)
      if (sanitizedHref) element.setAttribute("href", sanitizedHref)
      else element.removeAttribute("href")
    }
  })

  if (tag === "a" && element.hasAttribute("href")) {
    element.setAttribute("target", "_blank")
    element.setAttribute("rel", "noopener noreferrer")
  }

  sanitizeNode(element)
}

/**
 * Sanitize an HTML string, returning safe markup. Uses a detached container so
 * it works in any document context.
 */
export function sanitizeHtmlString(html: string): string {
  if (!html || typeof document === "undefined") {
    return html || ""
  }
  const container = document.createElement("div")
  container.innerHTML = html
  sanitizeNode(container)
  return container.innerHTML
}
