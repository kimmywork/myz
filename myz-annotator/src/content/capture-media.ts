/**
 * Media capture helpers for the content script: import a page image, grab the
 * current video frame, and stage the result into the plugin's capture cache.
 *
 * Every path degrades gracefully:
 *   - page image: background fetch (host permissions beat CORS) → canvas draw →
 *     `captureVisibleTab` crop of the element;
 *   - video frame: canvas draw of the playing frame → `captureVisibleTab` crop
 *     (a clean frame without the player chrome).
 *
 * A copy is always downloaded (existing behaviour) and staged; the clipboard
 * write is best-effort because it needs a live user gesture.
 */
import { sendMessage } from "@myz/shared/messaging";
import {
  captureVisiblePngWithThrottle,
  cropToCanvas,
  downloadImage,
} from "./image";
import { useNotificationStore } from "./stores/notification-store";
import { buildSimpleName, buildVideoName } from "@/stitch/filename";
import {
  STAGED_ASSET_THUMB_EDGE,
  estimateDataUrlBytes,
  type NewStagedAsset,
  type StagedAssetKind,
} from "@/stitch/staged-asset";

interface CapturedPayload {
  dataUrl: string;
  width: number;
  height: number;
  mime: string;
}

export interface StageImageInput {
  dataUrl: string;
  width?: number;
  height?: number;
  mime?: string;
  name: string;
  sourceKind: StagedAssetKind;
  sourceUrl?: string;
  /** Download a copy (default true, preserves the pre-existing behaviour). */
  download?: boolean;
  /** Best-effort system-clipboard copy (default false). */
  copy?: boolean;
}

const MIME_EXTENSIONS: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/avif": "avif",
};

const MIN_CROP_EDGE = 4;

// ── Public entry points ─────────────────────────────────────────────────────

/** Import an image shown on the page (right-click → save). */
export async function capturePageImage(srcUrl?: string): Promise<void> {
  const notify = useNotificationStore();
  try {
    const image = findImageElement(srcUrl);
    const resolvedSrc = srcUrl || image?.currentSrc || image?.src || "";
    let payload = resolvedSrc ? await fetchViaBackground(resolvedSrc) : null;
    if (!payload && resolvedSrc) {
      payload = await drawUrlToPayload(resolvedSrc, image ?? undefined);
    }
    if (!payload && image) {
      payload = await cropElementFromViewport(image);
    }
    if (!payload) {
      notify.notify({ message: "无法获取该图片" });
      return;
    }
    await stageCapturedImage({
      ...payload,
      name: buildSimpleName("image"),
      sourceKind: "image",
      sourceUrl: resolvedSrc,
      copy: true,
    });
    notify.notify({ message: "已保存到图片缓存区" });
  } catch (error) {
    console.error("MyZ: capturePageImage failed", error);
    notify.notify({ message: "图片保存失败" });
  }
}

/** Grab the currently displayed frame of a video (right-click → capture). */
export async function captureVideoFrame(srcUrl?: string): Promise<void> {
  const notify = useNotificationStore();
  try {
    const video = findVideoElement(srcUrl);
    if (!video) {
      notify.notify({ message: "未找到可截取的视频" });
      return;
    }
    let payload = drawVideoToPayload(video);
    if (!payload) {
      payload = await cropElementFromViewport(video);
    }
    if (!payload) {
      notify.notify({ message: "无法截取视频画面" });
      return;
    }
    const src = srcUrl || video.currentSrc || video.src;
    await stageCapturedImage({
      ...payload,
      name: buildVideoName(src),
      sourceKind: "video-frame",
      sourceUrl: src,
    });
    notify.notify({ message: "已截取当前视频帧" });
  } catch (error) {
    console.error("MyZ: captureVideoFrame failed", error);
    notify.notify({ message: "视频截帧失败" });
  }
}

/**
 * Download + stage an already-rendered image. Shared by the selection and
 * article captures so every capture path lands in the cache.
 */
