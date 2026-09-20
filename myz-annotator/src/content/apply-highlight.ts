import {
  wrapRangeAcrossNodes as wrapAcross,
  wrapSimpleRange as wrapSimple,
} from "@myz/shared/highlightRange";
import { normalizeHighlightStyle } from "@myz/shared/highlightUtils";
import { MyZRecord, HIGHLIGHT_STYLES, DEFAULT_COLORS } from "@myz/shared/types";

function createHighlightElement(record: MyZRecord) {
  const highlight = document.createElement("span");
  highlight.className = "myz-highlight";
  decorateHighlightElement(highlight, record);
  return highlight;
}

export function wrapSimpleRange(range: Range, record: MyZRecord) {
  return wrapSimple(range, () => createHighlightElement(record));
}

export function wrapRangeAcrossNodes(range: Range, record: MyZRecord) {
  return wrapAcross(range, () => createHighlightElement(record));
}

export function decorateHighlightElement(
  element: HTMLElement,
  record: MyZRecord,
) {
  if (!element) {
    return;
  }
  const style = normalizeHighlightStyle(record?.style);
  const color = resolveHighlightColor(record?.color);
  Object.values(HIGHLIGHT_STYLES).forEach((value) => {
    element.classList.remove(`myz-highlight--${value}`);
  });
  element.classList.add(`myz-highlight--${style}`);
  if (record?.id) {
    element.dataset.highlightId = record.id;
  }
  element.dataset.highlightStyle = style;
  element.style.setProperty("--myz-highlight-color", color);

  // Inline fallbacks so highlights remain visible even if the stylesheet is
  // removed. Paint stays translucent (§3.4) and underline/wavy use the token
  // thicknesses, matching `page.css`.
  element.style.backgroundColor = "transparent";
  element.style.textDecoration = "";
  element.style.textDecorationColor = "";
  element.style.textDecorationThickness = "";
  if (style === HIGHLIGHT_STYLES.PAINT) {
    // 42% alpha as an 8-digit hex (broad CSSOM support, no color-mix needed).
    element.style.backgroundColor = `${color}6b`;
  } else if (style === HIGHLIGHT_STYLES.UNDERLINE) {
    element.style.textDecoration = "underline";
    element.style.textDecorationColor = color;
    element.style.textDecorationThickness = "2px";
  } else if (style === HIGHLIGHT_STYLES.WAVY) {
    element.style.textDecoration = "underline wavy";
    element.style.textDecorationColor = color;
    element.style.textDecorationThickness = "1.5px";
  }
}

export function resolveHighlightColor(color: string | undefined): string {
  if (typeof color === "string") {
    const trimmed = color.trim();
    if (/^#[0-9a-fA-F]{6}$/.test(trimmed)) {
      return trimmed;
    }
  }
  return DEFAULT_COLORS[0];
}
