import type { AssetItem } from "../types";

let counter = 0;

export function uid(prefix = "id"): string {
  counter += 1;
  return `${prefix}_${Date.now().toString(36)}_${counter.toString(36)}`;
}

export function loadImageElement(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = "async";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("图片加载失败"));
    img.src = url;
  });
}

export async function fileToAsset(file: File): Promise<AssetItem> {
  const url = URL.createObjectURL(file);
  try {
    const image = await loadImageElement(url);
    return {
      id: uid("img"),
      name: file.name.replace(/\.[^.]+$/, "") || "image",
      url,
      image,
      width: image.naturalWidth || image.width,
      height: image.naturalHeight || image.height,
      type: file.type || "image/*",
    };
  } catch (err) {
    URL.revokeObjectURL(url);
    throw err;
  }
}

export function releaseAsset(asset: AssetItem): void {
  URL.revokeObjectURL(asset.url);
}

/** Build an asset from a base64 `data:` URL (capture-cache import). */
export async function assetFromDataUrl(
  dataUrl: string,
  name: string,
  idPrefix = "staged",
): Promise<AssetItem> {
  const image = await loadImageElement(dataUrl);
  return {
    id: uid(idPrefix),
    name: name.replace(/\.[^.]+$/, "") || "image",
    url: dataUrl,
    image,
    width: image.naturalWidth || image.width,
    height: image.naturalHeight || image.height,
    type: "image/png",
  };
}

export function makeCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  return canvas;
}

export function get2d(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("无法获取 Canvas 2D 上下文");
  return ctx;
}

export function roundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const radius = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.arcTo(x + w, y, x + w, y + radius, radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.arcTo(x + w, y + h, x + w - radius, y + h, radius);
  ctx.lineTo(x + radius, y + h);
  ctx.arcTo(x, y + h, x, y + h - radius, radius);
  ctx.lineTo(x, y + radius);
  ctx.arcTo(x, y, x + radius, y, radius);
  ctx.closePath();
}

export interface CoverOptions {
  /** Horizontal focal point, 0..1 (default center). */
  offsetX?: number;
  /** Vertical focal point, 0..1 (default center). */
  offsetY?: number;
  /** Zoom multiplier on top of the cover scale (>= 1 to fill). */
  zoom?: number;
}

/** Draw `img` so it *covers* the whole rect, cropping the overflow, with pan/zoom control. */
export function drawImageCover(
  ctx: CanvasRenderingContext2D,
  img: CanvasImageSource,
  imgW: number,
  imgH: number,
  x: number,
  y: number,
  w: number,
  h: number,
  opts: CoverOptions = {},
): void {
  const zoom = Math.max(0.05, opts.zoom ?? 1);
  const scale = Math.max(w / imgW, h / imgH) * zoom;
  const dw = imgW * scale;
  const dh = imgH * scale;
  const ox = (opts.offsetX ?? 0.5) * (dw - w);
  const oy = (opts.offsetY ?? 0.5) * (dh - h);
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.drawImage(img, x - ox, y - oy, dw, dh);
  ctx.restore();
}

/** Draw `img` fully inside the rect (letterboxed), preserving aspect ratio. */
export function drawImageContain(
  ctx: CanvasRenderingContext2D,
  img: CanvasImageSource,
  imgW: number,
  imgH: number,
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  const scale = Math.min(w / imgW, h / imgH);
  const dw = imgW * scale;
  const dh = imgH * scale;
  ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
}

export function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality?: number,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("导出失败"))),
      type,
      quality,
    );
  });
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export async function copyBlobToClipboard(blob: Blob): Promise<void> {
  const nav = navigator as Navigator & {
    clipboard?: { write?: (items: ClipboardItem[]) => Promise<void> };
  };
  if (!nav.clipboard?.write || typeof ClipboardItem === "undefined") {
    throw new Error("当前浏览器不支持复制到剪贴板");
  }
  await nav.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
}

/** Largest integer-ish scale that keeps both canvas dimensions within `maxDim`. */
export function fitScale(
  width: number,
  height: number,
  maxDim = 12000,
): number {
  const longest = Math.max(width, height);
  if (longest <= maxDim) return 1;
  return maxDim / longest;
}

export function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

export function sleep(ms = 0): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
