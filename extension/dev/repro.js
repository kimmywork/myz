const { JSDOM } = require("jsdom");

// We'll dynamically import the ESM serializer from src/shared so the repro
// uses the same implementation as the content script. Bindings are
// initialized at runtime inside the test runner `run()`.
let isMyzWrapper,
  isNodeFromMyz,
  findPrimaryDescendant,
  getLogicalChildNodes,
  getDirectChildAndLogical,
  nodeName,
  sameNodeType,
  buildPath,
  resolvePath,
  getDescendantTextNodes,
  charOffsetWithinElement,
  nodeForCharOffset,
  getTextLength;

// The HTML snippet (a single paragraph) copied from your report.
const html = `
<p>The AWK language is a data-driven scripting language consisting of a set of actions to be taken against streams of textual data – either run directly on files or used as part of a pipeline – for purposes of extracting or transforming text, such as producing formatted reports. The language extensively uses the string datatype, associative arrays (that is, arrays indexed by key strings), and regular expressions. While AWK has a limited intended application domain and was especially designed to support one-liner programs, the language is Turing-complete, and even the early Bell Labs users of AWK often wrote well-structured large AWK programs.</p>
`;

// A simple highlight cache to mimic extension behavior
const cache = new Map();

function makeRange(doc, startNode, startOffset, endNode, endOffset) {
  const range = doc.createRange();
  range.setStart(startNode, startOffset);
  range.setEnd(endNode, endOffset);
  return range;
}

function createHighlightElement(doc, id) {
  const span = doc.createElement("span");
  span.className = "myz-highlight";
  span.dataset.highlightId = id;
  return span;
}

function collectTextNodes(range) {
  const nodes = [];
  const NF = range.commonAncestorContainer.ownerDocument.defaultView.NodeFilter;
  const walker = range.commonAncestorContainer.ownerDocument.createNodeIterator(
    range.commonAncestorContainer,
    NF.SHOW_TEXT,
    {
      acceptNode(node) {
        if (isNodeFromMyz(node)) return NF.FILTER_REJECT;
        if (!range.intersectsNode(node)) return NF.FILTER_REJECT;
        if (!node.textContent || !node.textContent.trim())
          return NF.FILTER_REJECT;
        return NF.FILTER_ACCEPT;
      },
    },
  );
  let n;
  while ((n = walker.nextNode())) nodes.push(n);
  return nodes;
}

function computeSegmentOffsets(node, range) {
  const length = node.textContent.length;
  let start = 0,
    end = length;
  if (node === range.startContainer) start = range.startOffset;
  if (node === range.endContainer) end = range.endOffset;
  const startPosition = range.startContainer.compareDocumentPosition(node);
  const NodeConst = range.startContainer.ownerDocument.defaultView.Node;
  if (startPosition & NodeConst.DOCUMENT_POSITION_FOLLOWING) start = 0;
  const endPosition = range.endContainer.compareDocumentPosition(node);
  if (endPosition & NodeConst.DOCUMENT_POSITION_PRECEDING) end = length;
  start = Math.max(0, Math.min(start, length));
  end = Math.max(start, Math.min(end, length));
  return { start, end };
}

function wrapTextNodeSegment(doc, node, range, id) {
  const offsets = computeSegmentOffsets(node, range);
  if (!offsets || offsets.end <= offsets.start) return false;
  let target = node;
  const length = node.textContent.length;
  if (offsets.end < length) target.splitText(offsets.end);
  if (offsets.start > 0) target = target.splitText(offsets.start);
  if (!target || !target.textContent.trim()) return false;
  const parent = target.parentNode;
  if (!parent) return false;
  const highlight = createHighlightElement(doc, id);
  parent.insertBefore(highlight, target);
  highlight.appendChild(target);
  return true;
}

