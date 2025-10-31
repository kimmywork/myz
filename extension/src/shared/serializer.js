import { isHighlightRecord } from "./highlightUtils.js";

export function isMyzWrapper(node) {
  return (
    node &&
    node.nodeType === node.ELEMENT_NODE &&
    node.classList &&
    node.classList.contains("myz-highlight")
  );
}

export function isNodeFromMyz(node) {
  if (!node) return false;
  if (node.nodeType === node.ELEMENT_NODE) {
    const el = node;
    if (el.classList && el.classList.contains("myz-highlight")) return true;
    if (el.closest && el.closest("[data-myz-host]")) return true;
    return false;
  }
  if (node.parentElement && node.parentElement.closest) {
    return !!node.parentElement.closest("[data-myz-host]");
  }
  return false;
}

export function findPrimaryDescendant(el) {
  if (!el) return null;
  const queue = Array.from(el.childNodes || []);
  while (queue.length) {
    const n = queue.shift();
    if (!isNodeFromMyz(n) && !isMyzWrapper(n)) return n;
    if (n.childNodes && n.childNodes.length)
      queue.push(...Array.from(n.childNodes));
  }
  return null;
}

export function getLogicalChildNodes(parent) {
  const out = [];
  Array.from(parent.childNodes).forEach((child) => {
    if (!isMyzWrapper(child) && isNodeFromMyz(child)) return;
    if (isMyzWrapper(child)) {
      Array.from(child.childNodes).forEach((inner) => {
        if (isNodeFromMyz(inner)) return;
        out.push({ dom: inner, logical: inner });
      });
    } else {
      out.push({ dom: child, logical: child });
    }
  });
  return out;
}

export function getDirectChildAndLogical(node, parent) {
  let child = node;
  while (child && child.parentNode && child.parentNode !== parent) {
    child = child.parentNode;
  }
  if (!child || child.parentNode !== parent)
    return { child: null, logical: null };
  if (isMyzWrapper(child)) {
    if (child !== node) return { child, logical: node };
    return { child, logical: findPrimaryDescendant(child) || child };
  }
  return { child, logical: child };
}

export function nodeName(node) {
  return node && node.nodeType === node.TEXT_NODE
    ? "#text"
    : node && node.nodeName
      ? node.nodeName.toLowerCase()
      : "";
}

export function sameNodeType(a, b) {
  if (!a || !b) return false;
  if (a.nodeType !== b.nodeType) return false;
  if (a.nodeType === a.ownerDocument.defaultView.Node.TEXT_NODE) return true;
  return a.nodeName === b.nodeName;
}

export function buildPath(node) {
  const path = [];
  let current = node;
  while (current && current !== current.ownerDocument) {
    const parent = current.parentNode;
    if (!parent) break;
    const { child: directChild, logical: directLogical } =
      getDirectChildAndLogical(current, parent);
    const logicalChildren = getLogicalChildNodes(parent).map((o) => o.logical);
    const siblings = logicalChildren.filter((childNode) =>
      sameNodeType(childNode, directLogical),
    );
    const index = siblings.indexOf(directLogical);
    const seg = { name: nodeName(directLogical), index };
    path.unshift(seg);
    current = parent;
  }
  return path;
}

export function resolvePath(root, path) {
  // Normalize root to an element to start iteration
  let current = root;
  if (current && current.nodeType === current.DOCUMENT_NODE) {
    current = current.documentElement || current;
    // If the path begins with the documentElement (html) and we already
    // started iteration at documentElement, drop that leading segment so the
    // remaining path resolves correctly to children under <html>.
    if (Array.isArray(path) && path.length && current && current.nodeName) {
      const firstName = path[0] && path[0].name;
      if (
        typeof firstName === "string" &&
        firstName.toLowerCase() === (current.nodeName || "").toLowerCase()
      ) {
        path = path.slice(1);
      }
    }
  } else if (current && current.ownerDocument) {
    const viewNode = current.ownerDocument.defaultView?.Node ?? globalThis.Node;
    const TEXT_NODE = viewNode?.TEXT_NODE ?? 3;
    if (current.nodeType === TEXT_NODE) {
      current = current.parentNode || current;
    }
  }
  for (const segment of path) {
    const logicalList = getLogicalChildNodes(current);
    const NodeConst = (current.ownerDocument || current).defaultView.Node;
    const pairs = logicalList.filter((entry) => {
      const logical = entry.logical;
      if (segment.name === "#text")
        return logical.nodeType === NodeConst.TEXT_NODE;
      return (
        logical.nodeType === NodeConst.ELEMENT_NODE &&
        logical.nodeName.toLowerCase() === segment.name
      );
    });
    const chosenPair = pairs[segment.index] || null;
    if (!chosenPair) return null;
    current = chosenPair.dom;
  }
  return current;
}

export function getDescendantTextNodes(el) {
  const out = [];
  const NF = el.ownerDocument.defaultView.NodeFilter;
  const it = el.ownerDocument.createNodeIterator(el, NF.SHOW_TEXT, {
    acceptNode(node) {
      if (isNodeFromMyz(node)) return NF.FILTER_REJECT;
      if (!node.textContent) return NF.FILTER_REJECT;
      return NF.FILTER_ACCEPT;
    },
  });
  let cur;
  while ((cur = it.nextNode())) out.push(cur);
  return out;
}

