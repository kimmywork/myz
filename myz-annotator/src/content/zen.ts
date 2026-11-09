import { detectCjkRegion, type CjkRegion } from "@myz/shared/cjk";
import { stageCapturedImage } from "./capture-media.js";
import { findPrimaryContentElement } from "./content-extraction.js";
import { waitForNextPaint } from "./html.js";
import { captureVisiblePngWithThrottle, cropToCanvas } from "./image.js";
import { getThemeRoot } from "./theme-root.js";
import { buildSimpleName } from "@/stitch/filename";

declare global {
  interface Window {
    __myzZenAncestors: HTMLElement[];
  }
}

export function hasArticleElement(): boolean {
  return Boolean(findPrimaryContentElement());
}

export function isZenModeEnabled(): boolean {
  return document.documentElement.classList.contains("myz-zen-enabled");
}

function getZenTargetElement(): Element | null {
  const current = document.querySelector(".myz-zen-target-keep");
  if (current) return current;
  return findPrimaryContentElement();
}

export function enableZenMode(): boolean {
  if (isZenModeEnabled()) return true;
  const article = findPrimaryContentElement() as HTMLElement;
  if (!article) return false;
  const styleId = "myz-zen-style";
  let style = document.getElementById(styleId) as HTMLStyleElement | null;
  if (!style) {
    style = document.createElement("style");
    style.id = styleId;
    document.head.appendChild(style);
  }
  // Rebuild on every entry so a theme/scheme change is picked up.
  style.textContent = buildZenCss();
  // Mark the target; do NOT move DOM nodes to preserve highlight ranges
  article.classList.add("myz-zen-target-keep");
  // Mark ancestors so CSS can keep them visible without :has()
  const ancestors = [];
  let cur = article.parentElement;
  while (cur && cur !== document.body) {
    ancestors.push(cur);
    cur.classList.add("myz-zen-ancestor-keep");
    cur = cur.parentElement;
  }
  // Always keep body visible as ancestor
  document.body.classList.add("myz-zen-ancestor-keep");
  // Persist for cleanup
  window.__myzZenAncestors = ancestors;
  document.documentElement.classList.add("myz-zen-enabled");
  return true;
}

export function disableZenMode() {
  if (!isZenModeEnabled()) return true;
  document.documentElement.classList.remove("myz-zen-enabled");
  const el = document.querySelector(".myz-zen-target-keep");
  el && el.classList.remove("myz-zen-target-keep");
  try {
    const ancestors = Array.isArray(window.__myzZenAncestors)
      ? window.__myzZenAncestors
      : [];
    ancestors.forEach((node) => node.classList.remove("myz-zen-ancestor-keep"));
    document.body.classList.remove("myz-zen-ancestor-keep");
  } catch (err) {
    console.warn("[Zen] Error during cleanup:", err);
  }

  return true;
}

export function toggleZenMode(): "on" | "off" | "error" {
  if (isZenModeEnabled()) {
    disableZenMode();
    return "off";
  }
  const ok = enableZenMode();
  return ok ? "on" : "error";
}

/** Chrome caps canvas dimensions; larger captures are stitched in batches. */
const MAX_CAPTURE_DIM = 16384;
const MAX_CAPTURE_AREA = MAX_CAPTURE_DIM * MAX_CAPTURE_DIM;

interface ZenCaptureGeometry {
  left: number;
  top: number;
  totalWidth: number;
  totalHeight: number;
  viewport: { width: number; height: number };
  rows: number;
  cols: number;
  dpr: number;
}

function measureZenCapture(target: Element): ZenCaptureGeometry {
  const rect = target.getBoundingClientRect();
  const viewport = { width: window.innerWidth, height: window.innerHeight };
  const totalWidth = Math.max(
    Math.ceil(target.scrollWidth || 0),
    Math.ceil(rect.width),
  );
  const totalHeight = Math.max(
    Math.ceil(target.scrollHeight || 0),
    Math.ceil(rect.height),
  );
  return {
    left: Math.max(0, Math.floor(rect.left + window.scrollX)),
    top: Math.max(0, Math.floor(rect.top + window.scrollY)),
    totalWidth,
    totalHeight,
    viewport,
    rows: Math.max(1, Math.ceil(totalHeight / viewport.height)),
    cols: Math.max(1, Math.ceil(totalWidth / viewport.width)),
    dpr: window.devicePixelRatio || 1,
  };
}

interface CapturedSelection {
  selection: Selection | null;
  ranges: Range[];
}

/** Clears the page selection so it does not paint into the screenshots. */
async function suspendSelection(): Promise<CapturedSelection> {
  const selection = window.getSelection();
  const ranges: Range[] = [];
  if (selection && !selection.isCollapsed) {
    for (let index = 0; index < selection.rangeCount; index += 1) {
      ranges.push(selection.getRangeAt(index).cloneRange());
    }
    selection.removeAllRanges();
    await waitForNextPaint();
  }
  return { selection, ranges };
}

