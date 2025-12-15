import {
  AIContextOptions,
  captureAiPageContext,
  clearAiPageChunkAnchors,
  scrollToAiChunk,
} from "./ai-page-context";
import { extractPageContentForAi } from "./content-extraction.ts";
import {
  buildHighlightStateSnapshot,
  focusHighlight,
  restoreHighlights,
} from "./highlight-state.ts";
import { waitForNextPaint } from "./html.ts";
import {
  cropAndDownloadSelection,
  cropToCanvas,
  downloadImage,
} from "./image.ts";
import { useNotificationStore } from "./stores/notification-store.ts";
import { hasArticleElement } from "./zen.ts";
import { toggleZenMode, getZenTargetElement } from "./zen.ts";

export interface MessagePayload {
  type: string;
  payload?: AIContextOptions | any;
}

let __myzLastCaptureAt = 0;

export function messageListener(
  message: MessagePayload,
  sender: chrome.runtime.MessageSender,
  sendResponse: (response?: any) => void,
) {
  const notificationStore = useNotificationStore();
  if (!message || !message.type) {
    return false;
  }
  if (message.type === "myz:canEnterZenMode") {
    try {
      const ok = hasArticleElement();
      sendResponse?.({ ok: true, data: { canEnter: ok } });
    } catch (e) {
      sendResponse?.({ ok: false });
    }
    return false;
  }
  if (message.type === "myz:getZenModeState") {
    try {
      const enabled =
        document.documentElement.classList.contains("myz-zen-enabled");
      sendResponse?.({ ok: true, data: { enabled } });
    } catch (e) {
      sendResponse?.({ ok: false });
    }
    return false;
  }
  if (message.type === "myz:toggleZenMode") {
    if (!hasArticleElement()) {
      notificationStore.notify({
        message: "未检测到 article 元素，无法进入禅定模式",
      });
      sendResponse?.({ ok: false });
      return false;
    }
    const state = toggleZenMode();
    if (state === "on") {
      notificationStore.notify({
        message: "已进入禅定模式",
      });
    } else if (state === "off") {
      notificationStore.notify({
        message: "已退出禅定模式",
      });
    } else {
      notificationStore.notify({
        message: "切换禅定模式失败",
      });
    }
    sendResponse?.({ ok: state !== "error" });
    try {
      chrome.runtime?.sendMessage?.({ type: "myz:zenModeStateChanged" });
    } catch {}
    return false;
  }
  if (message.type === "myz:scrollToHighlight") {
    const id = message.payload?.id;
    const success = focusHighlight(id);
    sendResponse?.({ ok: success });
    return false;
  }
  if (message.type === "myz:captureAiPageContext") {
    try {
      const data = captureAiPageContext(message.payload || {});
      sendResponse?.({ ok: true, data });
    } catch (error) {
      console.error("Failed to capture AI context", error);
      sendResponse?.({ ok: false, error: (error as Error).message });
    }
    return false;
  }
  if (message.type === "myz:scrollToAiChunk") {
    const chunkId = message.payload?.chunkId;
    const snippet = message.payload?.snippet || "";
    const success = scrollToAiChunk(chunkId, snippet);
    sendResponse?.({ ok: success, data: { success } });
    return false;
  }
  if (message.type === "myz:clearAiPageChunks") {
    clearAiPageChunkAnchors();
    sendResponse?.({ ok: true });
    return false;
  }
  if (message.type === "myz:refreshHighlights") {
    restoreHighlights()
      .then(() => sendResponse?.({ ok: true }))
      .catch((error) => {
        console.error("Refresh highlights failed", error);
        sendResponse?.({ ok: false });
      });
    return true;
  }
  if (message.type === "myz:getHighlightState") {
    sendResponse?.({ ok: true, data: buildHighlightStateSnapshot() });
    return false;
  }
  if (message.type === "myz:getZenTargetBounds") {
    try {
      const target = getZenTargetElement();
      if (!target) {
        sendResponse?.({ ok: true, data: { rect: null } });
        return false;
      }
      const r = target.getBoundingClientRect();
      sendResponse?.({
        ok: true,
        data: {
          rect: {
            top: r.top,
            left: r.left,
            width: r.width,
            height: r.height,
          },
          viewport: {
            width: window.innerWidth,
            height: window.innerHeight,
          },
        },
      });
    } catch (e) {
      sendResponse?.({ ok: false });
    }
    return true;
  }
  if (message.type === "myz:downloadCropped") {
    (async () => {
      try {
        const { dataUrl, rect, viewport } = message.payload || {};
        if (!dataUrl || !rect) {
          sendResponse?.({ ok: false });
          return;
        }
        await cropAndDownloadSelection(dataUrl, rect, viewport);
        sendResponse?.({ ok: true });
      } catch (e) {
        console.error("Download cropped failed", e);
        sendResponse?.({ ok: false });
      }
    })();
    return true;
  }
  if (message.type === "myz:captureZenTargetFull") {
    (async () => {
      try {
        const target = getZenTargetElement();
        if (!target) return;
        const rect = target.getBoundingClientRect();
        const elementAbsLeft = Math.max(
          0,
          Math.floor(rect.left + window.scrollX),
        );
        const elementAbsTop = Math.max(
          0,
          Math.floor(rect.top + window.scrollY),
        );
        const totalWidth = Math.max(
          Math.ceil(target.scrollWidth || 0),
          Math.ceil(rect.width),
        );
        const totalHeight = Math.max(
          Math.ceil(target.scrollHeight || 0),
          Math.ceil(rect.height),
        );
        const viewport = {
          width: window.innerWidth,
          height: window.innerHeight,
        };
        const rows = Math.max(1, Math.ceil(totalHeight / viewport.height));
        const cols = Math.max(1, Math.ceil(totalWidth / viewport.width));
        const dpr2 = window.devicePixelRatio || 1;
        const MAX_DIM = 16384; // device pixels
        const MAX_AREA = 16384 * 16384;

        // Preserve and clear selection to avoid highlight artifacts in screenshots
        const selection = window.getSelection();
        const storedRanges = [];
        if (selection && !selection.isCollapsed) {
          for (let index = 0; index < selection.rangeCount; index += 1) {
            storedRanges.push(selection.getRangeAt(index).cloneRange());
          }
          selection.removeAllRanges();
          await waitForNextPaint();
        }

        const originalScroll = { x: window.scrollX, y: window.scrollY };
        const maxColsPerImage = Math.max(
          1,
          Math.floor(MAX_DIM / Math.ceil(viewport.width * dpr2)),
        );
        const maxRowsPerImage = Math.max(
          1,
          Math.floor(MAX_DIM / Math.ceil(viewport.height * dpr2)),
        );

        for (let rowStart = 0; rowStart < rows; rowStart += maxRowsPerImage) {
          const rowsInBatch = Math.min(maxRowsPerImage, rows - rowStart);
          for (let colStart = 0; colStart < cols; colStart += maxColsPerImage) {
            const colsInBatch = Math.min(maxColsPerImage, cols - colStart);
            const batchPixelW = Math.ceil(colsInBatch * viewport.width * dpr2);
            const batchPixelH = Math.ceil(rowsInBatch * viewport.height * dpr2);
            const areaOk = batchPixelW * batchPixelH <= MAX_AREA;
            const canvasW = areaOk
              ? batchPixelW
              : Math.min(batchPixelW, MAX_DIM);
            const canvasH = areaOk
              ? batchPixelH
              : Math.min(batchPixelH, MAX_DIM);
            const stitched = document.createElement("canvas");
            stitched.width = canvasW;
            stitched.height = canvasH;
            const ctx = stitched.getContext("2d");

            for (let r = 0; r < rowsInBatch; r++) {
              for (let c = 0; c < colsInBatch; c++) {
                const globalRow = rowStart + r;
                const globalCol = colStart + c;
                const tileLeftAbs = elementAbsLeft + globalCol * viewport.width;
                const tileTopAbs = elementAbsTop + globalRow * viewport.height;
                window.scrollTo(tileLeftAbs, tileTopAbs);
                await waitForNextPaint();
                const dataUrl = await captureVisiblePngWithThrottle();
                if (!dataUrl) continue;
                // Account for scroll clamping at edges by using actual offsets
                const actualLeft = window.scrollX;
                const actualTop = window.scrollY;
                const expectedLeft = tileLeftAbs;
                const expectedTop = tileTopAbs;
                const vx = Math.max(0, expectedLeft - actualLeft);
                const vy = Math.max(0, expectedTop - actualTop);
                const remainingW = totalWidth - globalCol * viewport.width;
                const remainingH = totalHeight - globalRow * viewport.height;
                const tileW = Math.min(viewport.width - vx, remainingW);
                const tileH = Math.min(viewport.height - vy, remainingH);
                const { canvas } = await cropToCanvas(
                  dataUrl,
                  { left: vx, top: vy, width: tileW, height: tileH } as DOMRect,
                  viewport,
                );
                const destX = Math.floor(c * viewport.width * dpr2);
                const destY = Math.floor(r * viewport.height * dpr2);
                const destW = Math.floor(tileW * dpr2);
                const destH = Math.floor(tileH * dpr2);
                ctx?.drawImage(
                  canvas,
                  0,
                  0,
                  canvas.width,
                  canvas.height,
                  destX,
                  destY,
                  destW,
                  destH,
                );
              }
            }
            downloadImage(
              stitched.toDataURL("image/png"),
              `myz-article-${Date.now()}-${rowStart}-${colStart}.png`,
            );
          }
        }
        window.scrollTo(originalScroll.x, originalScroll.y);

        // Restore selection if cleared
        if (selection && storedRanges.length) {
          try {
            storedRanges.forEach((storedRange) => {
              try {
                selection.addRange(storedRange);
              } catch {}
            });
          } catch {}
        }
      } catch (e) {
        console.error("captureZenTargetFull failed", e);
      }
    })();
    return false;
  }
  if (message.type === "myz:extractPageContent") {
    try {
      const result = extractPageContentForAi();
      sendResponse?.({ ok: true, data: result });
    } catch (e) {
      console.error("Extract page content failed", e);
      sendResponse?.({ ok: false, error: (e as Error).message });
    }
    return false;
  }
  if (message.type === "myz:getSelection") {
    try {
      const selection = window.getSelection();
      const text = selection ? selection.toString().trim() : "";
      sendResponse?.({ ok: true, data: { text } });
    } catch (e) {
      console.error("Get selection failed", e);
      sendResponse?.({ ok: false, error: (e as Error).message });
    }
    return false;
  }
  if (message.type === "myz:getSelection") {
    try {
      const selection = window.getSelection();
      const text = selection ? selection.toString().trim() : "";
      sendResponse?.({ ok: true, data: { text } });
    } catch (e) {
      console.error("Get selection failed", e);
      sendResponse?.({ ok: false });
    }
    return false;
  }
  if (message.type === "myz:capturePageFull") {
    (async () => {
      try {
        const viewport = {
          width: window.innerWidth,
          height: window.innerHeight,
        };
        const totalWidth = Math.max(
          document.documentElement.scrollWidth,
          document.body.scrollWidth,
          viewport.width,
        );
        const totalHeight = Math.max(
          document.documentElement.scrollHeight,
          document.body.scrollHeight,
          viewport.height,
        );
        const rows = Math.max(1, Math.ceil(totalHeight / viewport.height));
        const cols = Math.max(1, Math.ceil(totalWidth / viewport.width));
        const dpr2 = window.devicePixelRatio || 1;
        const MAX_DIM = 16384; // device pixels
        const MAX_AREA = 16384 * 16384;
        const originalScroll = { x: window.scrollX, y: window.scrollY };

        const maxColsPerImage = Math.max(
          1,
          Math.floor(MAX_DIM / Math.ceil(viewport.width * dpr2)),
        );
        const maxRowsPerImage = Math.max(
          1,
          Math.floor(MAX_DIM / Math.ceil(viewport.height * dpr2)),
        );

        for (let rowStart = 0; rowStart < rows; rowStart += maxRowsPerImage) {
          const rowsInBatch = Math.min(maxRowsPerImage, rows - rowStart);
          for (let colStart = 0; colStart < cols; colStart += maxColsPerImage) {
            const colsInBatch = Math.min(maxColsPerImage, cols - colStart);
            const batchPixelW = Math.ceil(colsInBatch * viewport.width * dpr2);
            const batchPixelH = Math.ceil(rowsInBatch * viewport.height * dpr2);
            const areaOk = batchPixelW * batchPixelH <= MAX_AREA;
            const canvasW = areaOk
              ? batchPixelW
              : Math.min(batchPixelW, MAX_DIM);
            const canvasH = areaOk
              ? batchPixelH
              : Math.min(batchPixelH, MAX_DIM);
            const stitched = document.createElement("canvas");
            stitched.width = canvasW;
            stitched.height = canvasH;
            const ctx = stitched.getContext("2d");

            for (let r = 0; r < rowsInBatch; r++) {
              for (let c = 0; c < colsInBatch; c++) {
                const globalRow = rowStart + r;
                const globalCol = colStart + c;
                const tileLeftAbs = globalCol * viewport.width;
                const tileTopAbs = globalRow * viewport.height;
                window.scrollTo(tileLeftAbs, tileTopAbs);
                await waitForNextPaint();
                const dataUrl = await captureVisiblePngWithThrottle();
                if (!dataUrl) continue;
                // Use actual scroll offsets to avoid losing the final portion
                // when the browser clamps scroll to maxY/maxX on the last tiles.
                const actualLeft = window.scrollX;
                const actualTop = window.scrollY;
                const expectedLeft = globalCol * viewport.width;
                const expectedTop = globalRow * viewport.height;
                const vx = Math.max(0, expectedLeft - actualLeft);
                const vy = Math.max(0, expectedTop - actualTop);
                const tileW = Math.min(
                  viewport.width - vx,
                  totalWidth - expectedLeft,
                );
                const tileH = Math.min(
                  viewport.height - vy,
                  totalHeight - expectedTop,
                );
                const { canvas } = await cropToCanvas(
                  dataUrl,
                  { left: vx, top: vy, width: tileW, height: tileH },
                  viewport,
                );
                // Place at the expected grid position; crop accounts for offset
                const destX = Math.floor(c * viewport.width * dpr2);
                const destY = Math.floor(r * viewport.height * dpr2);
                const destW = Math.floor(tileW * dpr2);
                const destH = Math.floor(tileH * dpr2);
                ctx?.drawImage(
                  canvas,
                  0,
                  0,
                  canvas.width,
                  canvas.height,
                  destX,
                  destY,
                  destW,
                  destH,
                );
              }
            }
            downloadImage(
              stitched.toDataURL("image/png"),
              `myz-page-${Date.now()}-${rowStart}-${colStart}.png`,
            );
          }
        }
        window.scrollTo(originalScroll.x, originalScroll.y);
      } catch (e) {
        console.error("capturePageFull failed", e);
      }
    })();
    return false;
  }
  return false;
}
async function captureVisiblePngWithThrottle(maxRetries = 4) {
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
// Capture throttling helpers
function sleep(ms: number) {
  return new Promise((res) => setTimeout(res, ms));
}
