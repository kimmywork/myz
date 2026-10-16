import type { AssetItem } from "../types";
import { drawImageCover, get2d, makeCanvas, roundRectPath } from "./imageUtils";

export interface ShowcaseSize {
  id: string;
  label: string;
  w: number;
  h: number;
}

/** Store-listing export sizes (App Store / Google Play / OG cards). */
export const SHOWCASE_SIZES: ShowcaseSize[] = [
  { id: "iphone-67", label: 'iPhone 6.7" (1290×2796)', w: 1290, h: 2796 },
  { id: "iphone-65", label: 'iPhone 6.5" (1242×2688)', w: 1242, h: 2688 },
  { id: "iphone-61", label: 'iPhone 6.1" (1179×2556)', w: 1179, h: 2556 },
  { id: "iphone-55", label: 'iPhone 5.5" (1242×2208)', w: 1242, h: 2208 },
  { id: "ipad-129", label: 'iPad 12.9" (2048×2732)', w: 2048, h: 2732 },
  { id: "play-phone", label: "Google Play 手机 (1080×1920)", w: 1080, h: 1920 },
  { id: "og", label: "社交卡片 (1200×630)", w: 1200, h: 630 },
  { id: "square", label: "方形 (1080×1080)", w: 1080, h: 1080 },
];

export type ShowcaseTemplate = "single" | "duo" | "trio";

export interface ShowcaseParams {
  sizeId: string;
  template: ShowcaseTemplate;
  bgStyle: "gradient" | "solid";
  bgFrom: string;
  bgTo: string;
  bgAngle: number;
  title: string;
  subtitle: string;
  titleScale: number;
  textColor: string;
  deviceScale: number;
  radius: number;
  spacing: number;
  shadow: boolean;
}

export const DEFAULT_SHOWCASE: ShowcaseParams = {
  sizeId: "iphone-67",
  template: "single",
  bgStyle: "gradient",
  bgFrom: "#5b8cff",
  bgTo: "#7c5cff",
  bgAngle: 135,
  title: "让截图更好看",
  subtitle: "一键生成 App Store 展示图",
  titleScale: 1,
  textColor: "#ffffff",
  deviceScale: 1,
  radius: 0.06,
  spacing: 1,
  shadow: true,
};

function gradientFor(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  angleDeg: number,
  from: string,
  to: string,
): CanvasGradient {
  const rad = (angleDeg * Math.PI) / 180;
  const cx = w / 2;
  const cy = h / 2;
  const len = Math.abs(w * Math.cos(rad)) + Math.abs(h * Math.sin(rad));
  const dx = (Math.cos(rad) * len) / 2;
  const dy = (Math.sin(rad) * len) / 2;
  const g = ctx.createLinearGradient(cx - dx, cy - dy, cx + dx, cy + dy);
  g.addColorStop(0, from);
  g.addColorStop(1, to);
  return g;
}

function fitText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  startSize: number,
): number {
  let size = startSize;
  ctx.font = `700 ${size}px system-ui, -apple-system, "PingFang SC", sans-serif`;
  while (ctx.measureText(text).width > maxWidth && size > 12) {
    size -= 2;
    ctx.font = `700 ${size}px system-ui, -apple-system, "PingFang SC", sans-serif`;
  }
  return size;
}

interface CardOpts {
  radius: number;
  shadow: boolean;
}

function drawCard(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  w: number,
  h: number,
  asset: AssetItem,
  opts: CardOpts,
  rotation = 0,
): void {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(rotation);

  if (opts.shadow) {
    ctx.save();
    ctx.shadowColor = "rgba(6,10,30,0.38)";
    ctx.shadowBlur = w * 0.16;
    ctx.shadowOffsetY = h * 0.025;
    ctx.fillStyle = "#000";
    roundRectPath(ctx, -w / 2, -h / 2, w, h, w * opts.radius);
    ctx.fill();
    ctx.restore();
  }

  ctx.save();
  roundRectPath(ctx, -w / 2, -h / 2, w, h, w * opts.radius);
  ctx.clip();
  drawImageCover(
    ctx,
    asset.image,
    asset.width,
    asset.height,
    -w / 2,
    -h / 2,
    w,
    h,
  );
  ctx.restore();

  ctx.restore();
}

