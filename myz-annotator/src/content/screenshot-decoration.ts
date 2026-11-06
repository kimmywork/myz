/**
 * Selection screenshot decoration: expand the crop with page background, then
 * round the corners and add a concentric rounded ambient border.
 *
 * Kept separate from `image.ts` (crop/capture helpers) so the pixel pipeline
 * stays reviewable and the pure luminance helpers remain unit-testable.
 */
import type { CropRect } from "./image";

/**
 * Card corner radius, in CSS pixels. The same width of page background is
 * captured around the selection before rounding, so the arc only cuts through
 * background — never through the selected content.
 */
const SCREENSHOT_RADIUS_CSS = 12;

/** Drop-shadow breathing room around the card, in CSS pixels. */
const SCREENSHOT_MARGIN_CSS = 20;

/** Card shadow blur / vertical offset, in CSS pixels. */
const CARD_SHADOW_BLUR_CSS = 14;
const CARD_SHADOW_OFFSET_Y_CSS = 4;

const CARD_HAIRLINE_LIGHT = "rgba(0, 0, 0, 0.10)";
const CARD_HAIRLINE_DARK = "rgba(255, 255, 255, 0.16)";
const CARD_SHADOW_LIGHT = "rgba(0, 0, 0, 0.16)";
const CARD_SHADOW_DARK = "rgba(0, 0, 0, 0.55)";

/** Relative luminance below which the card switches to its dark treatment. */
const CARD_DARK_LUMINANCE = 0.18;

interface ExpandedCrop {
  canvas: HTMLCanvasElement;
  /** Corner radius in device pixels. */
  radius: number;
  /** Shadow margin in device pixels. */
  margin: number;
  /** Capture scale (device pixels per CSS pixel). */
  scale: number;
  /** Median relative luminance of the captured background, 0…1. */
  luminance: number;
}

/** Add a rounded-rectangle sub-path to the current path. */
function roundedRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  const r = Math.max(0, Math.min(radius, width / 2, height / 2));
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

/** Clamp-and-scale a CSS length to device pixels. */
function devicePx(cssPx: number, scale: number): number {
  return Math.max(4, Math.min(48, Math.round(cssPx * scale)));
}

/** Width of the ring sampled just outside the selection, in device pixels. */
const RING_SAMPLE_BAND = 3;

/** Per-channel distance from the median that counts as a deviating sample. */
const RING_UNIFORM_TOLERANCE = 26;

/**
 * Max share of ring samples that may deviate from the median before the ring
 * is treated as an image/pattern background. Neighbouring text usually covers
 * a small part of the ring, while a photo varies almost everywhere.
 */
const RING_OUTLIER_RATIO = 0.25;

export interface RingColor {
  r: number;
  g: number;
  b: number;
}

/** One ring sample: flat colour (if any) and its relative luminance. */
interface RingSample {
  /** `null` when the ring looks patterned rather than flat. */
  color: RingColor | null;
  /** Median relative luminance of the ring, 0 (black) … 1 (white). */
  luminance: number;
}

/** Median of a numeric sample list (does not mutate the input). */
function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

/** sRGB channel (0–255) → linear-light channel (0–1). */
function srgbToLinear(value: number): number {
  const channel = value / 255;
  return channel <= 0.03928
    ? channel / 12.92
    : ((channel + 0.055) / 1.055) ** 2.4;
}

/** WCAG relative luminance of an sRGB colour, 0 (black) … 1 (white). */
export function relativeLuminance(color: RingColor): number {
  return (
    0.2126 * srgbToLinear(color.r) +
    0.7152 * srgbToLinear(color.g) +
    0.0722 * srgbToLinear(color.b)
  );
}

/**
 * Sample the ring just outside the selection. `color` is the median colour
 * when the ring is mostly flat (a background colour) and `null` when it looks
 * like an image/pattern background that should keep its real surroundings.
 * `luminance` is always reported so the ambient border can adapt to dark pages.
 */
