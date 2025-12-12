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
]);

const ALLOWED_HTML_ATTRS: { [key: string]: Set<string> } = {
  a: new Set<string>(["href", "title"]),
  td: new Set<string>(["colspan", "rowspan"]),
  th: new Set<string>(["colspan", "rowspan"]),
};

export function serializeRangeToHtml(range: Range): string {
  try {
    const fragment = range.cloneContents();
    if (!fragment || !fragment.childNodes.length) {
      return "";
    }
    const container = document.createElement("div");
    container.appendChild(fragment);
    sanitizeNode(container);
    return container.innerHTML.trim();
  } catch (error) {
    console.warn("Failed to serialize selection HTML", error);
    return "";
  }
}

function sanitizeNode(root: Element) {
  Array.from(root.childNodes).forEach((child) => {
    if (child.nodeType === Node.ELEMENT_NODE) {
      sanitizeElement(child as Element);
    } else if (child.nodeType === Node.COMMENT_NODE) {
      root.removeChild(child);
    }
  });
}

function sanitizeElement(element: Element) {
  const tag = element.tagName.toLowerCase();
  if (!ALLOWED_HTML_TAGS.has(tag)) {
    const parent = element.parentNode;
    if (!parent) {
      return;
    }
    const children = Array.from(element.childNodes);
    children.forEach((child) => parent.insertBefore(child, element));
    parent.removeChild(element);
    children.forEach((child) => {
      if (child.nodeType === Node.ELEMENT_NODE) {
        sanitizeElement(child as Element);
      }
    });
    return;
  }

  Array.from(element.attributes).forEach((attr) => {
    if (!isAllowedAttribute(tag, attr.name)) {
      element.removeAttribute(attr.name);
      return;
    }
    if (attr.name === "href") {
      const sanitizedHref = normalizeHref(attr.value);
      if (sanitizedHref) {
        element.setAttribute("href", sanitizedHref);
      } else {
        element.removeAttribute("href");
      }
    }
  });

  if (tag === "a" && element.hasAttribute("href")) {
    element.setAttribute("target", "_blank");
    element.setAttribute("rel", "noopener noreferrer");
  }

  sanitizeNode(element);
}

function isAllowedAttribute(tag: string, name: string): boolean {
  const whitelist = ALLOWED_HTML_ATTRS[tag];
  if (!whitelist) {
    return false;
  }
  return whitelist.has(name);
}

function normalizeHref(value: string): string | null {
  if (!value || typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  try {
    const parsed = new URL(trimmed, window.location.href);
    const protocol = parsed.protocol.toLowerCase();
    if (
      protocol === "http:" ||
      protocol === "https:" ||
      protocol === "mailto:"
    ) {
      return parsed.toString();
    }
    return null;
  } catch (error) {
    return null;
  }
}