function restoreSelection(state: CapturedSelection): void {
  const { selection, ranges } = state;
  if (!selection || !ranges.length) return;
  try {
    ranges.forEach((range) => {
      try {
        selection.addRange(range);
      } catch (error) {
        // A range may be detached after the capture scroll; skip it.
        console.debug("MyZ: failed to restore capture selection range", error);
      }
    });
  } catch (error) {
    console.debug("MyZ: failed to restore capture selection", error);
  }
}

/** Scrolls through one viewport batch and returns the stitched canvas. */
async function captureZenBatch(
  geometry: ZenCaptureGeometry,
  rowStart: number,
  colStart: number,
  rowsInBatch: number,
  colsInBatch: number,
): Promise<HTMLCanvasElement> {
  const { left, top, totalWidth, totalHeight, viewport, dpr } = geometry;
  const batchPixelW = Math.ceil(colsInBatch * viewport.width * dpr);
  const batchPixelH = Math.ceil(rowsInBatch * viewport.height * dpr);
  const areaOk = batchPixelW * batchPixelH <= MAX_CAPTURE_AREA;
  const stitched = document.createElement("canvas");
  stitched.width = areaOk
    ? batchPixelW
    : Math.min(batchPixelW, MAX_CAPTURE_DIM);
  stitched.height = areaOk
    ? batchPixelH
    : Math.min(batchPixelH, MAX_CAPTURE_DIM);
  const ctx = stitched.getContext("2d");

  for (let r = 0; r < rowsInBatch; r++) {
    for (let c = 0; c < colsInBatch; c++) {
      const globalRow = rowStart + r;
      const globalCol = colStart + c;
      const tileLeftAbs = left + globalCol * viewport.width;
      const tileTopAbs = top + globalRow * viewport.height;
      window.scrollTo(tileLeftAbs, tileTopAbs);
      await waitForNextPaint();
      const dataUrl = await captureVisiblePngWithThrottle();
      if (!dataUrl) continue;
      // Account for scroll clamping at edges by using actual offsets.
      const vx = Math.max(0, tileLeftAbs - window.scrollX);
      const vy = Math.max(0, tileTopAbs - window.scrollY);
      const remainingW = totalWidth - globalCol * viewport.width;
      const remainingH = totalHeight - globalRow * viewport.height;
      const tileW = Math.min(viewport.width - vx, remainingW);
      const tileH = Math.min(viewport.height - vy, remainingH);
      const { canvas } = await cropToCanvas(
        dataUrl,
        { left: vx, top: vy, width: tileW, height: tileH } as DOMRect,
        viewport,
      );
      ctx?.drawImage(
        canvas,
        0,
        0,
        canvas.width,
        canvas.height,
        Math.floor(c * viewport.width * dpr),
        Math.floor(r * viewport.height * dpr),
        Math.floor(tileW * dpr),
        Math.floor(tileH * dpr),
      );
    }
  }
  return stitched;
}

export async function captureZenTargetFull() {
  try {
    const target = getZenTargetElement();
    if (!target) return;
    const geometry = measureZenCapture(target);
    const { viewport, rows, cols, dpr } = geometry;
    const suspended = await suspendSelection();
    const originalScroll = { x: window.scrollX, y: window.scrollY };
    const maxColsPerImage = Math.max(
      1,
      Math.floor(MAX_CAPTURE_DIM / Math.ceil(viewport.width * dpr)),
    );
    const maxRowsPerImage = Math.max(
      1,
      Math.floor(MAX_CAPTURE_DIM / Math.ceil(viewport.height * dpr)),
    );

    for (let rowStart = 0; rowStart < rows; rowStart += maxRowsPerImage) {
      const rowsInBatch = Math.min(maxRowsPerImage, rows - rowStart);
      for (let colStart = 0; colStart < cols; colStart += maxColsPerImage) {
        const colsInBatch = Math.min(maxColsPerImage, cols - colStart);
        const stitched = await captureZenBatch(
          geometry,
          rowStart,
          colStart,
          rowsInBatch,
          colsInBatch,
        );
        await stageCapturedImage({
          dataUrl: stitched.toDataURL("image/png"),
          width: stitched.width,
          height: stitched.height,
          name: `${buildSimpleName("screenshot")}-${rowStart}-${colStart}`,
          sourceKind: "screenshot",
          sourceUrl: window.location.href,
        });
      }
    }
    window.scrollTo(originalScroll.x, originalScroll.y);
    restoreSelection(suspended);
  } catch (e) {
    console.error("captureZenTargetFull failed", e);
    throw e;
  }
}

const CJK_SERIF_FAMILY: Record<CjkRegion, string> = {
  sc: "Noto Serif SC",
  tc: "Noto Serif TC",
  hk: "Noto Serif HK",
  jp: "Noto Serif JP",
  kr: "Noto Serif KR",
};