export function getTextLength(node) {
  if (!node) return 0;
  if (node.nodeType === node.TEXT_NODE) return node.textContent.length;
  let sum = 0;
  node.childNodes.forEach((c) => {
    if (isNodeFromMyz(c)) return;
    sum += getTextLength(c);
  });
  return sum;
}

export function charOffsetWithinElement(element, container, offset) {
  if (!element) return 0;
  const texts = getDescendantTextNodes(element);
  const NodeConst = element.ownerDocument.defaultView.Node;
  if (container.nodeType === NodeConst.TEXT_NODE) {
    let acc = 0;
    for (const tn of texts) {
      if (tn === container)
        return acc + Math.min(offset, tn.textContent.length);
      acc += tn.textContent.length;
    }
    return acc;
  }
  let sum = 0;
  const children = Array.from(container.childNodes || []);
  for (let i = 0; i < offset && i < children.length; i += 1) {
    const ch = children[i];
    if (isNodeFromMyz(ch)) continue;
    sum += getTextLength(ch);
  }
  return sum;
}

export function nodeForCharOffset(element, charOffset) {
  const texts = getDescendantTextNodes(element);
  let acc = 0;
  for (const tn of texts) {
    const len = tn.textContent.length;
    if (charOffset <= acc + len) {
      return { node: tn, offset: Math.max(0, charOffset - acc) };
    }
    acc += len;
  }
  if (texts.length) {
    const last = texts[texts.length - 1];
    return { node: last, offset: last.textContent.length };
  }
  return null;
}

export function unwrapNode(node) {
  const parent = node.parentNode;
  if (!parent) {
    return;
  }
  while (node.firstChild) {
    parent.insertBefore(node.firstChild, node);
  }
  parent.removeChild(node);
  parent.normalize();
}

function clampOffset(node, requested) {
  if (node.nodeType === Node.TEXT_NODE) {
    return Math.min(requested, node.textContent.length);
  }
  return Math.min(requested, node.childNodes.length);
}

export function serializeRange(
  doc,
  range,
  highlightCache,
  applyHighlight = () => {},
) {
  try {
    // If the page already contains MyZ wrapper nodes, temporarily unwrap
    // them so we compute paths against the original DOM. Afterwards we
    // reapply existing highlights from cache. This avoids path indexing
    // shifts caused by wrapper elements.
    const existing = Array.from(doc.querySelectorAll(".myz-highlight"));
    const ids = existing.map((n) => n.dataset?.highlightId).filter(Boolean);

    try {
      existing.forEach((node) => unwrapNode(node));
    // More robust serialization: store a path to the nearest element
    // ancestor plus a character offset within that element. This is
    // resilient to text-node merging/splitting when wrappers are
    // removed and prevents indices from becoming invalid.
    const startElement =
      range.startContainer.nodeType === doc.defaultView.Node.TEXT_NODE
        ? range.startContainer.parentNode
        : range.startContainer;
    const endElement =
      range.endContainer.nodeType === doc.defaultView.Node.TEXT_NODE
        ? range.endContainer.parentNode
        : range.endContainer;

    const startChar = charOffsetWithinElement(
      startElement,
      range.startContainer,
      range.startOffset,
    );
    const endChar = charOffsetWithinElement(
      endElement,
      range.endContainer,
      range.endOffset,
    );

      return {
        start: {
          path: buildPath(startElement),
          charOffset: startChar,
        },
        end: {
          path: buildPath(endElement),
          charOffset: endChar,
        },
      };
    } finally {
      // Reapply highlights from cache; ignore failures.
      ids.forEach((id) => {
        try {
          const rec = highlightCache.get(id);
          if (rec && isHighlightRecord(rec)) {
            applyHighlight(rec);
          }
        } catch (e) {
          // swallow
        }
      });
    }
  } catch (error) {
    console.error("Failed to serialize range", error);
    return null;
  }
}

export function deserializeRange(doc, serialized) {
  if (!serialized?.start || !serialized?.end) {
    return null;
  }
  const range = doc.createRange();
  // Prefer the new element+charOffset format. Fall back to the old
  // node+offset format for backward compatibility.
  try {
    // Start
    let startNode = null;
    let startOffset = 0;
    if (serialized.start && typeof serialized.start.charOffset === "number") {
      const el = resolvePath(doc, serialized.start.path);
      if (!el) return null;
      const resolved = nodeForCharOffset(el, serialized.start.charOffset);
      if (!resolved) return null;
      startNode = resolved.node;
      startOffset = resolved.offset;
    } else {
      startNode = resolvePath(doc, serialized.start.path);
      if (!startNode) return null;
      startOffset = clampOffset(startNode, serialized.start.offset);
    }

    // End
    let endNode = null;
    let endOffset = 0;
    if (serialized.end && typeof serialized.end.charOffset === "number") {
      const el = resolvePath(doc, serialized.end.path);
      if (!el) return null;
      const resolved = nodeForCharOffset(el, serialized.end.charOffset);
      if (!resolved) return null;
      endNode = resolved.node;
      endOffset = resolved.offset;
    } else {
      endNode = resolvePath(doc, serialized.end.path);
      if (!endNode) return null;
      endOffset = clampOffset(endNode, serialized.end.offset);
    }

    range.setStart(startNode, startOffset);
    range.setEnd(endNode, endOffset);
    return range;
  } catch (error) {
    console.error("Failed to reconstruct range", error);
    return null;
  }
}