function sampleRing(
  ctx: CanvasRenderingContext2D,
  radius: number,
  sw: number,
  sh: number,
): RingSample | null {
  const band = Math.min(RING_SAMPLE_BAND, Math.max(1, radius - 1));
  const bands: [number, number, number, number][] = [
    [radius, radius - band, sw, band], // above
    [radius, radius + sh, sw, band], // below
    [radius - band, radius, band, sh], // left
    [radius + sw, radius, band, sh], // right
  ];
  const r: number[] = [];
  const g: number[] = [];
  const b: number[] = [];
  const a: number[] = [];
  for (const [bx, by, bw, bh] of bands) {
    if (bw <= 0 || bh <= 0) continue;
    const data = ctx.getImageData(bx, by, bw, bh).data;
    const step = Math.max(1, Math.floor(bw / 64));
    for (let y = 0; y < bh; y += 1) {
      for (let x = 0; x < bw; x += step) {
        const i = (y * bw + x) * 4;
        r.push(data[i]);
        g.push(data[i + 1]);
        b.push(data[i + 2]);
        a.push(data[i + 3]);
      }
    }
  }
  if (!r.length || median(a) < 200) return null;
  const color = { r: median(r), g: median(g), b: median(b) };
  let outliers = 0;
  for (let index = 0; index < r.length; index += 1) {
    const deviates =
      Math.abs(r[index] - color.r) > RING_UNIFORM_TOLERANCE ||
      Math.abs(g[index] - color.g) > RING_UNIFORM_TOLERANCE ||
      Math.abs(b[index] - color.b) > RING_UNIFORM_TOLERANCE;
    if (deviates) outliers += 1;
  }
  return {
    color: outliers / r.length > RING_OUTLIER_RATIO ? null : color,
    luminance: relativeLuminance(color),
  };
}

/**
 * Flat backgrounds get a clean solid expansion ring. Without this, pixels of
 * adjacent text would leak into the breathing room; patterned backgrounds keep
 * their real surrounding pixels instead.
 *
 * Returns the ring luminance so the ambient border can pick its contrast mode.
 */
function paintFlatBackgroundRing(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  radius: number,
  sw: number,
  sh: number,
): number {
  const sample = sampleRing(ctx, radius, sw, sh);
  if (!sample) return 0.5;
  if (sample.color) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, width, height);
    ctx.rect(radius, radius, sw, sh);
    ctx.fillStyle = `rgb(${sample.color.r} ${sample.color.g} ${sample.color.b})`;
    ctx.fill("evenodd");
    ctx.restore();
  }
  return sample.luminance;
}

/**
 * Crop the selection plus a `radius`-wide ring sampled from the live page
 * screenshot — that ring carries the page background colour (or the underlying
 * image pattern). Parts that fall outside the captured viewport are extended
 * from the nearest edge pixel so the ring is always complete.
 */