function readToken(name: string, fallback: string): string {
  const root = getThemeRoot();
  if (!root || typeof getComputedStyle !== "function") {
    return fallback;
  }
  const value = getComputedStyle(root).getPropertyValue(name).trim();
  return value || fallback;
}

/**
 * §4.16 纸色跟随配色方案与深浅色。The host page cannot receive `:root`
 * variables without polluting it, so the resolved values are inlined. They are
 * read from the shadow mount point, which already carries the active theme.
 */
function readZenPalette() {
  return {
    bg: readToken("--myz-bg", "#f5f4ed"),
    text: readToken("--myz-text", "#141413"),
    accent: readToken("--myz-accent-text", "#1b365d"),
    surface2: readToken("--myz-surface-2", "#eceae0"),
  };
}

type ZenPalette = ReturnType<typeof readZenPalette>;

/** Page shell: background, the "hide everything else" rule and the target box. */
function zenLayoutCss(palette: ZenPalette): string {
  return `
html.myz-zen-enabled, html.myz-zen-enabled body {
  background: ${palette.bg} !important;
}
/* Hide all elements except target, its descendants, and marked ancestors */
html.myz-zen-enabled body *:not(.myz-zen-target-keep):not(.myz-zen-target-keep *):not(.myz-zen-ancestor-keep) {
  display: none !important;
}
/* Normalize ancestor containers to minimize layout influence and center target */
html.myz-zen-enabled .myz-zen-ancestor-keep {
  padding: 0 !important;
  margin: 0 !important;
  background: transparent !important;
  border: 0 !important;
  box-shadow: none !important;
  width: 100% !important;
  max-width: none !important;
  position: static !important;
}

html.myz-zen-enabled .myz-zen-target-keep {
  display: block !important;
  font-family: Newsreader, "${CJK_SERIF_FAMILY[detectCjkRegion()]}", serif !important;
  color: ${palette.text} !important;
  line-height: 1.8 !important;
  font-size: 18px !important;
  letter-spacing: 0.01em !important;
  max-width: 38em !important;
  margin: 0 auto !important;
  padding: 24px !important;
}
`;
}

/** Content typography: media, links, inline code and code blocks. */
function zenContentCss(palette: ZenPalette): string {
  return `
html.myz-zen-enabled .myz-zen-target-keep img, html.myz-zen-enabled .myz-zen-target-keep video, html.myz-zen-enabled .myz-zen-target-keep svg {
  max-width: 100% !important;
  height: auto !important;
}
html.myz-zen-enabled .myz-zen-target-keep a {
  color: ${palette.accent} !important;
  text-decoration: underline !important;
  text-decoration-color: color-mix(in srgb, ${palette.accent} 40%, transparent) !important;
}
html.myz-zen-enabled .myz-zen-target-keep code {
  font-family: "JetBrains Mono", ui-monospace, "SF Mono", Menlo, monospace !important;
  background: ${palette.surface2} !important;
  border-radius: 6px !important;
  padding: 0.15em 0.4em !important;
  font-size: 0.9em !important;
}
/* Block code: full-width surface, and no inline pill on the nested <code>. */
html.myz-zen-enabled .myz-zen-target-keep pre {
  display: block !important;
  width: auto !important;
  background: ${palette.surface2} !important;
  border-radius: 8px !important;
  padding: 12px 14px !important;
  overflow-x: auto !important;
  white-space: pre !important;
}
html.myz-zen-enabled .myz-zen-target-keep pre code {
  display: inline !important;
  background: transparent !important;
  border-radius: 0 !important;
  padding: 0 !important;
  font-size: 0.9em !important;
}
/* On small screens, let the target take full width */
@media (max-width: 768px) {
  html.myz-zen-enabled .myz-zen-target-keep {
    width: 100% !important;
  }
}
`;
}

/** Print: only the article, black on white, without page chrome. */
const ZEN_PRINT_CSS = `
@media print {
  html.myz-zen-enabled body *:not(.myz-zen-target-keep):not(.myz-zen-target-keep *):not(.myz-zen-ancestor-keep) {
    display: none !important;
  }
  html.myz-zen-enabled .myz-zen-target-keep {
    margin: 0 !important;
    padding: 0 !important;
    color: #000 !important;
    background: #fff !important;
  }
}
`;

function buildZenCss(): string {
  // Pure CSS approach: hide everything except the marked target, its
  // descendants, and explicitly marked ancestors. Avoid :has() for broader
  // compatibility. §4.16 专注阅读: read serif + read tiers; the host page cannot
  // receive `:root` variables without polluting it, so values are inlined.
  const palette = readZenPalette();
  return `${zenLayoutCss(palette)}${zenContentCss(palette)}${ZEN_PRINT_CSS}`;
}
