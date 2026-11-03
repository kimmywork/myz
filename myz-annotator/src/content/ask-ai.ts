/**
 * 解读 selection pipeline (toolbar → external AI chat).
 *
 * Reads the current selection as paragraph text (the same block splitter the
 * translation popover uses), screenshots it when it contains an image, and hands
 * both to the background. The prompt itself is rendered by the background from
 * the user's template in settings, so the content script never needs the
 * template (and a settings change applies without reloading the page).
 */
import { selectionBlocks } from "@myz/shared/selectionBlocks";
import type {
  AiAskPayload,
  AiComposeImage,
  AiComposeResult,
} from "./ai-compose";
import { waitForNextPaint } from "./html";
import type { CropRect } from "./image";
import {
  captureVisiblePngWithThrottle,
  cropToCanvas,
  getSelectionBoundingRect,
} from "./image";
import { invoke } from "@/messaging/invoke";

const MIN_CROP_EDGE = 4;

/** Text of the selection, paragraph by paragraph. */
export function selectionText(range: Range): string {
  const blocks = selectionBlocks(range);
  if (blocks.length) return blocks.join("\n\n");
  return (range.toString() ?? "").trim();
}

/**
 * Hand the current selection to the AI chat. Never throws: the caller only needs
 * to map the result to a toast.
 */
export async function askAiAboutSelection(): Promise<AiComposeResult | null> {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
    return null;
  }
  const range = selection.getRangeAt(0).cloneRange();
  const text = selectionText(range);
  const images = await captureSelectionScreenshot(range).catch((error) => {
    console.warn("MyZ: selection screenshot failed", error);
    return [] as AiComposeImage[];
  });
  if (!text && !images.length) {
    return null;
  }
  const payload: AiAskPayload = {
    text,
    url: window.location.href,
    images,
  };
  return invoke("myz:askAi", payload);
}

/**
 * Screenshot the selection rectangle — but only when it contains an image.
 * Text-only selections travel as text; a picture is worthless to the AI as
 * pixels of prose, and a mixed selection keeps both the words and the figure.
 *
 * The browser paints the selection highlight into screenshots, so the ranges are
 * detached for the capture and restored afterwards (same trick as 截取).
 */
export async function captureSelectionScreenshot(
  range: Range,
): Promise<AiComposeImage[]> {
  const images = selectedImages(range);
  if (!images.length) return [];
  // Clamp to the viewport and require the visible part to actually cover one of
  // the selected images: a selection that runs from on-screen text down to an
  // image below the fold would otherwise crop a band of unrelated page content.
  const rect = toCropRect(getSelectionBoundingRect(range));
  const crop = rect ? clampToViewport(rect) : null;
  if (!crop) return [];
  const coversImage = images.some((image) =>
    rectsOverlap(image.getBoundingClientRect(), crop),
  );
  if (!coversImage) return [];

  const selection = window.getSelection();
  const saved: Range[] = [];
  for (let index = 0; index < (selection?.rangeCount ?? 0); index += 1) {
    saved.push(selection!.getRangeAt(index).cloneRange());
  }
  selection?.removeAllRanges();
  await waitForNextPaint();

  const viewport = { width: window.innerWidth, height: window.innerHeight };
  try {
    // The overlay toolbar is already hidden by the caller, so it stays out of
    // the shot; the helper also waits for the next paint.
    const screenshot = await captureVisiblePngWithThrottle();
    const { canvas } = await cropToCanvas(screenshot, crop, viewport);
    return [{ dataUrl: canvas.toDataURL("image/png"), mime: "image/png" }];
  } finally {
    selection?.removeAllRanges();
    saved.forEach((savedRange) => {
      try {
        selection?.addRange(savedRange);
      } catch (error) {
        console.debug("MyZ: selection restore failed", error);
      }
    });
  }
}

/** Visible images the selection covers. */
export function selectedImages(range: Range): HTMLImageElement[] {
  return Array.from(document.images).filter(
    (image) => isVisible(image) && intersects(range, image),
  );
}

/** True when a visible image element intersects the selection. */
export function selectionHasImage(range: Range): boolean {
  return selectedImages(range).length > 0;
}

/** Clip a selection rectangle to what is actually on screen. */
function clampToViewport(rect: CropRect): CropRect | null {
  const left = Math.max(0, rect.left);
  const top = Math.max(0, rect.top);
  const right = Math.min(window.innerWidth, rect.left + rect.width);
  const bottom = Math.min(window.innerHeight, rect.top + rect.height);
  const width = right - left;
  const height = bottom - top;
  if (width < MIN_CROP_EDGE || height < MIN_CROP_EDGE) return null;
  return { left, top, width, height };
}

function rectsOverlap(rect: DOMRect, crop: CropRect): boolean {
  return (
    rect.right > crop.left &&
    rect.left < crop.left + crop.width &&
    rect.bottom > crop.top &&
    rect.top < crop.top + crop.height
  );
}

function toCropRect(rect: Partial<CropRect> | null): CropRect | null {
  if (!rect) return null;
  const { left, top, width, height } = rect;
  if (
    typeof left !== "number" ||
    typeof top !== "number" ||
    typeof width !== "number" ||
    typeof height !== "number"
  ) {
    return null;
  }
  if (width < MIN_CROP_EDGE || height < MIN_CROP_EDGE) return null;
  return { left, top, width, height };
}

function isVisible(element: Element): boolean {
  const rect = element.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return false;
  const style = getComputedStyle(element);
  return style.visibility !== "hidden" && style.display !== "none";
}

function intersects(range: Range, node: Node): boolean {
  try {
    return range.intersectsNode(node);
  } catch {
    return false;
  }
}
