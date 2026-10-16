import { formatTimestamp } from "../filename";
import {
  canvasToBlob,
  copyBlobToClipboard,
  downloadBlob,
  fitScale,
} from "./imageUtils";

export interface ExportFormat {
  id: string;
  label: string;
  ext: string;
  lossy: boolean;
}

export const EXPORT_FORMATS: ExportFormat[] = [
  { id: "image/png", label: "PNG", ext: "png", lossy: false },
  { id: "image/jpeg", label: "JPG", ext: "jpg", lossy: true },
  { id: "image/webp", label: "WebP", ext: "webp", lossy: true },
];

export interface ExportSettings {
  format: string;
  /** 0..1, only used by lossy formats. */
  quality: number;
  /** Extra multiplier applied on top of the natural (1x) resolution. */
  scale: number;
}

export const DEFAULT_EXPORT: ExportSettings = {
  format: "image/png",
  quality: 0.92,
  scale: 1,
};

/** Max canvas edge we are willing to hand to toBlob (browsers vary; 12000 is safe). */
export const MAX_EXPORT_EDGE = 12000;

export function formatExt(formatId: string): string {
  return EXPORT_FORMATS.find((f) => f.id === formatId)?.ext ?? "png";
}

export function isLossy(formatId: string): boolean {
  return EXPORT_FORMATS.find((f) => f.id === formatId)?.lossy ?? false;
}

/**
 * Resolve the actual render scale, clamped so the export stays inside browser limits.
 * Returns the scale to use plus the resulting pixel dimensions.
 */
export function resolveExportScale(
  width: number,
  height: number,
  requested: number,
): { scale: number; width: number; height: number; clamped: boolean } {
  const maxAllowed = fitScale(width, height, MAX_EXPORT_EDGE);
  const scale = Math.min(requested, maxAllowed);
  return {
    scale,
    width: Math.round(width * scale),
    height: Math.round(height * scale),
    clamped: scale < requested - 1e-6,
  };
}

export type RenderFn = (scale: number) => HTMLCanvasElement;

export async function saveRendered(
  render: RenderFn,
  settings: ExportSettings,
  baseWidth: number,
  baseHeight: number,
  filenameBase: string,
): Promise<{ width: number; height: number; clamped: boolean }> {
  const resolved = resolveExportScale(baseWidth, baseHeight, settings.scale);
  const canvas = render(resolved.scale);
  const blob = await canvasToBlob(
    canvas,
    settings.format,
    isLossy(settings.format) ? settings.quality : undefined,
  );
  downloadBlob(
    blob,
    `${filenameBase}-${formatTimestamp()}.${formatExt(settings.format)}`,
  );
  return {
    width: resolved.width,
    height: resolved.height,
    clamped: resolved.clamped,
  };
}

export async function copyRendered(
  render: RenderFn,
  settings: ExportSettings,
  baseWidth: number,
  baseHeight: number,
): Promise<{ width: number; height: number; clamped: boolean }> {
  // Clipboard PNG is the most widely supported format.
  const resolved = resolveExportScale(baseWidth, baseHeight, settings.scale);
  const canvas = render(resolved.scale);
  const blob = await canvasToBlob(canvas, "image/png");
  await copyBlobToClipboard(blob);
  return {
    width: resolved.width,
    height: resolved.height,
    clamped: resolved.clamped,
  };
}
