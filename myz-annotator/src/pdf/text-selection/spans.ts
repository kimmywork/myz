import {
  groupIntoLines,
  unionRect,
  type MeasuredRect,
  type TextRect,
} from "../text-blocks.js";

export interface SpanItem {
  el: HTMLElement;
  node: Text;
  rect: TextRect;
}

export interface TextPosition {
  node: Text;
  offset: number;
}

function rectOf(el: HTMLElement): TextRect {
  const rect = el.getBoundingClientRect();
  return {
    top: rect.top,
    bottom: rect.bottom,
    left: rect.left,
    right: rect.right,
  };
}

export function collectSpans(pageEl: HTMLElement): SpanItem[] {
  const spans = Array.from(
    pageEl.querySelectorAll<HTMLElement>(".textLayer span"),
  );
  const items: SpanItem[] = [];
  for (const el of spans) {
    const node = el.firstChild;
    if (!(node instanceof Text) || !node.data.length) continue;
    const rect = rectOf(el);
    if (rect.bottom - rect.top <= 0 || rect.right - rect.left <= 0) continue;
    items.push({ el, node, rect });
  }
  return items;
}

export function linesOf(pageEl: HTMLElement): SpanItem[][] {
  return groupIntoLines(collectSpans(pageEl));
}

export function lineRect(line: SpanItem[]): MeasuredRect {
  return unionRect(line.map((item) => item.rect));
}

function firstNonEmpty(line: SpanItem[]): SpanItem {
  return line.find((item) => item.node.data.trim().length > 0) ?? line[0];
}

function lastNonEmpty(line: SpanItem[]): SpanItem {
  for (let index = line.length - 1; index >= 0; index -= 1) {
    if (line[index].node.data.trim().length > 0) return line[index];
  }
  return line[line.length - 1];
}

export function startOfLine(line: SpanItem[]): TextPosition {
  const item = firstNonEmpty(line);
  let offset = 0;
  while (offset < item.node.data.length && /\s/.test(item.node.data[offset])) {
    offset += 1;
  }
  return { node: item.node, offset };
}

export function endOfLine(line: SpanItem[]): TextPosition {
  const item = lastNonEmpty(line);
  let offset = item.node.data.length;
  while (offset > 0 && /\s/.test(item.node.data[offset - 1])) {
    offset -= 1;
  }
  return { node: item.node, offset };
}

export function startOfItem(item: SpanItem): TextPosition {
  return { node: item.node, offset: 0 };
}