function wrapRangeAcrossNodes(doc, range, id) {
  const textNodes = collectTextNodes(range);
  if (!textNodes.length) return false;
  let applied = false;
  textNodes.forEach((node) => {
    const did = wrapTextNodeSegment(doc, node, range, id);
    applied = applied || did;
  });
  return applied;
}

function wrapSimpleRange(doc, range, id) {
  const frag = range.cloneContents();
  if (!frag || !frag.childNodes.length) return false;
  const highlight = createHighlightElement(doc, id);
  highlight.appendChild(frag);
  range.deleteContents();
  range.insertNode(highlight);
  return true;
}

function unwrapAll(doc) {
  const nodes = Array.from(doc.querySelectorAll(".myz-highlight"));
  nodes.forEach((n) => {
    const parent = n.parentNode;
    while (n.firstChild) parent.insertBefore(n.firstChild, n);
    parent.removeChild(n);
  });
  doc.normalize();
}

function serializeRange(doc, range) {
  // unwrap wrappers temporarily
  const existing = Array.from(doc.querySelectorAll(".myz-highlight"));
  const ids = existing.map((n) => n.dataset.highlightId).filter(Boolean);
  try {
    existing.forEach((n) => {
      const parent = n.parentNode;
      while (n.firstChild) parent.insertBefore(n.firstChild, n);
      parent.removeChild(n);
    });

    const startElement =
      range.startContainer.nodeType === doc.TEXT_NODE
        ? range.startContainer.parentNode
        : range.startContainer;
    const endElement =
      range.endContainer.nodeType === doc.TEXT_NODE
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
      start: { path: buildPath(startElement), charOffset: startChar },
      end: { path: buildPath(endElement), charOffset: endChar },
    };
  } finally {
    // Reapply wrappers for ids from global cache so the visible DOM is
    // restored (mimic extension behavior where wrappers are temporarily
    // removed while computing canonical paths).
    try {
      ids.forEach((id) => {
        const rec = cache.get(id);
        if (rec && rec.id) {
          // apply without re-serializing
          try {
            // Use deserialize/apply flow to preserve logic
            const r = deserializeRange(doc, rec.range);
            if (r) {
              wrapRangeAcrossNodes(doc, r, rec.id) || wrapSimpleRange(doc, r, rec.id);
            }
          } catch (e) {
            // swallow
          }
        }
      });
    } catch (e) {
      // ignore if cache isn't available in this context
    }
  }
}

function deserializeRange(doc, serialized) {
  if (!serialized || !serialized.start || !serialized.end) return null;
  const range = doc.createRange();
  // Prefer charOffset format
  if (
    typeof serialized.start.charOffset === "number" &&
    typeof serialized.end.charOffset === "number"
  ) {
    const startEl = resolvePath(doc, serialized.start.path);
    const endEl = resolvePath(doc, serialized.end.path);
    if (!startEl || !endEl) return null;
    const s = nodeForCharOffset(startEl, serialized.start.charOffset);
    const e = nodeForCharOffset(endEl, serialized.end.charOffset);
    if (!s || !e) return null;
    range.setStart(s.node, s.offset);
    range.setEnd(e.node, e.offset);
    return range;
  }
  // Fallback to old format
  const startNode = resolvePath(doc, serialized.start.path);
  const endNode = resolvePath(doc, serialized.end.path);
  if (!startNode || !endNode) return null;
  const startOffset = Math.min(
    serialized.start.offset,
    startNode.nodeType === doc.TEXT_NODE
      ? startNode.textContent.length
      : startNode.childNodes.length,
  );
  const endOffset = Math.min(
    serialized.end.offset,
    endNode.nodeType === doc.TEXT_NODE
      ? endNode.textContent.length
      : endNode.childNodes.length,
  );
  range.setStart(startNode, startOffset);
  range.setEnd(endNode, endOffset);
  return range;
}

