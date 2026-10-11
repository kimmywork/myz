export function collectTextNodes(root: HTMLElement): {
  nodes: Text[];
  text: string;
} {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  let text = "";
  let node = walker.nextNode();
  while (node) {
    const textNode = node as Text;
    nodes.push(textNode);
    text += textNode.data;
    node = walker.nextNode();
  }
  return { nodes, text };
}

export function offsetOf(
  nodes: Text[],
  container: Node,
  offset: number,
): number {
  let acc = 0;
  for (const node of nodes) {
    if (node === container) return acc + offset;
    acc += node.data.length;
  }
  return acc;
}

export function nodeAtOffset(
  nodes: Text[],
  offset: number,
): { node: Text; offset: number } | null {
  let acc = 0;
  for (const node of nodes) {
    const length = node.data.length;
    if (offset <= acc + length) return { node, offset: offset - acc };
    acc += length;
  }
  return null;
}

export function closestPage(node: Node | null): HTMLElement | null {
  if (!node) return null;
  const element =
    node.nodeType === Node.ELEMENT_NODE
      ? (node as Element)
      : (node.parentElement ?? null);
  return element ? (element.closest(".pdf-page") as HTMLElement | null) : null;
}

export function countOccurrences(haystack: string, needle: string): number {
  if (!needle) return 0;
  let count = 0;
  let index = haystack.indexOf(needle);
  while (index >= 0) {
    count += 1;
    index = haystack.indexOf(needle, index + needle.length);
  }
  return count;
}

export function locateTextRange(
  pageEl: HTMLElement,
  text: string,
  occurrenceIndex: number,
): Range | null {
  const layer = pageEl.querySelector<HTMLElement>(".textLayer");
  if (!layer || !text) return null;
  const { nodes, text: full } = collectTextNodes(layer);
  let index = -1;
  let from = 0;
  for (let i = 0; i <= occurrenceIndex; i += 1) {
    index = full.indexOf(text, from);
    if (index < 0) return null;
    from = index + text.length;
  }
  const start = nodeAtOffset(nodes, index);
  const end = nodeAtOffset(nodes, index + text.length);
  if (!start || !end) return null;
  const range = document.createRange();
  range.setStart(start.node, start.offset);
  range.setEnd(end.node, end.offset);
  return range;
}