export async function stageCapturedImage(
  input: StageImageInput,
): Promise<string | null> {
  const mime = input.mime || mimeFromDataUrl(input.dataUrl);
  const name = ensureExtension(input.name, mime);
  if (input.download !== false) {
    try {
      downloadImage(input.dataUrl, name);
    } catch (error) {
      console.warn("MyZ: download failed", error);
    }
  }
  if (input.copy) {
    void copyImageToClipboard(input.dataUrl, mime);
  }
  try {
    const thumb = await makeThumb(input.dataUrl);
    const result = await sendMessage<NewStagedAsset, { id: string }>(
      "myz:stageAsset",
      {
        name,
        mime,
        width: input.width ?? 0,
        height: input.height ?? 0,
        dataUrl: input.dataUrl,
        thumb,
        sourceKind: input.sourceKind,
        sourceUrl: input.sourceUrl,
        size: estimateDataUrlBytes(input.dataUrl),
      },
    );
    return result?.id ?? null;
  } catch (error) {
    console.warn("MyZ: staging failed", error);
    return null;
  }
}

// ── Payload producers ───────────────────────────────────────────────────────

async function fetchViaBackground(
  url: string,
): Promise<CapturedPayload | null> {
  try {
    const result = await sendMessage<
      { url: string },
      { dataUrl: string; mime: string }
    >("myz:fetchAsset", { url });
    if (!result?.dataUrl) return null;
    const size = await measureImage(result.dataUrl);
    if (!size.width || !size.height) return null;
    return {
      dataUrl: result.dataUrl,
      width: size.width,
      height: size.height,
      mime: result.mime || mimeFromDataUrl(result.dataUrl),
    };
  } catch (error) {
    console.debug("MyZ: background fetch failed", error);
    return null;
  }
}

async function drawUrlToPayload(
  url: string,
  existing?: HTMLImageElement,
): Promise<CapturedPayload | null> {
  const image = existing ?? (await loadImageElement(url, true));
  if (!image) return null;
  const width = image.naturalWidth || image.width;
  const height = image.naturalHeight || image.height;
  if (!width || !height) return null;
  try {
    const canvas = drawSourceToCanvas(image, width, height);
    return {
      dataUrl: canvas.toDataURL("image/png"),
      width,
      height,
      mime: "image/png",
    };
  } catch (error) {
    // Tainted canvas (cross-origin without CORS) — fall back to a tab crop.
    console.debug("MyZ: canvas draw tainted", error);
    return null;
  }
}

function drawVideoToPayload(video: HTMLVideoElement): CapturedPayload | null {
  const width = video.videoWidth;
  const height = video.videoHeight;
  if (!width || !height) return null;
  try {
    const canvas = drawSourceToCanvas(video, width, height);
    return {
      dataUrl: canvas.toDataURL("image/png"),
      width,
      height,
      mime: "image/png",
    };
  } catch (error) {
    console.debug("MyZ: video frame tainted", error);
    return null;
  }
}

/** Crop the element's on-screen rectangle out of a viewport screenshot. */
async function cropElementFromViewport(
  element: Element,
): Promise<CapturedPayload | null> {
  const rect = element.getBoundingClientRect();
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const left = Math.max(0, Math.floor(rect.left));
  const top = Math.max(0, Math.floor(rect.top));
  const width = Math.min(viewportWidth - left, Math.ceil(rect.width));
  const height = Math.min(viewportHeight - top, Math.ceil(rect.height));
  if (width < MIN_CROP_EDGE || height < MIN_CROP_EDGE) return null;
  try {
    const screenshot = await captureVisiblePngWithThrottle();
    const { canvas } = await cropToCanvas(
      screenshot,
      { left, top, width, height } as DOMRect,
      { width: viewportWidth, height: viewportHeight },
    );
    return {
      dataUrl: canvas.toDataURL("image/png"),
      width: canvas.width,
      height: canvas.height,
      mime: "image/png",
    };
  } catch (error) {
    console.debug("MyZ: viewport crop failed", error);
    return null;
  }
}

// ── Element lookup ──────────────────────────────────────────────────────────