export function cropExpandedSelection(
  image: HTMLImageElement,
  rect: CropRect,
  viewport: { width: number; height: number },
): ExpandedCrop {
  const scaleX = image.width / viewport.width;
  const scaleY = image.height / viewport.height;
  const scale = (scaleX + scaleY) / 2;
  const radius = devicePx(SCREENSHOT_RADIUS_CSS, scale);
  const margin = Math.max(8, Math.round(SCREENSHOT_MARGIN_CSS * scale));
  const sx = Math.floor(rect.left * scaleX);
  const sy = Math.floor(rect.top * scaleY);
  const sw = Math.max(1, Math.floor(rect.width * scaleX));
  const sh = Math.max(1, Math.floor(rect.height * scaleY));
  const x0 = sx - radius;
  const y0 = sy - radius;
  const width = sw + radius * 2;
  const height = sh + radius * 2;

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas context is unavailable");

  // Clip the source rect to the screenshot, then draw it at the matching offset.
  const cx = Math.max(0, x0);
  const cy = Math.max(0, y0);
  const cw = Math.min(image.width, x0 + width) - cx;
  const ch = Math.min(image.height, y0 + height) - cy;
  if (cw <= 0 || ch <= 0) {
    throw new Error("Selection bounds are outside the captured area");
  }
  const dx = cx - x0;
  const dy = cy - y0;
  ctx.drawImage(image, cx, cy, cw, ch, dx, dy, cw, ch);

  // Extend any missing ring outward from the nearest captured edge.
  const left = dx;
  const top = dy;
  const right = width - (dx + cw);
  const bottom = height - (dy + ch);
  if (left > 0) ctx.drawImage(image, cx, cy, 1, ch, 0, dy, left, ch);
  if (right > 0) {
    ctx.drawImage(image, cx + cw - 1, cy, 1, ch, dx + cw, dy, right, ch);
  }
  if (top > 0) ctx.drawImage(image, cx, cy, cw, 1, dx, 0, cw, top);
  if (bottom > 0) {
    ctx.drawImage(image, cx, cy + ch - 1, cw, 1, dx, dy + ch, cw, bottom);
  }
  if (left > 0 && top > 0) {
    ctx.drawImage(image, cx, cy, 1, 1, 0, 0, left, top);
  }
  if (right > 0 && top > 0) {
    ctx.drawImage(image, cx + cw - 1, cy, 1, 1, dx + cw, 0, right, top);
  }
  if (left > 0 && bottom > 0) {
    ctx.drawImage(image, cx, cy + ch - 1, 1, 1, 0, dy + ch, left, bottom);
  }
  if (right > 0 && bottom > 0) {
    ctx.drawImage(
      image,
      cx + cw - 1,
      cy + ch - 1,
      1,
      1,
      dx + cw,
      dy + ch,
      right,
      bottom,
    );
  }

  const luminance = paintFlatBackgroundRing(ctx, width, height, radius, sw, sh);
  return { canvas, radius, margin, scale, luminance };
}

export interface CardStyle {
  /** 1px inner border colour. */
  hairline: string;
  shadowColor: string;
}

/**
 * Pick the card treatment from the backdrop luminance. Both a hairline and a
 * drop shadow are theme-aware: dark pages need a light rim because a dark
 * shadow alone disappears into the page.
 */
export function resolveCardStyle(luminance: number): CardStyle {
  const dark = luminance < CARD_DARK_LUMINANCE;
  return {
    hairline: dark ? CARD_HAIRLINE_DARK : CARD_HAIRLINE_LIGHT,
    shadowColor: dark ? CARD_SHADOW_DARK : CARD_SHADOW_LIGHT,
  };
}

/**
 * Turn the expanded crop into the final card: rounded corners, a 1px adaptive
 * hairline and a soft drop shadow. The shadow gets its own margin so it is
 * never clipped, while the area outside it stays transparent.
 */
export function decorateSelection(
  base: HTMLCanvasElement,
  radius: number,
  margin: number,
  scale: number,
  luminance: number,
): HTMLCanvasElement {
  const w = base.width;
  const h = base.height;
  const width = w + margin * 2;
  const height = h + margin * 2;
  const out = document.createElement("canvas");
  out.width = width;
  out.height = height;
  const ctx = out.getContext("2d");
  if (!ctx) return base;

  const style = resolveCardStyle(luminance);
  const shadowBlur = Math.max(2, Math.round(CARD_SHADOW_BLUR_CSS * scale));
  const shadowOffsetY = Math.max(
    1,
    Math.round(CARD_SHADOW_OFFSET_Y_CSS * scale),
  );
  const strokeWidth = Math.max(1, Math.round(scale));

  // Soft drop shadow behind the card silhouette.
  ctx.save();
  ctx.shadowColor = style.shadowColor;
  ctx.shadowBlur = shadowBlur;
  ctx.shadowOffsetY = shadowOffsetY;
  ctx.fillStyle = "#000";
  roundedRectPath(ctx, margin, margin, w, h, radius);
  ctx.fill();
  ctx.restore();

  // Crisp, rounded card.
  ctx.save();
  roundedRectPath(ctx, margin, margin, w, h, radius);
  ctx.clip();
  ctx.drawImage(base, margin, margin);

  // Inner hairline (the outer half of a 2× stroke is clipped away).
  ctx.strokeStyle = style.hairline;
  ctx.lineWidth = strokeWidth * 2;
  roundedRectPath(ctx, margin, margin, w, h, radius);
  ctx.stroke();
  ctx.restore();
  return out;
}
