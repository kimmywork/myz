import { waitForNextPaint } from "./html.ts";
import {
  cropExpandedSelection,
  decorateSelection,
} from "./screenshot-decoration";
import { buildSimpleName } from "@/stitch/filename";

export interface ImageCropResult {
  canvas: HTMLCanvasElement;
  scaleX: number;
  scaleY: number;
  sw: number;
  sh: number;
}

export interface CropRect {
  left: number;
  right?: number;
  top: number;
  bottom?: number;
  width: number;
  height: number;
}

/**
 * Extra vertical room for a selection crop. `Range.getClientRects()` returns
 * the line box, which tall glyphs (CJK, accents) can overflow — without this
 * the crop clips the tops/bottoms of characters.
 */
function selectionVerticalPad(range: Range, lineHeight: number): number {
  const node = range.startContainer;
  const element =
    node.nodeType === Node.ELEMENT_NODE
      ? (node as Element)
      : node.parentElement;
  let fontSize = 16;
  if (element) {
    const size = parseFloat(getComputedStyle(element).fontSize);
    if (Number.isFinite(size) && size > 0) fontSize = size;
  }
  return Math.max(3, Math.round(Math.max(fontSize, lineHeight) * 0.2));
}

export function getSelectionBoundingRect(
  range: Range,
): Partial<CropRect> | null {
  const rects = Array.from(range.getClientRects()).filter(
    (rect) => rect.width && rect.height,
  );
  if (!rects.length) {
    const fallback = range.getBoundingClientRect();
    if (!fallback || !fallback.width || !fallback.height) {
      return null;
    }
    const pad = selectionVerticalPad(range, fallback.height);
    const top = Math.max(0, fallback.top - pad);
    const bottom = Math.min(window.innerHeight, fallback.bottom + pad);
    return {
      top,
      left: fallback.left,
      right: fallback.right,
      bottom,
      width: fallback.width,
      height: bottom - top,
    };
  }
  const bounds = rects.reduce(
    (acc, rect) => ({
      top: Math.min(acc.top, rect.top),
      left: Math.min(acc.left, rect.left),
      right: Math.max(acc.right, rect.right),
      bottom: Math.max(acc.bottom, rect.bottom),
    }),
    {
      top: rects[0].top,
      left: rects[0].left,
      right: rects[0].right,
      bottom: rects[0].bottom,
    },
  );
  const lineHeight = Math.min(...rects.map((rect) => rect.height));
  const pad = selectionVerticalPad(range, lineHeight);
  const top = Math.max(0, bounds.top - pad);
  const bottom = Math.min(window.innerHeight, bounds.bottom + pad);
  return {
    top,
    left: bounds.left,
    right: bounds.right,
    bottom,
    width: bounds.right - bounds.left,
    height: bottom - top,
  };
}

export interface SelectionScreenshot {
  dataUrl: string;
  width: number;
  height: number;
  mime: string;
  name: string;
}

export interface SelectionCapture {
  /** Final card art: expansion (A) + rounded corners (B) + rounded border (C). */
  decorated: SelectionScreenshot;
  /**
   * Staging copy: background expansion (A) only. Rounding and the ambient
   * border would clip/offset content, so the stitch editor gets this instead.
   */
  staged: SelectionScreenshot;
}

export async function cropAndDownloadSelection(
  dataUrl: string,
  rect: CropRect,
  captureViewport?: { width: number; height: number },
): Promise<SelectionCapture> {
  const image = await loadImage(dataUrl);
  const viewport = {
    width: captureViewport?.width ?? image.width,
    height: captureViewport?.height ?? image.height,
  };
  const expanded = cropExpandedSelection(image, rect, viewport);
  const staged = expanded.canvas.toDataURL("image/png");
  const decorated = decorateSelection(
    expanded.canvas,
    expanded.radius,
    expanded.margin,
    expanded.scale,
    expanded.luminance,
  );
  const dataUrlOut = decorated.toDataURL("image/png");
  const name = `${buildSimpleName("screenshot")}.png`;
  downloadImage(dataUrlOut, name);
  return {
    decorated: {
      dataUrl: dataUrlOut,
      width: decorated.width,
      height: decorated.height,
      mime: "image/png",
      name,
    },
    staged: {
      dataUrl: staged,
      width: expanded.canvas.width,
      height: expanded.canvas.height,
      mime: "image/png",
      name,
    },
  };
}

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Failed to load screenshot"));
    image.src = dataUrl;
  });
}

export function downloadImage(dataUrl: string, filename: string) {
  const anchor = document.createElement("a");
  anchor.href = dataUrl;
  anchor.download = filename;
  anchor.click();
}

export async function cropToCanvas(
  dataUrl: string,
  rect: CropRect,
  captureViewport?: { width: number; height: number },
): Promise<ImageCropResult> {
  const image = await loadImage(dataUrl);
  const viewportWidth = captureViewport?.width ?? image.width;
  const viewportHeight = captureViewport?.height ?? image.height;
  const scaleX = image.width / viewportWidth;
  const scaleY = image.height / viewportHeight;
  const sx = Math.max(0, Math.floor(rect.left * scaleX));
  const sy = Math.max(0, Math.floor(rect.top * scaleY));
  const sw = Math.min(image.width - sx, Math.floor(rect.width * scaleX));
  const sh = Math.min(image.height - sy, Math.floor(rect.height * scaleY));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, sw);
  canvas.height = Math.max(1, sh);
  const context = canvas.getContext("2d");
  context?.drawImage(image, sx, sy, sw, sh, 0, 0, sw, sh);
  return { canvas, scaleX, scaleY, sw, sh };
}

let __myzLastCaptureAt = 0;

function sleep(ms: number) {
  return new Promise((res) => setTimeout(res, ms));
}

export async function captureVisiblePngWithThrottle(maxRetries = 4) {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const now = Date.now();
    const since = now - __myzLastCaptureAt;
    const minGap = 650; // ms, stay under rate limit
    if (since < minGap) {
      await sleep(minGap - since);
    }
    await waitForNextPaint();
    const resp = (await new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage(
          { type: "myz:captureSelection", payload: { format: "png" } },
          (r) => resolve(r),
        );
      } catch (e) {
        resolve(null);
      }
    })) as { ok: boolean; data?: { dataUrl: string } } | null;
    __myzLastCaptureAt = Date.now();
    if (resp && resp.ok && resp.data && resp.data.dataUrl) {
      return resp.data.dataUrl;
    }
    await sleep(700 + attempt * 250);
  }
  throw new Error("capture throttled or failed");
}
