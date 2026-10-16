import { waitForNextPaint } from "./html.ts";
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

/**
 * Breathing room + a soft halo. The screenshot's own edge colours are extended
 * outwards by ~0.5em; that border is blurred and faded to fully transparent
 * using a distance-based mask (uniform alpha at a given distance, so the four
 * corners fade exactly like the edges — no corner squares). No solid fill, no
 * rounded corners, no drop shadow.
 */
const SCREENSHOT_BORDER_CSS = 8; // 0.5em (1em ≈ 16px)

/** Smooth 0→1 easing for the border falloff. */
function smoothstep(t: number): number {
  const c = Math.max(0, Math.min(1, t));
  return c * c * (3 - 2 * c);
}

/**
 * Fade the drawn halo to transparent based on the distance to the image rect.
 * `max(dx, dy)` keeps the alpha uniform along edges *and* corners.
 */
function applyBorderFade(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  border: number,
  innerW: number,
  innerH: number,
): void {
  const mask = document.createElement("canvas");
  mask.width = width;
  mask.height = height;
  const mctx = mask.getContext("2d");
  if (!mctx) return;
  const image = mctx.createImageData(width, height);
  const data = image.data;
  for (let y = 0; y < height; y += 1) {
    const dy = Math.max(border - y, y - (border + innerH - 1), 0);
    for (let x = 0; x < width; x += 1) {
      const dx = Math.max(border - x, x - (border + innerW - 1), 0);
      const distance = Math.max(dx, dy);
      const alpha =
        distance <= 0
          ? 255
          : Math.round(smoothstep(1 - distance / border) * 255);
      const index = (y * width + x) * 4;
      data[index] = 255;
      data[index + 1] = 255;
      data[index + 2] = 255;
      data[index + 3] = alpha;
    }
  }
  mctx.putImageData(image, 0, 0);
  ctx.globalCompositeOperation = "destination-in";
  ctx.drawImage(mask, 0, 0);
  ctx.globalCompositeOperation = "source-over";
}

/**
 * Feather mode: extend the screenshot outwards ~0.5em, blur that border and
 * fade it to transparent (kept as an alternative to the backdrop mode).
 */
function decorateWithFeather(
  source: HTMLCanvasElement,
  scale: number,
): HTMLCanvasElement {
  const border = Math.max(
    4,
    Math.min(48, Math.round(SCREENSHOT_BORDER_CSS * scale)),
  );
  const w = source.width;
  const h = source.height;
  const width = w + border * 2;
  const height = h + border * 2;

  const backdrop = document.createElement("canvas");
  backdrop.width = width;
  backdrop.height = height;
  const b = backdrop.getContext("2d");
  if (!b) return source;
  b.drawImage(source, border, border, w, h);
  b.drawImage(source, 0, 0, w, 1, 0, 0, width, border); // top edge, full width
  b.drawImage(source, 0, h - 1, w, 1, 0, height - border, width, border); // bottom
  b.drawImage(source, 0, 0, 1, h, 0, 0, border, height); // left edge, full height
  b.drawImage(source, w - 1, 0, 1, h, width - border, 0, border, height); // right

  const out = document.createElement("canvas");
  out.width = width;
  out.height = height;
  const ctx = out.getContext("2d");
  if (!ctx) return source;
  // Blur the extended border so the seams melt into a soft halo.
  ctx.filter = `blur(${Math.max(1, Math.round(border * 0.6))}px)`;
  ctx.drawImage(backdrop, 0, 0);
  ctx.filter = "none";
  // Uniform fade to transparent.
  applyBorderFade(ctx, width, height, border, w, h);
  ctx.drawImage(source, border, border); // crisp centre on top
  return out;
}

/** How the selection screenshot gets its breathing-room border. */
export type ScreenshotDecorationMode = "backdrop" | "feather";

/** Default: the blurred ambient backdrop. */
export const DEFAULT_SCREENSHOT_DECORATION: ScreenshotDecorationMode =
  "backdrop";

const BACKDROP_BRIGHTNESS = 0.9;
const BACKDROP_BLUR_FACTOR = 0.6;

/**
 * Backdrop mode (default): scale the selection to cover the image plus 0.5em on
 * every side, blur it and dim it as an ambient background, then place the crisp
 * selection on top. Only the four border bands are rasterised — the centre is
 * covered by the original.
 */
function decorateWithBackdrop(
  source: HTMLCanvasElement,
  scale: number,
): HTMLCanvasElement {
  const border = Math.max(
    4,
    Math.min(48, Math.round(SCREENSHOT_BORDER_CSS * scale)),
  );
  const w = source.width;
  const h = source.height;
  const width = w + border * 2;
  const height = h + border * 2;
  const out = document.createElement("canvas");
  out.width = width;
  out.height = height;
  const ctx = out.getContext("2d");
  if (!ctx) return source;
  const blur = Math.max(3, Math.round(border * BACKDROP_BLUR_FACTOR));
  const bands: [number, number, number, number][] = [
    [0, 0, width, border], // top
    [0, height - border, width, border], // bottom
    [0, border, border, height - border * 2], // left
    [width - border, border, border, height - border * 2], // right
  ];
  for (const [bx, by, bw, bh] of bands) {
    if (bw <= 0 || bh <= 0) continue;
    ctx.save();
    ctx.beginPath();
    ctx.rect(bx, by, bw, bh);
    ctx.clip();
    ctx.filter = `blur(${blur}px) brightness(${BACKDROP_BRIGHTNESS})`;
    ctx.drawImage(source, 0, 0, width, height);
    ctx.filter = "none";
    ctx.restore();
  }
  ctx.drawImage(source, border, border, w, h); // crisp selection on top
  return out;
}

function decorateScreenshot(
  source: HTMLCanvasElement,
  scale: number,
  mode: ScreenshotDecorationMode = DEFAULT_SCREENSHOT_DECORATION,
): HTMLCanvasElement {
  return mode === "feather"
    ? decorateWithFeather(source, scale)
    : decorateWithBackdrop(source, scale);
}

export async function cropAndDownloadSelection(
  dataUrl: string,
  rect: CropRect,
  captureViewport?: { width: number; height: number },
): Promise<SelectionScreenshot> {
  const image = await loadImage(dataUrl);

  const viewportWidth = captureViewport?.width ?? image.width;
  const viewportHeight = captureViewport?.height ?? image.height;
  const scaleX = image.width / viewportWidth;
  const scaleY = image.height / viewportHeight;
  const sx = Math.max(0, Math.floor(rect.left * scaleX));
  const sy = Math.max(0, Math.floor(rect.top * scaleY));
  const sw = Math.min(image.width - sx, Math.floor(rect.width * scaleX));
  const sh = Math.min(image.height - sy, Math.floor(rect.height * scaleY));
  if (sw <= 0 || sh <= 0) {
    throw new Error("Selection bounds are outside the captured area");
  }
  const canvas = document.createElement("canvas");
  canvas.width = sw;
  canvas.height = sh;
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Canvas context is unavailable");
  }
  context.drawImage(image, sx, sy, sw, sh, 0, 0, sw, sh);
  const decorated = decorateScreenshot(canvas, scaleX);
  const dataUrlOut = decorated.toDataURL("image/png");
  const name = `${buildSimpleName("screenshot")}.png`;
  downloadImage(dataUrlOut, name);
  return {
    dataUrl: dataUrlOut,
    width: decorated.width,
    height: decorated.height,
    mime: "image/png",
    name,
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