function textIndexOf(root, needle, from = 0) {
  // naive: flatten textContent of root and map to text nodes
  let acc = 0;
  const nodes = [];
  const NF = root.ownerDocument.defaultView.NodeFilter;
  const walker = root.ownerDocument.createTreeWalker(root, NF.SHOW_TEXT, null);
  let n;
  while ((n = walker.nextNode())) {
    nodes.push(n);
  }
  const full = nodes.map((n) => n.textContent).join("");
  const idx = full.indexOf(needle, from);
  if (idx === -1) return null;
  // find which node contains idx
  let cursor = 0;
  for (const node of nodes) {
    const len = node.textContent.length;
    if (cursor + len > idx) {
      return { node, offset: idx - cursor };
    }
    cursor += len;
  }
  return null;
}

// Char-offset helpers are provided by ./lib/serializer and imported above.

function dumpLogicalChildren(parent, label) {
  const list = getLogicalChildNodes(parent).map((entry, i) => {
    const logical = entry.logical;
    const summary =
      logical.nodeType ===
      (logical.ownerDocument || logical).defaultView.Node.TEXT_NODE
        ? `#text(${logical.textContent.slice(0, 30).replace(/\n/g, " ")})`
        : logical.nodeName.toLowerCase();
    return { i, name: summary };
  });
  console.log(`${label} logical children:`, JSON.stringify(list, null, 2));
}

