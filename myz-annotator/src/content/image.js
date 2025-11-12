export function getSelectionBoundingRect(range) {
  const rects = Array.from(range.getClientRects()).filter(
    (rect) => rect.width && rect.height,
  );
  if (!rects.length) {
    const fallback = range.getBoundingClientRect();
    if (!fallback || !fallback.width || !fallback.height) {
      return null;
    }
    return {
      top: fallback.top,
      left: fallback.left,
      right: fallback.right,
      bottom: fallback.bottom,
      width: fallback.width,
      height: fallback.height,
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
  return {
    top: bounds.top,
    left: bounds.left,
    right: bounds.right,
    bottom: bounds.bottom,
    width: bounds.right - bounds.left,
    height: bounds.bottom - bounds.top,
  };
}

export async function cropAndDownloadSelection(dataUrl, rect, captureViewport) {
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
  const cropped = canvas.toDataURL("image/png");
  downloadImage(cropped, `myz-selection-${Date.now()}.png`);
}

function loadImage(dataUrl) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Failed to load screenshot"));
    image.src = dataUrl;
  });
}

export function downloadImage(dataUrl, filename) {
  const anchor = document.createElement("a");
  anchor.href = dataUrl;
  anchor.download = filename;
  anchor.click();
}

export async function cropToCanvas(dataUrl, rect, captureViewport) {
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