export function composeShowcase(
  assets: AssetItem[],
  p: ShowcaseParams,
  scale = 1,
): HTMLCanvasElement {
  const size =
    SHOWCASE_SIZES.find((s) => s.id === p.sizeId) ?? SHOWCASE_SIZES[0];
  const W = size.w;
  const H = size.h;
  const canvas = makeCanvas(W * scale, H * scale);
  const ctx = get2d(canvas);
  ctx.scale(scale, scale);

  // Background.
  ctx.fillStyle =
    p.bgStyle === "gradient"
      ? gradientFor(ctx, W, H, p.bgAngle, p.bgFrom, p.bgTo)
      : p.bgFrom;
  ctx.fillRect(0, 0, W, H);

  const hasTitle = p.title.trim().length > 0 || p.subtitle.trim().length > 0;
  const pad = W * 0.09;
  let topUsed = 0;

  if (hasTitle) {
    let cursorY = H * 0.09;
    if (p.title.trim()) {
      const base = W * 0.11 * p.titleScale;
      const size = fitText(ctx, p.title, W - pad * 2, base);
      ctx.fillStyle = p.textColor;
      ctx.textAlign = "center";
      ctx.textBaseline = "alphabetic";
      ctx.font = `700 ${size}px system-ui, -apple-system, "PingFang SC", sans-serif`;
      ctx.fillText(p.title, W / 2, cursorY + size);
      cursorY += size * 1.35;
    }
    if (p.subtitle.trim()) {
      const base = W * 0.05 * p.titleScale;
      const size = fitText(ctx, p.subtitle, W - pad * 2, base);
      ctx.fillStyle = p.textColor;
      ctx.globalAlpha = 0.82;
      ctx.textAlign = "center";
      ctx.textBaseline = "alphabetic";
      ctx.font = `500 ${size}px system-ui, -apple-system, "PingFang SC", sans-serif`;
      ctx.fillText(p.subtitle, W / 2, cursorY + size);
      ctx.globalAlpha = 1;
      cursorY += size * 1.4;
    }
    topUsed = cursorY + H * 0.02;
  }

  const source = assets.slice(
    0,
    p.template === "single" ? 1 : p.template === "duo" ? 2 : 3,
  );
  const cardOpts: CardOpts = {
    radius: p.radius,
    shadow: p.shadow,
  };

  const availH = H - topUsed - H * 0.06;
  const availW = W - pad * 2;
  const areaCY = topUsed + availH / 2;

  if (source.length === 0) {
    // Placeholder hint.
    ctx.fillStyle = p.textColor;
    ctx.globalAlpha = 0.5;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `500 ${W * 0.045}px system-ui, sans-serif`;
    ctx.fillText("请先添加截图", W / 2, areaCY);
    ctx.globalAlpha = 1;
    return canvas;
  }

  const layoutByTemplate = (count: number) => {
    if (p.template === "single" || count === 1) {
      return [{ rx: 0.5, ry: 0.5, hf: 0.9, rot: 0 }];
    }
    if (p.template === "duo" && count >= 2) {
      return [
        { rx: 0.3, ry: 0.52, hf: 0.72, rot: -0.07 },
        { rx: 0.7, ry: 0.46, hf: 0.72, rot: 0.07 },
      ];
    }
    return [
      { rx: 0.5, ry: 0.54, hf: 0.74, rot: 0 },
      { rx: 0.25, ry: 0.42, hf: 0.58, rot: -0.12 },
      { rx: 0.75, ry: 0.42, hf: 0.58, rot: 0.12 },
    ];
  };

  const layout = layoutByTemplate(source.length);
  // Draw back phones first for the trio template.
  const order = p.template === "trio" ? [1, 2, 0] : layout.map((_, i) => i);

  const baseH =
    Math.min(availH, availW * 2.1) *
    Math.min(1.1, Math.max(0.4, p.deviceScale));

  for (const idx of order) {
    const asset = source[idx];
    const slot = layout[idx];
    if (!asset || !slot) continue;
    const aspect = asset.width / asset.height;
    let phoneH = baseH * slot.hf * p.spacing;
    let phoneW = phoneH * aspect;
    const maxW = availW * (source.length > 1 ? 0.52 : 0.82);
    if (phoneW > maxW) {
      phoneW = maxW;
      phoneH = phoneW / aspect;
    }
    const cx = pad + availW * slot.rx;
    const cy = topUsed + availH * slot.ry;
    drawCard(ctx, cx, cy, phoneW, phoneH, asset, cardOpts, slot.rot);
  }

  return canvas;
}
