export interface Gray {
  w: number;
  h: number;
  /** Luminance, row-major, length w*h. */
  data: Float32Array;
}

let sharedCanvas: HTMLCanvasElement | null = null;
let sharedCtx: CanvasRenderingContext2D | null = null;

/**
 * Rasterise any drawable source to grayscale luminance at the requested size.
 * Uses a single reusable canvas to avoid churning through allocations.
 */
export function imageToGray(
  src: CanvasImageSource,
  targetW: number,
  targetH: number,
): Gray {
  const w = Math.max(1, Math.round(targetW));
  const h = Math.max(1, Math.round(targetH));
  if (!sharedCanvas) {
    sharedCanvas = document.createElement("canvas");
    sharedCtx = sharedCanvas.getContext("2d", { willReadFrequently: true });
  }
  const canvas = sharedCanvas;
  const ctx = sharedCtx;
  if (!ctx) throw new Error("无法获取 Canvas 2D 上下文");
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  ctx.clearRect(0, 0, w, h);
  ctx.drawImage(src, 0, 0, w, h);
  const { data } = ctx.getImageData(0, 0, w, h);
  const out = new Float32Array(w * h);
  for (let i = 0, p = 0; i < out.length; i += 1, p += 4) {
    out[i] = 0.299 * data[p] + 0.587 * data[p + 1] + 0.114 * data[p + 2];
  }
  return { w, h, data: out };
}