(async function run() {
  const dom = new JSDOM(html);
  const doc = dom.window.document;
  // Load the shared ESM serializer so the repro uses the exact same logic
  // as the content script. The import is dynamic because this file runs
  // under CommonJS (node) while the serializer is ESM.
  const mod = await import('../src/shared/serializer.js');
  ({
    isMyzWrapper,
    isNodeFromMyz,
    findPrimaryDescendant,
    getLogicalChildNodes,
    getDirectChildAndLogical,
    nodeName,
    sameNodeType,
    buildPath,
    resolvePath,
    getDescendantTextNodes,
    charOffsetWithinElement,
    nodeForCharOffset,
    getTextLength,
  } = mod);
  const p = doc.querySelector("p");

  dumpLogicalChildren(p, "initial");

  // We'll create three selections according to your desired lines:
  // 1) "The AWK language is a "
  // 2) "data-driven scripting language"
  // 3) "of textual data – either run directly on files or used as part of a"
  // 4) "The language extensively uses the string datatype, associative arrays (that is, arrays indexed by key strings), and"
  // But your message mentions three snippets; we'll pick three reasonable snippets from the paragraph.

  const snippets = [
    "The AWK language is a data-driven scripting language",
    "of textual data – either run directly on files or used as part of a",
    "The language extensively uses the string datatype, associative arrays (that is, arrays indexed by key strings), and",
  ];

  let seq = 1;

  function makeId() {
    return `myz_test_${seq++}`;
  }

  function applyHighlightFromRecord(record) {
    const range = deserializeRange(doc, record.range);
    if (!range || range.collapsed) return false;
    // remove existing nodes with same id
    Array.from(
      doc.querySelectorAll(`[data-highlight-id="${record.id}"]`),
    ).forEach((n) => {
      const parent = n.parentNode;
      while (n.firstChild) parent.insertBefore(n.firstChild, n);
      parent.removeChild(n);
    });
    // try node-based wrapping first
    const ok = wrapRangeAcrossNodes(doc, range, record.id);
    if (!ok) wrapSimpleRange(doc, range, record.id);
    return true;
  }

  // Step 1: create A
  const aId = makeId();
  const aPos = textIndexOf(p, snippets[0]);
  if (!aPos) {
    console.error("A snippet not found");
    return;
  }
  const aRange = makeRange(
    doc,
    aPos.node,
    aPos.offset,
    aPos.node,
    aPos.offset + snippets[0].length,
  );
  // serialize (no existing wrappers)
  const aSerialized = serializeRange(doc, aRange);
  console.log("A serialized:", JSON.stringify(aSerialized, null, 2));
  cache.set(aId, { id: aId, range: aSerialized });
  applyHighlightFromRecord(cache.get(aId));
  console.log("After A apply:");
  console.log(p.outerHTML);
  dumpLogicalChildren(p, "after A apply");

  // Step 2: create B (while A exists). serializeRange should unwrap A temporarily
  const bId = makeId();
  const bPos = textIndexOf(p, snippets[1]);
  if (!bPos) {
    console.error("B snippet not found");
    return;
  }
  const bRange = makeRange(
    doc,
    bPos.node,
    bPos.offset,
    bPos.node,
    bPos.offset + snippets[1].length,
  );
  const bSerialized = serializeRange(doc, bRange);
  console.log("B serialized:", JSON.stringify(bSerialized, null, 2));
  cache.set(bId, { id: bId, range: bSerialized });
  applyHighlightFromRecord(cache.get(bId));
  console.log("After B apply:");
  console.log(p.outerHTML);
  dumpLogicalChildren(p, "after B apply");

  // Step 3: create C
  const cId = makeId();
  const cPos = textIndexOf(p, snippets[2]);
  if (!cPos) {
    console.error("C snippet not found");
    return;
  }
  const cRange = makeRange(
    doc,
    cPos.node,
    cPos.offset,
    cPos.node,
    cPos.offset + snippets[2].length,
  );
  const cSerialized = serializeRange(doc, cRange);
  console.log("C serialized:", JSON.stringify(cSerialized, null, 2));
  cache.set(cId, { id: cId, range: cSerialized });
  applyHighlightFromRecord(cache.get(cId));
  console.log("After C apply:");
  console.log(p.outerHTML);
  dumpLogicalChildren(p, "after C apply");

  // Now simulate deleting A (removeHighlightFromDom)
  Array.from(doc.querySelectorAll(`[data-highlight-id="${aId}"]`)).forEach(
    (n) => {
      const parent = n.parentNode;
      while (n.firstChild) parent.insertBefore(n.firstChild, n);
      parent.removeChild(n);
    },
  );
  doc.normalize();
  console.log("After A delete:");
  console.log(p.outerHTML);
  dumpLogicalChildren(p, "after A delete");

  // Now attempt to reapply B and C from cache (as restoration step)
  // First remove any existing wrappers for B/C, then reapply
  Array.from(doc.querySelectorAll(".myz-highlight")).forEach((n) => {
    const parent = n.parentNode;
    while (n.firstChild) parent.insertBefore(n.firstChild, n);
    parent.removeChild(n);
  });
  doc.normalize();
  console.log("Cleaned wrappers before reapply:");
  console.log(p.outerHTML);
  dumpLogicalChildren(p, "cleaned before reapply");

  // Reapply B
  const bRec = cache.get(bId);
  console.log(
    "Deserializing B before reapply:",
    JSON.stringify(bRec.range, null, 2),
  );
  const bRangeR = deserializeRange(doc, bRec.range);
  console.log(
    "B range resolved:",
    !!bRangeR,
    bRangeR
      ? `${bRangeR.startContainer.nodeName}(${bRangeR.startOffset}) - ${bRangeR.endContainer.nodeName}(${bRangeR.endOffset})`
      : "null",
  );
  applyHighlightFromRecord(bRec);
  console.log("After reapplying B:");
  console.log(p.outerHTML);
  // Reapply C
  const cRec = cache.get(cId);
  console.log(
    "Deserializing C before reapply:",
    JSON.stringify(cRec.range, null, 2),
  );
  const cRangeR = deserializeRange(doc, cRec.range);
  console.log(
    "C range resolved:",
    !!cRangeR,
    cRangeR
      ? `${cRangeR.startContainer.nodeName}(${cRangeR.startOffset}) - ${cRangeR.endContainer.nodeName}(${cRangeR.endOffset})`
      : "null",
  );
  applyHighlightFromRecord(cRec);
  console.log("After reapplying C:");
  console.log(p.outerHTML);
})();