function findImageElement(srcUrl?: string): HTMLImageElement | null {
  const images = Array.from(document.images) as HTMLImageElement[];
  if (srcUrl) {
    const match = images.find(
      (image) => image.currentSrc === srcUrl || image.src === srcUrl,
    );
    if (match) return match;
  }
  const visible = images.filter(
    (image) => image.naturalWidth > 0 && isVisible(image),
  );
  return visible.sort((a, b) => elementArea(b) - elementArea(a))[0] ?? null;
}

function findVideoElement(srcUrl?: string): HTMLVideoElement | null {
  const videos = Array.from(
    document.querySelectorAll("video"),
  ) as HTMLVideoElement[];
  if (!videos.length) return null;
  if (srcUrl) {
    const match = videos.find(
      (video) => video.currentSrc === srcUrl || video.src === srcUrl,
    );
    if (match) return match;
  }
  const playing = videos.find(
    (video) => !video.paused && !video.ended && video.videoWidth > 0,
  );
  if (playing) return playing;
  const visible = videos.filter(
    (video) => video.videoWidth > 0 && isVisible(video),
  );
  return (
    visible.sort((a, b) => elementArea(b) - elementArea(a))[0] ?? videos[0]
  );
}

function isVisible(element: Element): boolean {
  const rect = element.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return false;
  const style = window.getComputedStyle(element);
  if (style.visibility === "hidden" || style.display === "none") return false;
  return (
    rect.bottom > 0 &&
    rect.right > 0 &&
    rect.top < window.innerHeight &&
    rect.left < window.innerWidth
  );
}

function elementArea(element: Element): number {
  const rect = element.getBoundingClientRect();
  return rect.width * rect.height;
}

// ── Small utilities ─────────────────────────────────────────────────────────

function drawSourceToCanvas(
  source: HTMLImageElement | HTMLVideoElement | HTMLCanvasElement,
  width: number,
  height: number,
): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas context is unavailable");
  context.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas;
}

function loadImageElement(
  url: string,
  cors: boolean,
): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const image = new Image();
    if (cors) image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = url;
  });
}

async function measureImage(
  dataUrl: string,
): Promise<{ width: number; height: number }> {
  const image = await loadImageElement(dataUrl, false);
  if (!image) return { width: 0, height: 0 };
  return {
    width: image.naturalWidth || image.width,
    height: image.naturalHeight || image.height,
  };
}

async function makeThumb(dataUrl: string): Promise<string> {
  const image = await loadImageElement(dataUrl, false);
  if (!image) return dataUrl;
  try {
    const longest = Math.max(image.naturalWidth, image.naturalHeight) || 1;
    const scale = Math.min(1, STAGED_ASSET_THUMB_EDGE / longest);
    const width = Math.max(1, Math.round(image.naturalWidth * scale));
    const height = Math.max(1, Math.round(image.naturalHeight * scale));
    const canvas = drawSourceToCanvas(image, width, height);
    return canvas.toDataURL("image/webp", 0.72);
  } catch {
    return dataUrl;
  }
}

async function copyImageToClipboard(
  dataUrl: string,
  mime: string,
): Promise<void> {
  try {
    if (typeof ClipboardItem === "undefined" || !navigator.clipboard?.write) {
      return;
    }
    const blob = await (await fetch(dataUrl)).blob();
    const type = blob.type || mime;
    await navigator.clipboard.write([new ClipboardItem({ [type]: blob })]);
  } catch (error) {
    // Needs a live user gesture / focused document; not every capture has one.
    console.debug("MyZ: clipboard image write failed", error);
  }
}

function mimeFromDataUrl(dataUrl: string): string {
  const match = /^data:([^;,]+)[;,]/.exec(dataUrl);
  return match?.[1] ?? "image/png";
}

function ensureExtension(name: string, mime: string): string {
  if (/\.[a-z0-9]{2,5}$/i.test(name)) return name;
  return `${name}.${MIME_EXTENSIONS[mime] ?? "png"}`;
}
