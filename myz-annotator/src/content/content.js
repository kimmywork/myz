import contentStyles from "./content.css?raw";
import { createApp } from "vue";
import ToolbarApp from "./components/Toolbar.jsx";
import ModalApp from "./components/Modal.jsx";
import InspectorApp from "./components/Inspector.jsx";
import NotificationsApp from "./components/Notifications.jsx";

import { sendMessage, addMessageListener } from "./messaging.js";
import {
  getRecordKind,
  RECORD_KINDS,
  recordToMarkdown,
} from "../dashboard/utils/records.js";
import {
  normalizeHighlightStyle,
  HIGHLIGHT_STYLE_OPTIONS,
  DEFAULT_COLORS,
  HIGHLIGHT_STYLES,
  DEFAULT_HIGHLIGHT_STYLE,
  normalizeRecord,
  isClipRecord,
  isHighlightRecord,
} from "../shared/highlightUtils.js";

import { serializeRangeToHtml } from "./html.js";
import {
  getSelectionBoundingRect,
  cropAndDownloadSelection,
  downloadImage,
  cropToCanvas,
} from "./image.js";
import {
  hasArticleElement,
  toggleZenMode,
  isZenModeEnabled,
  getZenTargetElement,
} from "./zen.js";
import {
  isNodeFromMyz,
  charOffsetWithinElement,
  nodeForCharOffset,
  unwrapNode,
  serializeRange,
  deserializeRange,
} from "../shared/serializer.js";

import {
  extractPageContentForAi,
  extractSelectedTextSafely,
} from "./content-extraction.js";
import {
  captureAiPageContext,
  scrollToAiChunk,
  clearAiPageChunkAnchors,
} from "./ai-page-context.js";

import {
  canonicalUrl,
  buildUrlAliases,
  extractArchiveInfo,
} from "../shared/url.js";

(() => {
  if (window.__myzAnnotatorInitialized) {
    return;
  }
  window.__myzAnnotatorInitialized = true;
  const CANONICAL_URL = canonicalUrl(window.location.href);

  // Keep a handle to our injected style.
  let contentStyleElement = null;

  ensureContentStyles();

  const highlightCache = new Map();
  const unreachableHighlights = new Set();

  function ensureContentStyles() {
    const doc = document;
    const existing = doc.querySelector('style[data-myz-annotator-style="1"]');
    if (existing) {
      contentStyleElement = existing;
      return existing;
    }
    const style = doc.createElement("style");
    style.setAttribute("data-myz-annotator-style", "1");
    style.textContent = contentStyles;
    (doc.head || doc.documentElement).appendChild(style);
    contentStyleElement = style;
    return style;
  }

  function createShadowHost(tag = "div") {
    const host = document.createElement(tag);
    host.setAttribute("data-myz-host", "1");
    const shadow = host.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = contentStyles;
    shadow.appendChild(style);
    const mountPoint = document.createElement("div");
    shadow.appendChild(mountPoint);
    document.documentElement.appendChild(host);
    return { host, shadow, mountPoint };
  }

  function computeHighlightStats() {
    let highlightCount = 0;
    let savedCount = 0;
    highlightCache.forEach((record) => {
      if (isClipRecord(record)) {
        savedCount += 1;
      } else {
        highlightCount += 1;
      }
    });
    return {
      highlightCount,
      savedCount,
      total: highlightCount + savedCount,
    };
  }

  function applyArchivePreferences(settings, status) {
    const hasSettings = settings && typeof settings === "object";
    const enabled = hasSettings
      ? Boolean(settings.internetArchiveEnabled)
      : state.archiveFeatureEnabled;
    state.archiveFeatureEnabled = enabled;
    if (status && typeof status === "object") {
      state.archiveStatus = status;
    } else if (!enabled) {
      state.archiveStatus = null;
    }
    const saved = Boolean(state.archiveStatus?.saved);
    state.archiveDefaultOptIn = enabled && !saved;
    if (hasSettings) {
      state.archiveSettingsLoaded = true;
    }
  }

  function mergeArchiveResult(result) {
    if (!result || typeof result !== "object") {
      return;
    }
    state.archiveStatus = result;
    const saved = Boolean(result.saved);
    state.archiveDefaultOptIn = state.archiveFeatureEnabled && !saved;
  }

  function storeRecord(record) {
    if (!record || !record.id) {
      return null;
    }
    const normalized = normalizeRecord(record);
    highlightCache.set(normalized.id, normalized);
    return normalized;
  }

  const HIGHLIGHT_REAPPLY_INTERVAL = 1200;
  const HIGHLIGHT_REAPPLY_TIMEOUT = 20000;
  const NOTIFICATION_DEFAULT_DURATION = 6000;

  const highlightReapplyState = {
    pending: new Set(),
    timerId: null,
    observer: null,
    deadline: 0,
    tickHandle: null,
    failureNotified: false,
    deadlineListenerAttached: false,
    deadlineListener: null,
  };

  const { element: toolbar } = createToolbar();
  const modal = mountModal();
  const inspector = mountInspector();
  const notifications = mountNotifications();
  const interestState = new Map();
  let interestObserver = null;
  let interestMutationObserver = null;
  let interestRescanTimer = null;
  let interestPopupHost = null;
  let interestIndicatorsHost = null;
  const interestMatchesByRecord = new Map();
  const interestElementIndicators = new Map();
  let interestPopupCollapsed = false;
  let interestDockPosition = { top: 0.75, left: null, right: 0.05 };
  let indicatorUpdateScheduled = false;
  let interestTempRectKeyId = 0;

  let scrollUpdateHandle = null;

  const state = {
    currentRange: null,
    currentText: "",
    currentHtml: "",
    editingId: null,
    inspectingId: null,
    toolbarShownAt: 0,
    toolbarRange: null,
    formKind: RECORD_KINDS.HIGHLIGHT,
    archiveFeatureEnabled: false,
    archiveDefaultOptIn: false,
    archiveStatus: null,
    archiveSettingsLoaded: false,
  };

  const TOOLBAR_MIN_VIEWPORT_GAP = 12;
  const TOOLBAR_VERTICAL_OFFSET_RATIO = 1.5; // Keep in sync with CSS translateY percentage.

  init().catch((error) => console.error("MyZ Annotator init failed", error));

  async function init() {
    document.addEventListener("mouseup", handleSelectionTrigger);
    document.addEventListener("keyup", handleSelectionTrigger);
    document.addEventListener("scroll", handleScrollWhileSelecting, true);
    window.addEventListener("scroll", handleScrollWhileSelecting, {
      capture: true,
      passive: true,
    });
    window.addEventListener("resize", handleScrollWhileSelecting, {
      passive: true,
    });
    window.addEventListener("scroll", scheduleIndicatorUpdate, {
      passive: true,
    });
    window.addEventListener("resize", scheduleIndicatorUpdate, {
      passive: true,
    });
    document.addEventListener("click", handleDocumentClick, true);
    document.addEventListener("selectionchange", () => {
      const selection = window.getSelection();
      if (!selection || selection.isCollapsed) {
        hideToolbar();
        return;
      }
      if (selection.toString().trim()) {
        state.toolbarRange = selection.getRangeAt(0).cloneRange();
        maybeShowToolbarForActiveSelection();
      }
    });

    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
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
          showNotification("未检测到 article 元素，无法进入禅定模式");
          sendResponse?.({ ok: false });
          return false;
        }
        const state = toggleZenMode();
        if (state === "on") {
          showNotification("已进入禅定模式");
        } else if (state === "off") {
          showNotification("已退出禅定模式");
        } else {
          showNotification("切换禅定模式失败");
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
          sendResponse?.({ ok: false, error: error.message });
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

            for (
              let rowStart = 0;
              rowStart < rows;
              rowStart += maxRowsPerImage
            ) {
              const rowsInBatch = Math.min(maxRowsPerImage, rows - rowStart);
              for (
                let colStart = 0;
                colStart < cols;
                colStart += maxColsPerImage
              ) {
                const colsInBatch = Math.min(maxColsPerImage, cols - colStart);
                const batchPixelW = Math.ceil(
                  colsInBatch * viewport.width * dpr2,
                );
                const batchPixelH = Math.ceil(
                  rowsInBatch * viewport.height * dpr2,
                );
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
                    const tileLeftAbs =
                      elementAbsLeft + globalCol * viewport.width;
                    const tileTopAbs =
                      elementAbsTop + globalRow * viewport.height;
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
                    const remainingH =
                      totalHeight - globalRow * viewport.height;
                    const tileW = Math.min(viewport.width - vx, remainingW);
                    const tileH = Math.min(viewport.height - vy, remainingH);
                    const { canvas } = await cropToCanvas(
                      dataUrl,
                      { left: vx, top: vy, width: tileW, height: tileH },
                      viewport,
                    );
                    const destX = Math.floor(c * viewport.width * dpr2);
                    const destY = Math.floor(r * viewport.height * dpr2);
                    const destW = Math.floor(tileW * dpr2);
                    const destH = Math.floor(tileH * dpr2);
                    ctx.drawImage(
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
          sendResponse?.({ ok: false, error: e.message });
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
          sendResponse?.({ ok: false, error: e.message });
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

            for (
              let rowStart = 0;
              rowStart < rows;
              rowStart += maxRowsPerImage
            ) {
              const rowsInBatch = Math.min(maxRowsPerImage, rows - rowStart);
              for (
                let colStart = 0;
                colStart < cols;
                colStart += maxColsPerImage
              ) {
                const colsInBatch = Math.min(maxColsPerImage, cols - colStart);
                const batchPixelW = Math.ceil(
                  colsInBatch * viewport.width * dpr2,
                );
                const batchPixelH = Math.ceil(
                  rowsInBatch * viewport.height * dpr2,
                );
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
                    ctx.drawImage(
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
    });

    // Capture throttling helpers
    let __myzLastCaptureAt = 0;
    function sleep(ms) {
      return new Promise((res) => setTimeout(res, ms));
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
        const resp = await new Promise((resolve) => {
          try {
            chrome.runtime.sendMessage(
              { type: "myz:captureSelection", payload: { format: "png" } },
              (r) => resolve(r),
            );
          } catch (e) {
            resolve(null);
          }
        });
        __myzLastCaptureAt = Date.now();
        if (resp && resp.ok && resp.data && resp.data.dataUrl) {
          return resp.data.dataUrl;
        }
        await sleep(700 + attempt * 250);
      }
      throw new Error("capture throttled or failed");
    }

    // E2E/testing bridge: allow toggling via window.postMessage without chrome.runtime
    window.addEventListener("message", (event) => {
      const data = event?.data;
      if (!data || data.__myz_e2e__ !== true) return;
      if (data.type === "toggleZenMode") {
        if (!hasArticleElement()) return;
        toggleZenMode();
        try {
          window.postMessage(
            {
              __myz_e2e__: true,
              type: "zenModeState",
              enabled: isZenModeEnabled(),
            },
            "*",
          );
        } catch {}
      } else if (data.type === "canEnterZenMode") {
        try {
          window.postMessage(
            {
              __myz_e2e__: true,
              type: "canEnterZenMode",
              canEnter: hasArticleElement(),
            },
            "*",
          );
        } catch {}
      }
    });

    // Attach SPA navigation listeners so we can re-run highlight restore when
    // single-page apps change the visible URL without a full reload.
    attachSpaNavigationListeners();

    maybeShowToolbarForActiveSelection();

    await restoreHighlights();
    startInterestMonitoring();
  }

  // Keep track of the last canonical URL so we only re-run restoreHighlights
  // when the logical page changes.
  let lastKnownCanonical = CANONICAL_URL;

  function attachSpaNavigationListeners() {
    // Debounced handler to avoid thrashing during router transitions.
    let navTimer = null;
    function scheduleRestoreIfUrlChanged() {
      const nowCanonical = canonicalUrl(window.location.href);
      if (navTimer) {
        clearTimeout(navTimer);
      }
      navTimer = setTimeout(async () => {
        navTimer = null;
        // Re-run highlight restoration for the new route. Only update the
        // lastKnownCanonical if restore succeeds so we can retry on later
        // attempts if page content isn't ready yet.
        try {
          if (nowCanonical !== lastKnownCanonical) {
            resetInterestStateForNavigation();
          }
          await restoreHighlights();
          lastKnownCanonical = nowCanonical;
        } catch (err) {
          console.error("Failed to restore highlights after navigation", err);
        }
      }, 160);
    }

    // Patch history methods so we can detect programmatic navigation.
    try {
      const rawPush = history.pushState;
      const rawReplace = history.replaceState;
      history.pushState = function (...args) {
        const result = rawPush.apply(this, args);
        scheduleRestoreIfUrlChanged();
        return result;
      };
      history.replaceState = function (...args) {
        const result = rawReplace.apply(this, args);
        scheduleRestoreIfUrlChanged();
        return result;
      };
    } catch (error) {
      // Ignore if content security or readonly history in some environments.
    }

    // Also listen to popstate and hashchange
    window.addEventListener("popstate", scheduleRestoreIfUrlChanged);
    window.addEventListener("hashchange", scheduleRestoreIfUrlChanged);

    startLocationObserver(scheduleRestoreIfUrlChanged);
  }

  function maybeShowToolbarForActiveSelection() {
    try {
      const selection = window.getSelection();
      if (!selection || selection.isCollapsed) {
        return;
      }
      const text = selection.toString().trim();
      if (!text) {
        return;
      }
      const range = selection.getRangeAt(0);
      const rect = getSelectionBoundingRect(range);
      if (!rect || (rect.width === 0 && rect.height === 0)) {
        return;
      }
      state.toolbarRange = range.cloneRange();
      showToolbar(rect);
    } catch (error) {
      // Ignore selection errors (e.g. if no range is available).
    }
  }

  async function restoreHighlights() {
    try {
      ensureContentStyles();
      const currentUrl = window.location.href;
      const currentCanonical = canonicalUrl(currentUrl);
      const urlAliases = buildUrlAliases(currentUrl, currentCanonical);
      const [highlights, tagList, archiveStatus, settings] = await Promise.all([
        sendMessage("myz:getHighlightsForUrl", {
          url: currentCanonical,
          aliases: urlAliases,
        }),
        sendMessage("myz:getAllTags").catch((error) => {
          console.warn("Failed to load known tags", error);
          return null;
        }),
        sendMessage("myz:getArchiveStatusForUrl", {
          url: currentCanonical,
        }).catch((error) => {
          console.warn("Failed to load archive status", error);
          return null;
        }),
        sendMessage("myz:getSettings").catch((error) => {
          console.warn("Failed to load settings", error);
          return null;
        }),
      ]);

      applyArchivePreferences(settings, archiveStatus);

      if (Array.isArray(tagList)) {
        modal.setKnownTags?.(tagList);
      }

      inspector.hide?.();
      Array.from(document.querySelectorAll(".myz-highlight")).forEach((node) =>
        unwrapNode(node),
      );
      highlightCache.clear();
      unreachableHighlights.clear();
      resetHighlightReapplyState();

      const records = Array.isArray(highlights) ? highlights : [];
      records.forEach((record) => {
        const stored = storeRecord(record);
        if (!stored) {
          return;
        }
        modal.addKnownTags?.(stored.tags || []);
        if (isHighlightRecord(stored) && stored.range) {
          const applied = applyHighlight(stored);
          if (applied) {
            unreachableHighlights.delete(stored.id);
            removeHighlightFromPending(stored.id);
          } else if (stored?.id) {
            markHighlightForReapply(stored.id);
          }
        } else if (stored?.id) {
          unreachableHighlights.delete(stored.id);
          removeHighlightFromPending(stored.id);
        }
      });
      // Update badge/indicators for the (current) page after restore.
      updateHighlightIndicators();
    } catch (error) {
      console.error("Failed to restore highlights", error);
      highlightCache.clear();
      unreachableHighlights.clear();
      updateHighlightIndicators();
    }
  }

  function startLocationObserver(callback) {
    if (typeof callback !== "function") {
      return;
    }
    let rafId = null;
    let lastHref = window.location.href;
    const check = () => {
      const currentHref = window.location.href;
      if (currentHref !== lastHref) {
        lastHref = currentHref;
        callback();
      }
      rafId = window.requestAnimationFrame(check);
    };
    rafId = window.requestAnimationFrame(check);
    window.addEventListener(
      "beforeunload",
      () => {
        if (rafId) {
          window.cancelAnimationFrame(rafId);
          rafId = null;
        }
      },
      { once: true },
    );
  }

  function handleSelectionTrigger(event) {
    if (modal?.isVisible?.()) {
      return;
    }
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || !selection.toString().trim()) {
      hideToolbar();
      return;
    }
    const range = selection.getRangeAt(0);
    const rect = getSelectionBoundingRect(range);
    if (!rect || (rect.width === 0 && rect.height === 0)) {
      hideToolbar();
      return;
    }
    state.toolbarRange = range.cloneRange();
    showToolbar(rect);
  }

  function showToolbar(rect) {
    const scrollY = window.scrollY || document.documentElement.scrollTop;
    const scrollX = window.scrollX || document.documentElement.scrollLeft;
    toolbar.classList.remove("myz-hidden");
    const toolbarHeight = toolbar.offsetHeight || 0;
    const offsetY = toolbarHeight * TOOLBAR_VERTICAL_OFFSET_RATIO;
    const minTop = scrollY + TOOLBAR_MIN_VIEWPORT_GAP + offsetY;
    const topPosition = Math.max(rect.top + scrollY, minTop);
    toolbar.style.top = `${topPosition}px`;
    toolbar.style.left = `${rect.left + scrollX + rect.width / 2}px`;
    state.toolbarShownAt = Date.now();
  }

  function hideToolbar() {
    if (scrollUpdateHandle) {
      cancelAnimationFrame(scrollUpdateHandle);
      scrollUpdateHandle = null;
    }
    toolbar.classList.add("myz-hidden");
    state.toolbarShownAt = 0;
    state.toolbarRange = null;
  }

  function handleDocumentClick(event) {
    const highlightEl = event.target.closest(".myz-highlight");
    if (highlightEl) {
      event.stopPropagation();
      const highlightId = highlightEl.dataset.highlightId;
      const record = highlightCache.get(highlightId);
      if (record) {
        inspector.showRecord?.(record);
        focusHighlight(highlightId);
      }
      return;
    }

    const targetNode = event.target;
    const insideMyzHost =
      (targetNode?.closest && targetNode.closest("[data-myz-host]")) ||
      (targetNode?.getRootNode &&
        targetNode.getRootNode().host &&
        targetNode.getRootNode().host.matches?.("[data-myz-host]"));
    if (insideMyzHost) {
      return;
    }

    if (state.toolbarShownAt && Date.now() - state.toolbarShownAt < 250) {
      return;
    }

    hideToolbar();
  }

  function handleScrollWhileSelecting() {
    if (scrollUpdateHandle) {
      cancelAnimationFrame(scrollUpdateHandle);
    }
    scrollUpdateHandle = requestAnimationFrame(() => {
      scrollUpdateHandle = null;
      if (toolbar.classList.contains("myz-hidden")) {
        return;
      }
      if (modal?.isVisible?.()) {
        return;
      }
      const selection = window.getSelection();
      if (selection && !selection.isCollapsed && selection.toString().trim()) {
        state.toolbarRange = selection.getRangeAt(0).cloneRange();
      }
      const range = state.toolbarRange;
      if (!range) {
        hideToolbar();
        return;
      }
      const rect = getSelectionBoundingRect(range);
      if (!rect) {
        hideToolbar();
        return;
      }
      const viewportWidth =
        window.innerWidth || document.documentElement.clientWidth || 0;
      const viewportHeight =
        window.innerHeight || document.documentElement.clientHeight || 0;
      const outsideViewport =
        rect.bottom < 0 ||
        rect.top > viewportHeight ||
        rect.right < 0 ||
        rect.left > viewportWidth;
      if (outsideViewport) {
        hideToolbar();
        return;
      }
      showToolbar(rect);
    });
  }

  function createToolbar() {
    const { host, shadow, mountPoint } = createShadowHost();
    const app = createApp(ToolbarApp, {
      onAnnotate: handleAnnotateClick,
      onClip: handleClipClick,
      onCapture: handleScreenshotClick,
    });
    app.mount(mountPoint);
    const rendered = shadow.querySelector(".myz-annotator-toolbar");
    return { host, element: rendered || mountPoint };
  }

  function updateHighlightIndicators() {
    syncBadgeWithBackground();
  }

  function syncBadgeWithBackground() {
    let isTopLevel = false;
    try {
      isTopLevel = window.top === window;
    } catch (error) {
      isTopLevel = false;
    }
    if (!isTopLevel) {
      return;
    }
    const stats = computeHighlightStats();
    sendMessage("myz:updateBadge", {
      count: stats.total,
      total: stats.total,
      highlightCount: stats.highlightCount,
      savedCount: stats.savedCount,
    }).catch(() => {});
  }

  function handleAnnotateClick() {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) {
      hideToolbar();
      return;
    }
    const liveRange = selection.getRangeAt(0);
    // Client-side guard: if selection intersects an existing highlight wrapper,
    // notify the user immediately and avoid opening the create modal.
    try {
      const existing = Array.from(document.querySelectorAll(".myz-highlight"));
      for (const el of existing) {
        try {
          if (liveRange.intersectsNode(el)) {
            showNotification("所选文本包含已有标注，无法创建新的标注");
            hideToolbar();
            return;
          }
        } catch (e) {
          // ignore intersection errors and continue
        }
      }
    } catch (e) {
      // ignore DOM query errors
    }
    state.currentRange = liveRange.cloneRange();
    state.toolbarRange = liveRange.cloneRange();
    state.currentText = selection.toString().trim();
    state.currentHtml = serializeRangeToHtml(state.currentRange);
    state.editingId = null;
    openModal({
      mode: "create",
      editingId: null,
      preview: selection.toString().trim(),
      note: "",
      tags: [],
      color: null,
      style: null,
      kind: RECORD_KINDS.HIGHLIGHT,
    });
  }

  function handleClipClick() {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) {
      hideToolbar();
      return;
    }
    const liveRange = selection.getRangeAt(0);
    state.currentRange = liveRange.cloneRange();
    state.toolbarRange = liveRange.cloneRange();
    state.currentText = selection.toString().trim();
    state.currentHtml = serializeRangeToHtml(state.currentRange);
    state.editingId = null;
    state.formKind = RECORD_KINDS.CLIP;
    openModal({
      mode: "create",
      preview: selection.toString().trim(),
      note: "",
      tags: [],
      color: null,
      style: null,
      kind: RECORD_KINDS.CLIP,
    });
  }

  function mountModal() {
    const { host, mountPoint } = createShadowHost();

    const app = createApp(ModalApp, {
      onClose: handleModalClose,
      onSubmit: handleModalSubmit,
      onDelete: handleModalDelete,
    });

    const instance = app.mount(mountPoint);

    return {
      host,
      open: (options) => instance.open(options),
      hide: () => instance.hide(),
      isVisible: () => instance.isVisible(),
      addKnownTags: (tags) => instance.addKnownTags(tags),
      setKnownTags: (tags) => instance.setKnownTags(tags),
      contains: (node) => host.contains(node),
    };
  }

  function mountInspector() {
    const { host, mountPoint } = createShadowHost();

    const app = createApp(InspectorApp, {
      highlightStyleOptions: HIGHLIGHT_STYLE_OPTIONS,
      getRecordKind,
      normalizeHighlightStyle,
      resolveHighlightColor,
      onClose: handleInspectorClose,
      onCopy: handleInspectorCopy,
      onEdit: handleInspectorEdit,
      onDelete: handleInspectorDelete,
      onShown: handleInspectorShown,
      onHidden: handleInspectorHidden,
    });

    const instance = app.mount(mountPoint);

    return {
      host,
      showRecord: (record) => instance.showRecord(record),
      hide: (options) => instance.hide(options),
      isVisible: () => instance.isVisible(),
      getCurrentId: () => instance.getCurrentId(),
      contains: (node) => host.contains(node),
    };
  }

  function mountNotifications() {
    const { host, mountPoint } = createShadowHost();

    const app = createApp(NotificationsApp);
    const instance = app.mount(mountPoint);

    return {
      host,
      notify: (options) => instance.notify(options),
    };
  }

  function handleInspectorClose() {
    state.inspectingId = null;
  }

  async function handleInspectorCopy() {
    const id = state.inspectingId || inspector.getCurrentId?.();
    if (!id) {
      return;
    }
    const record = highlightCache.get(id);
    if (!record) {
      return;
    }
    const markdown = recordToMarkdown(record);
    try {
      await navigator.clipboard.writeText(markdown);
    } catch (error) {
      console.error("Clipboard copy failed", error);
    }
  }

  function handleInspectorEdit() {
    const id = state.inspectingId || inspector.getCurrentId?.();
    if (!id) {
      return;
    }
    const record = highlightCache.get(id);
    if (!record) {
      return;
    }
    state.editingId = record.id;
    openModal({
      mode: "edit",
      editingId: record.id,
      preview: record.text,
      note: record.note || "",
      tags: record.tags || [],
      color: record.color || DEFAULT_COLORS[0],
      style: record.style,
      kind: getRecordKind(record),
    });
  }

  function handleInspectorDelete() {
    const id = state.inspectingId || inspector.getCurrentId?.();
    if (!id) {
      return;
    }
    deleteHighlight(id);
  }

  function handleInspectorShown(id) {
    state.inspectingId = id || null;
  }

  function handleInspectorHidden() {
    state.inspectingId = null;
  }

  function openModal(options) {
    const kind =
      options.kind === RECORD_KINDS.CLIP
        ? RECORD_KINDS.CLIP
        : RECORD_KINDS.HIGHLIGHT;
    const initialTags = Array.isArray(options.tags)
      ? options.tags.filter(Boolean)
      : options.tags
        ? [options.tags]
        : [];
    const archiveEnabledForModal =
      kind === RECORD_KINDS.HIGHLIGHT &&
      state.archiveFeatureEnabled &&
      options?.mode !== "edit";
    const saveToArchiveDefault =
      typeof options?.saveToArchive === "boolean"
        ? options.saveToArchive
        : archiveEnabledForModal && state.archiveDefaultOptIn;
    const archiveStatusPayload = archiveEnabledForModal
      ? state.archiveStatus
      : null;

    modal.open({
      mode: options.mode,
      preview: options.preview,
      note: options.note,
      tags: initialTags,
      color: kind === RECORD_KINDS.HIGHLIGHT ? options?.color : null,
      style: kind === RECORD_KINDS.HIGHLIGHT ? options?.style : null,
      kind,
      archiveEnabled: archiveEnabledForModal,
      saveToArchive: saveToArchiveDefault,
      archiveStatus: archiveStatusPayload,
    });
    modal?.addKnownTags?.(initialTags);
  }

  function closeModal({ fromComponent = false } = {}) {
    if (!fromComponent) {
      modal.hide();
    }
    state.currentRange = null;
    state.currentText = "";
    state.currentHtml = "";
    state.editingId = null;
    state.formKind = RECORD_KINDS.HIGHLIGHT;
  }

  async function handleModalSubmit(payload) {
    const kind =
      payload.kind === RECORD_KINDS.CLIP
        ? RECORD_KINDS.CLIP
        : RECORD_KINDS.HIGHLIGHT;
    const note = typeof payload.note === "string" ? payload.note.trim() : "";
    const tags = Array.isArray(payload.tags)
      ? payload.tags.filter(Boolean)
      : [];
    const saveToArchive = payload.saveToArchive === true;

    state.formKind = kind;

    const style = { color: DEFAULT_COLORS[0], style: DEFAULT_HIGHLIGHT_STYLE };

    if (kind === RECORD_KINDS.HIGHLIGHT) {
      const fallbackColor = DEFAULT_COLORS[0];
      style.color =
        typeof payload.color === "string" && payload.color.trim()
          ? payload.color.trim()
          : fallbackColor;
      style.style = normalizeHighlightStyle(
        payload.style || DEFAULT_HIGHLIGHT_STYLE,
      );
    }

    const currentUrl = window.location.href;
    const canonical = canonicalUrl(currentUrl);
    const archiveInfo = extractArchiveInfo(currentUrl);
    const originalSourceUrl = archiveInfo?.originalUrl || currentUrl;
    let hostname = window.location.hostname;
    try {
      hostname = new URL(originalSourceUrl).hostname || hostname;
    } catch (error) {
      // keep existing hostname fallback
    }
    const archiveUrl = archiveInfo ? currentUrl : null;
    const archiveTimestamp = archiveInfo?.timestamp || null;

    if (state.editingId) {
      const update = {
        id: state.editingId,
        note,
        tags,
        kind,
      };
      if (kind === RECORD_KINDS.HIGHLIGHT) {
        update.color = style.color;
        update.style = style.style;
      } else {
        update.color = null;
        update.range = null;
        update.style = null;
      }
      await updateExistingHighlight(update);
      closeModal();
      return;
    }

    if (!state.currentText) {
      closeModal();
      return;
    }

    const basePayload = {
      url: canonical,
      sourceUrl: originalSourceUrl,
      title: document.title,
      text: state.currentText,
      html: state.currentHtml || "",
      note,
      tags,
      hostname,
      kind,
    };

    if (archiveUrl) {
      basePayload.archiveUrl = archiveUrl;
      basePayload.archiveSnapshotUrl = archiveUrl;
      if (archiveTimestamp) {
        basePayload.archiveSnapshotTimestamp = archiveTimestamp;
      }
    }

    const selection = window.getSelection();
    try {
      if (kind === RECORD_KINDS.HIGHLIGHT) {
        if (!state.currentRange) {
          return;
        }
        const serializedRange = serializeRange(
          state.currentRange,
          highlightCache,
          applyHighlight,
        );
        if (!serializedRange) {
          return;
        }
        const payloadToSave = {
          ...basePayload,
          ...style,
          range: serializedRange,
        };
        const record = await sendMessage("myz:saveHighlight", payloadToSave);
        if (record) {
          const stored = storeRecord(record);
          if (stored) {
            const applied = applyHighlight(stored);
            if (applied) {
              unreachableHighlights.delete(stored.id);
              removeHighlightFromPending(stored.id);
            } else if (isHighlightRecord(stored)) {
              markHighlightForReapply(stored.id);
            }
            modal.addKnownTags?.(stored.tags || tags);
            updateHighlightIndicators();
            if (saveToArchive && state.archiveFeatureEnabled) {
              ensureArchiveSnapshotForCurrentPage().catch(() => {});
            }
          }
        }
      } else {
        const payloadToSave = {
          ...basePayload,
          color: null,
          style: null,
          range: null,
        };
        const record = await sendMessage("myz:saveHighlight", payloadToSave);
        if (record) {
          const stored = storeRecord(record);
          if (stored) {
            unreachableHighlights.delete(stored.id);
            removeHighlightFromPending(stored.id);
            modal.addKnownTags?.(stored.tags || tags);
            updateHighlightIndicators();
          }
        }
      }
    } catch (error) {
      console.error("Failed to save highlight", error);
    } finally {
      closeModal();
      selection?.removeAllRanges();
      hideToolbar();
    }
  }

  function handleModalClose() {
    closeModal({ fromComponent: true });
  }

  async function handleModalDelete() {
    if (state.editingId) {
      await deleteHighlight(state.editingId);
    }
    closeModal();
  }

  async function updateExistingHighlight(update) {
    try {
      const record = await sendMessage("myz:updateHighlight", update);
      if (!record) {
        return;
      }
      const stored = storeRecord(record);
      if (!stored) {
        return;
      }
      modal.addKnownTags?.(stored.tags || []);
      if (isHighlightRecord(stored)) {
        const nodes = document.querySelectorAll(
          `[data-highlight-id="${stored.id}"]`,
        );
        nodes.forEach((node) => {
          decorateHighlightElement(node, stored);
        });
      } else {
        removeHighlightFromDom(stored.id);
        unreachableHighlights.delete(stored.id);
        removeHighlightFromPending(stored.id);
      }
      if (state.inspectingId === stored.id) {
        inspector.showRecord?.(stored);
      }
      updateHighlightIndicators();
    } catch (error) {
      console.error("Failed to update highlight", error);
    }
  }

  async function deleteHighlight(id) {
    try {
      await sendMessage("myz:removeHighlight", { id });
      highlightCache.delete(id);
      removeHighlightFromPending(id);
      unreachableHighlights.delete(id);
      removeHighlightFromDom(id);
      if (state.inspectingId === id) {
        inspector.hide?.();
      }
      updateHighlightIndicators();
    } catch (error) {
      console.error("Failed to delete highlight", error);
    }
  }

  function applyHighlight(record) {
    if (!isHighlightRecord(record)) {
      return false;
    }
    if (!record?.range) {
      return false;
    }
    try {
      const range = deserializeRange(record.range);
      if (!range || range.collapsed) {
        return false;
      }
      removeHighlightFromDom(record.id);
      // Prefer wrapping by collecting and wrapping individual text-node
      // segments. This avoids cloning the whole fragment which can split
      // inline elements (links) and leave empty anchors when multiple
      // highlights are created in the same paragraph. Fall back to the
      // simple fragment-based wrapper if text-node wrapping doesn't apply.
      let applied = false;
      try {
        applied = wrapRangeAcrossNodes(range, record);
      } catch (e) {
        applied = false;
      }
      if (!applied) {
        applied = wrapSimpleRange(range, record);
      }
      if (applied) {
        return true;
      }
    } catch (error) {
      console.warn("Unable to apply highlight", error, record);
    }
    return false;
  }

  function resolveHighlightColor(color) {
    if (typeof color === "string") {
      const trimmed = color.trim();
      if (/^#[0-9a-fA-F]{6}$/.test(trimmed)) {
        return trimmed;
      }
    }
    return DEFAULT_COLORS[0];
  }

  function decorateHighlightElement(element, record) {
    if (!element) {
      return;
    }
    const style = normalizeHighlightStyle(record?.style);
    const color = resolveHighlightColor(record?.color);
    Object.values(HIGHLIGHT_STYLES).forEach((value) => {
      element.classList.remove(`myz-highlight--${value}`);
    });
    element.classList.add(`myz-highlight--${style}`);
    if (record?.id) {
      element.dataset.highlightId = record.id;
    }
    element.dataset.highlightStyle = style;
    element.style.setProperty("--myz-highlight-color", color);

    // Inline fallbacks so highlights remain visible even if the stylesheet is removed.
    element.style.backgroundColor = "transparent";
    element.style.textDecoration = "";
    element.style.textDecorationColor = "";
    element.style.textDecorationThickness = "";
    if (style === HIGHLIGHT_STYLES.PAINT) {
      element.style.backgroundColor = color;
    } else if (style === HIGHLIGHT_STYLES.UNDERLINE) {
      element.style.textDecoration = "underline";
      element.style.textDecorationColor = color;
      element.style.textDecorationThickness = "2px";
    } else if (style === HIGHLIGHT_STYLES.WAVY) {
      element.style.textDecoration = "underline wavy";
      element.style.textDecorationColor = color;
      element.style.textDecorationThickness = "2px";
    }
  }

  function createHighlightElement(record) {
    const highlight = document.createElement("span");
    highlight.className = "myz-highlight";
    decorateHighlightElement(highlight, record);
    return highlight;
  }

  function wrapSimpleRange(range, record) {
    const fragment = range.cloneContents();
    if (!fragment || !fragment.childNodes.length) {
      return false;
    }
    const highlight = createHighlightElement(record);
    highlight.appendChild(fragment);
    range.deleteContents();
    range.insertNode(highlight);
    return true;
  }

  function wrapRangeAcrossNodes(range, record) {
    const textNodes = collectTextNodes(range);
    if (!textNodes.length) {
      return false;
    }
    let applied = false;
    textNodes.forEach((node) => {
      const didWrap = wrapTextNodeSegment(node, range, record);
      applied = didWrap || applied;
    });
    return applied;
  }

  function collectTextNodes(range) {
    const nodes = [];
    const iterator = document.createNodeIterator(
      range.commonAncestorContainer,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode(node) {
          // Ignore nodes that belong to the extension UI or highlights
          if (isNodeFromMyz(node)) {
            return NodeFilter.FILTER_REJECT;
          }
          if (!range.intersectsNode(node)) {
            return NodeFilter.FILTER_REJECT;
          }
          if (!node.textContent || !node.textContent.trim()) {
            return NodeFilter.FILTER_REJECT;
          }
          return NodeFilter.FILTER_ACCEPT;
        },
      },
    );
    let current;
    while ((current = iterator.nextNode())) {
      nodes.push(current);
    }
    return nodes;
  }

  function wrapTextNodeSegment(node, range, record) {
    const offsets = computeSegmentOffsets(node, range);
    if (!offsets || offsets.end <= offsets.start) {
      return false;
    }
    let target = node;
    const length = node.textContent.length;
    if (offsets.end < length) target.splitText(offsets.end);
    if (offsets.start > 0) target = target.splitText(offsets.start);
    if (!target || !target.textContent.trim()) return false;
    const parent = target.parentNode;
    if (!parent) return false;
    const highlight = createHighlightElement(record);
    parent.insertBefore(highlight, target);
    highlight.appendChild(target);
    return true;
  }

  function computeSegmentOffsets(node, range) {
    const length = node.textContent.length;
    let start = 0;
    let end = length;

    if (node === range.startContainer) {
      start = range.startOffset;
    }
    if (node === range.endContainer) {
      end = range.endOffset;
    }

    const startPosition = range.startContainer.compareDocumentPosition(node);
    if (startPosition & Node.DOCUMENT_POSITION_FOLLOWING) {
      start = 0;
    }
    const endPosition = range.endContainer.compareDocumentPosition(node);
    if (endPosition & Node.DOCUMENT_POSITION_PRECEDING) {
      end = length;
    }

    start = Math.max(0, Math.min(start, length));
    end = Math.max(start, Math.min(end, length));
    return { start, end };
  }

  function focusHighlight(id) {
    if (!id) {
      return false;
    }
    const node = document.querySelector(`[data-highlight-id="${id}"]`);
    if (!node) {
      return false;
    }
    node.scrollIntoView({ behavior: "smooth", block: "center" });
    node.classList.add("myz-highlight--flash");
    setTimeout(() => node.classList.remove("myz-highlight--flash"), 1400);
    return true;
  }

  function removeHighlightFromDom(id) {
    const nodes = document.querySelectorAll(`[data-highlight-id="${id}"]`);
    nodes.forEach((node) => unwrapNode(node));
  }

  function markHighlightForReapply(id) {
    if (!id) {
      return;
    }
    highlightReapplyState.pending.add(id);
    highlightReapplyState.failureNotified = false;
    scheduleHighlightReapply();
  }

  function removeHighlightFromPending(id) {
    if (!id) {
      return;
    }
    if (
      highlightReapplyState.pending.delete(id) &&
      !highlightReapplyState.pending.size
    ) {
      cleanupHighlightReapply();
    }
  }

  function resetHighlightReapplyState() {
    highlightReapplyState.pending.clear();
    highlightReapplyState.failureNotified = false;
    cleanupHighlightReapply();
  }

  function scheduleHighlightReapply() {
    if (!highlightReapplyState.pending.size) {
      cleanupHighlightReapply();
      return;
    }
    ensureReapplyDeadline();
    queueHighlightReapply();
    if (!highlightReapplyState.timerId) {
      highlightReapplyState.timerId = setInterval(
        queueHighlightReapply,
        HIGHLIGHT_REAPPLY_INTERVAL,
      );
    }
    if (!highlightReapplyState.observer) {
      const target = document.body || document.documentElement;
      if (target) {
        highlightReapplyState.observer = new MutationObserver(() =>
          queueHighlightReapply(),
        );
        highlightReapplyState.observer.observe(target, {
          childList: true,
          subtree: true,
        });
      }
    }
  }

  function ensureReapplyDeadline() {
    if (highlightReapplyState.deadline) {
      return;
    }
    if (document.readyState === "complete") {
      highlightReapplyState.deadline = Date.now() + HIGHLIGHT_REAPPLY_TIMEOUT;
      return;
    }
    if (highlightReapplyState.deadlineListenerAttached) {
      return;
    }
    const handler = () => {
      if (document.readyState !== "complete") {
        return;
      }
      highlightReapplyState.deadline = Date.now() + HIGHLIGHT_REAPPLY_TIMEOUT;
      highlightReapplyState.deadlineListenerAttached = false;
      if (highlightReapplyState.deadlineListener) {
        document.removeEventListener(
          "readystatechange",
          highlightReapplyState.deadlineListener,
        );
        highlightReapplyState.deadlineListener = null;
      }
    };
    highlightReapplyState.deadlineListener = handler;
    highlightReapplyState.deadlineListenerAttached = true;
    document.addEventListener("readystatechange", handler);
  }

  function queueHighlightReapply() {
    if (!highlightReapplyState.pending.size) {
      cleanupHighlightReapply();
      return;
    }
    if (!highlightReapplyState.observer) {
      const target = document.body || document.documentElement;
      if (target) {
        highlightReapplyState.observer = new MutationObserver(() =>
          queueHighlightReapply(),
        );
        highlightReapplyState.observer.observe(target, {
          childList: true,
          subtree: true,
        });
      }
    }
    if (highlightReapplyState.tickHandle) {
      return;
    }
    highlightReapplyState.tickHandle = setTimeout(() => {
      highlightReapplyState.tickHandle = null;
      attemptHighlightReapply();
    }, 80);
  }

  function attemptHighlightReapply() {
    if (!highlightReapplyState.pending.size) {
      cleanupHighlightReapply();
      return;
    }
    const pendingIds = Array.from(highlightReapplyState.pending);
    let appliedThisRound = 0;
    pendingIds.forEach((id) => {
      const record = highlightCache.get(id);
      if (!record) {
        highlightReapplyState.pending.delete(id);
        return;
      }
      const applied = applyHighlight(record);
      if (applied) {
        highlightReapplyState.pending.delete(id);
        unreachableHighlights.delete(id);
        appliedThisRound += 1;
      }
    });

    if (!highlightReapplyState.pending.size) {
      cleanupHighlightReapply();
      return;
    }

    if (appliedThisRound > 0) {
      if (document.readyState === "complete") {
        highlightReapplyState.deadline = Date.now() + HIGHLIGHT_REAPPLY_TIMEOUT;
      } else {
        highlightReapplyState.deadline = 0;
        ensureReapplyDeadline();
      }
    }

    if (
      highlightReapplyState.deadline &&
      Date.now() > highlightReapplyState.deadline
    ) {
      const failedIds = Array.from(highlightReapplyState.pending);
      const remaining = failedIds.length;
      failedIds.forEach((id) => unreachableHighlights.add(id));
      highlightReapplyState.pending.clear();
      cleanupHighlightReapply();
      if (!highlightReapplyState.failureNotified && remaining > 0) {
        highlightReapplyState.failureNotified = true;
        console.warn("MyZ Annotator: failed to reapply highlights", {
          remaining,
        });
        const message =
          remaining === 1
            ? "部分标注无法定位，可能因为页面内容已改变。"
            : `有 ${remaining} 条标注无法定位，可能因为页面内容已改变。`;
        showNotification(message);
      }
    }
  }

  function cleanupHighlightReapply() {
    if (highlightReapplyState.timerId) {
      clearInterval(highlightReapplyState.timerId);
      highlightReapplyState.timerId = null;
    }
    if (highlightReapplyState.tickHandle) {
      clearTimeout(highlightReapplyState.tickHandle);
      highlightReapplyState.tickHandle = null;
    }
    if (highlightReapplyState.observer) {
      highlightReapplyState.observer.disconnect();
      highlightReapplyState.observer = null;
    }
    if (highlightReapplyState.deadlineListener) {
      document.removeEventListener(
        "readystatechange",
        highlightReapplyState.deadlineListener,
      );
      highlightReapplyState.deadlineListener = null;
    }
    highlightReapplyState.deadlineListenerAttached = false;
    highlightReapplyState.deadline = 0;
  }

  function showNotification(message, duration = NOTIFICATION_DEFAULT_DURATION) {
    if (!message) {
      return;
    }
    notifications.notify?.({ message, duration });
  }

  function buildHighlightStateSnapshot() {
    const unreachable = Array.from(unreachableHighlights).filter((id) =>
      highlightCache.has(id),
    );
    if (unreachable.length !== unreachableHighlights.size) {
      unreachableHighlights.clear();
      unreachable.forEach((id) => unreachableHighlights.add(id));
    }
    const stats = computeHighlightStats();
    return {
      count: stats.total,
      total: stats.total,
      highlightCount: stats.highlightCount,
      savedCount: stats.savedCount,
      unreachableIds: unreachable,
      unreachableCount: unreachable.length,
    };
  }

  async function ensureArchiveSnapshotForCurrentPage({ force = false } = {}) {
    if (!state.archiveFeatureEnabled) {
      return null;
    }
    const canonical = canonicalUrl(window.location.href);
    if (!canonical) {
      return null;
    }
    try {
      const result = await sendMessage("myz:ensureArchiveSnapshot", {
        url: canonical,
        force,
      });
      mergeArchiveResult(result);
      if (!result) {
        return null;
      }
      if (result.saved && result.status === "saved") {
        showNotification("页面已保存到 Internet Archive");
      } else if (result.status === "exists") {
        showNotification("Internet Archive 已存在该页面的存档");
      } else if (result.status === "pending") {
        showNotification("已提交保存请求，存档生成可能需要一些时间");
      }
      return result;
    } catch (error) {
      console.error("Internet Archive 保存失败", error);
      showNotification("保存到 Internet Archive 失败，请稍后重试");
      return null;
    }
  }

  function readCanonicalLinkHref() {
    try {
      const link = document.querySelector('link[rel="canonical"]');
      if (link && typeof link.href === "string" && link.href) {
        return link.href;
      }
    } catch (error) {
      // Ignore selector errors (e.g. if document access is restricted).
    }
    return null;
  }

  async function handleScreenshotClick() {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) {
      hideToolbar();
      return;
    }
    const range = selection.getRangeAt(0);
    const rect = getSelectionBoundingRect(range);
    if (!rect || rect.width < 4 || rect.height < 4) {
      hideToolbar();
      return;
    }

    const storedRanges = [];
    for (let index = 0; index < selection.rangeCount; index += 1) {
      storedRanges.push(selection.getRangeAt(index).cloneRange());
    }

    selection.removeAllRanges();
    await waitForNextPaint();

    try {
      const result = await sendMessage("myz:captureSelection", {
        format: "png",
      });
      if (!result || !result.dataUrl) {
        return;
      }
      await cropAndDownloadSelection(result.dataUrl, rect, {
        width: window.innerWidth,
        height: window.innerHeight,
      });
    } catch (error) {
      console.error("Selection capture failed", error);
    } finally {
      try {
        selection.removeAllRanges();
        storedRanges.forEach((storedRange) => {
          try {
            selection.addRange(storedRange);
          } catch (restoreError) {
            console.warn("Failed to restore selection range", restoreError);
          }
        });
      } catch (restoreError) {
        console.warn("Unable to restore selection", restoreError);
      }
      hideToolbar();
    }
  }

  function waitForNextPaint() {
    return new Promise((resolve) => {
      requestAnimationFrame(() => {
        requestAnimationFrame(resolve);
      });
    });
  }

  // -------- Vectoria interest surface --------
  const INTEREST_MIN_LENGTH = 80;
  const INTEREST_STAY_MS = 2000;
  const INTEREST_COOLDOWN_MS = 60_000;
  const INTEREST_SCORE_THRESHOLD = 0.32;
  const BLOCK_DISPLAY_SET = new Set([
    "block",
    "list-item",
    "flex",
    "grid",
    "table",
    "inline-block",
  ]);
  const BLOCK_TAG_SET = new Set([
    "P",
    "LI",
    "BLOCKQUOTE",
    "SECTION",
    "ARTICLE",
    "DIV",
    "UL",
    "OL",
  ]);

  function normalizeParagraphText(node) {
    if (!node) return "";
    return (node.innerText || node.textContent || "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function getElementPageRect(el) {
    const rect = el?.getBoundingClientRect?.();
    if (!rect) return null;
    return {
      left: rect.left + window.scrollX,
      top: rect.top + window.scrollY,
      width: rect.width,
      height: rect.height,
    };
  }

  function isRectValid(rect) {
    return (
      rect &&
      Number.isFinite(rect.left) &&
      Number.isFinite(rect.top) &&
      Number.isFinite(rect.width) &&
      Number.isFinite(rect.height) &&
      rect.width > 0 &&
      rect.height > 0
    );
  }

  function isElementVisible(el) {
    if (!el || !(el instanceof Element)) return false;
    const rects = el.getClientRects();
    if (!rects || rects.length === 0) return false;
    const style = getComputedStyle(el);
    if (style.display === "none" || style.visibility === "hidden") {
      return false;
    }
    return rects[0].width > 0 && rects[0].height > 0;
  }

  function isBlockElement(el) {
    if (!el || !(el instanceof Element)) return false;
    if (BLOCK_TAG_SET.has(el.tagName)) return true;
    const display = getComputedStyle(el).display;
    return BLOCK_DISPLAY_SET.has(display);
  }

  function isElementInViewport(el) {
    if (!el || !(el instanceof Element)) return false;
    const rect = el.getBoundingClientRect();
    if (!rect || rect.width === 0 || rect.height === 0) return false;
    const vw = window.innerWidth || document.documentElement.clientWidth || 0;
    const vh = window.innerHeight || document.documentElement.clientHeight || 0;
    return rect.bottom > 0 && rect.right > 0 && rect.top < vh && rect.left < vw;
  }

  function extractInlineText(el) {
    const parts = [];
    el.childNodes.forEach((node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        parts.push(node.textContent || "");
        return;
      }
      if (node.nodeType === Node.ELEMENT_NODE) {
        const child = node;
        if (isBlockElement(child)) {
          return;
        }
        parts.push(normalizeParagraphText(child));
      }
    });
    return parts.join(" ").replace(/\s+/g, " ").trim();
  }

  function collectLeafBlocks(maxCount = 300) {
    const results = [];
    const selected = new WeakSet();
    const walker = document.createTreeWalker(
      document.body || document.documentElement,
      NodeFilter.SHOW_ELEMENT,
    );
    const start = performance.now();
    let node;
    while ((node = walker.nextNode()) && results.length < maxCount) {
      if (!(node instanceof HTMLElement)) continue;
      if (!isElementVisible(node)) continue;
      if (!isBlockElement(node)) continue;
      if (hasSelectedAncestor(node, selected)) continue;

      const children = Array.from(node.children);
      const hasBlockChild = children.some((child) => isBlockElement(child));

      let text = "";
      if (hasBlockChild) {
        text = extractInlineText(node);
      } else {
        text = normalizeParagraphText(node);
      }

      if (text && text.length >= INTEREST_MIN_LENGTH) {
        results.push({ element: node, text });
        if (!hasBlockChild) {
          selected.add(node);
        }
      }
    }
    const duration = Math.round(performance.now() - start);
    console.log(
      "[MyZ Vectoria] collected candidates",
      results.length,
      "in",
      duration,
      "ms",
    );
    return results;
  }

  function hasSelectedAncestor(node, selected) {
    let current = node?.parentElement;
    while (current) {
      if (selected.has(current)) return true;
      current = current.parentElement;
    }
    return false;
  }

  function startInterestMonitoring() {
    if (!interestObserver) {
      interestObserver = new IntersectionObserver(handleInterestEntries, {
        threshold: 0.6,
      });
    }

    const targets = collectLeafBlocks();
    targets.forEach(({ element, text }) => {
      interestState.set(element, {
        text,
        timer: null,
        lastSearchAt: 0,
        searching: false,
      });
      interestObserver.observe(element);
    });

    if (!interestMutationObserver) {
      interestMutationObserver = new MutationObserver(scheduleInterestRescan);
      interestMutationObserver.observe(
        document.body || document.documentElement,
        {
          childList: true,
          subtree: true,
        },
      );
    }
  }

  function scheduleInterestRescan() {
    if (interestRescanTimer) return;
    interestRescanTimer = setTimeout(() => {
      interestRescanTimer = null;
      rescanInterestTargets();
    }, 600);
  }

  function rescanInterestTargets() {
    if (!interestObserver) return;
    // Clean up removed nodes
    Array.from(interestState.keys()).forEach((el) => {
      if (!document.contains(el)) {
        interestState.delete(el);
        try {
          interestObserver.unobserve(el);
        } catch {}
      }
    });
    const targets = collectLeafBlocks();
    let added = 0;
    targets.forEach(({ element, text }) => {
      if (interestState.has(element)) {
        return;
      }
      interestState.set(element, {
        text,
        timer: null,
        lastSearchAt: 0,
        searching: false,
      });
      interestObserver.observe(element);
      added += 1;
    });
    if (added > 0) {
      console.log("[MyZ Vectoria] rescan added", added, "new candidates");
    }
  }

  function handleInterestEntries(entries) {
    entries.forEach((entry) => {
      const el = entry.target;
      const state = interestState.get(el);
      if (!state) return;
      if (!entry.isIntersecting) {
        if (state.timer) {
          clearTimeout(state.timer);
          state.timer = null;
        }
        return;
      }
      if (state.timer || state.searching) {
        return;
      }
      state.timer = setTimeout(() => {
        state.timer = null;
        runSemanticLookup(el, state);
      }, INTEREST_STAY_MS);
    });
  }

  async function runSemanticLookup(element, state) {
    const now = Date.now();
    if (now - state.lastSearchAt < INTEREST_COOLDOWN_MS) {
      return;
    }
    const text = normalizeParagraphText(element);
    const finalText =
      (state?.text && state.text.trim().length ? state.text : text) || "";
    if (!finalText || finalText.length < INTEREST_MIN_LENGTH) {
      return;
    }
    state.lastSearchAt = now;
    state.searching = true;
    const startedAt = performance.now();
    let filtered = [];
    let hits = [];
    try {
      const trimmed =
        finalText.length > 800 ? `${finalText.slice(0, 800)}…` : finalText;
      const response = await sendMessage("myz:vectoriaSearch", {
        text: trimmed,
        topK: 3,
      });
      const results = Array.isArray(response?.results) ? response.results : [];
      const currentCanonical = canonicalUrl(window.location.href);
      filtered = results.filter((item) => {
        const targetUrl = item?.metadata?.url || "";
        const targetCanonical = canonicalUrl(targetUrl);
        // Exclude same-page matches
        if (targetCanonical && targetCanonical === currentCanonical) {
          return false;
        }
        return typeof item?.score === "number";
      });
      hits = filtered
        .filter(
          (item) =>
            typeof item?.score === "number" &&
            item.score >= INTEREST_SCORE_THRESHOLD,
        )
        .sort((a, b) => (b.score || 0) - (a.score || 0));
      if (hits.length) {
        updateInterestAggregates(hits, element);
        showInterestPopup();
      }
    } catch (error) {
      console.warn("Vectoria lookup failed", error);
    } finally {
      const duration = Math.round(performance.now() - startedAt);
      const topScore = hits.length ? hits[0].score || 0 : 0;
      console.log(
        "[MyZ Vectoria]",
        "queryLength=",
        finalText.length,
        "matches=",
        filtered.length,
        "topScore=",
        topScore.toFixed ? topScore.toFixed(3) : topScore,
        "timeMs=",
        duration,
      );
      state.searching = false;
    }
  }

  function ensureInterestPopupHost() {
    if (
      interestPopupHost &&
      document.contains(interestPopupHost) &&
      interestPopupHost.shadowRoot?.querySelector("#myz-interest-popup")
    ) {
      return interestPopupHost;
    }
    const host = document.createElement("div");
    host.setAttribute("data-myz-interest", "1");
    const shadow = host.attachShadow({ mode: "open" });
    const wrapper = document.createElement("div");
    wrapper.id = "myz-interest-popup";
    const style = document.createElement("style");
    style.textContent = `
      :host {
        all: initial;
      }
      #myz-interest-popup, #myz-interest-popup * {
        box-sizing: border-box;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
      }
      #myz-interest-popup {
        position: fixed;
        bottom: 20px;
        right: 20px;
        max-width: 340px;
        background: rgba(15,23,42,0.95);
        color: #f8fafc;
        border-radius: 14px;
        box-shadow: 0 18px 32px rgba(15,23,42,0.4);
        padding: 14px;
        font-size: 13px;
        z-index: 2147483645;
        pointer-events: auto;
      }
      #myz-interest-popup.collapsed {
        width: auto;
        height: auto;
        max-width: none;
        max-height: none;
        padding: 0;
        background: transparent;
        box-shadow: none;
        border-radius: 0;
      }
      #myz-interest-popup.collapsed .dock-button {
        width: 48px;
        height: 48px;
        border-radius: 50%;
        border: none;
        background: #4f46e5;
        color: #fff;
        box-shadow: 0 12px 22px rgba(79,70,229,0.38);
        font-size: 13px;
        font-weight: 700;
        cursor: move;
        user-select: none;
      }
      .myz-interest-header { display: grid; grid-template-columns: 1fr auto auto; align-items: center; gap: 8px; margin-bottom: 6px; }
      .myz-interest-title { font-weight: 700; font-size: 14px; }
      .myz-interest-badge {
        min-width: 24px;
        padding: 2px 8px;
        border-radius: 999px;
        background: rgba(255,255,255,0.12);
        color: #e0e7ff;
        font-weight: 600;
        font-size: 12px;
        text-align: center;
        justify-self: start;
      }
      .myz-interest-item { border-top: 1px solid rgba(255,255,255,0.08); padding: 8px 0; }
      .myz-interest-item:first-of-type { border-top: none; padding-top: 0; }
      .myz-interest-meta { font-size: 11px; color: #cbd5e1; margin-bottom: 4px; }
      .myz-interest-text { color: #e2e8f0; line-height: 1.4; margin-bottom: 6px; }
      .myz-interest-actions { display: flex; gap: 8px; }
      .myz-interest-btn {
        background: #4f46e5;
        color: white;
        border: none;
        border-radius: 10px;
        padding: 6px 10px;
        font-size: 12px;
        cursor: pointer;
      }
      .myz-interest-btn.secondary {
        background: rgba(255,255,255,0.12);
      }
      .myz-interest-close {
        background: transparent;
        border: none;
        color: #cbd5e1;
        cursor: pointer;
        font-size: 16px;
        line-height: 1;
        justify-self: end;
      }
      .myz-interest-footer {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        margin-top: 8px;
        font-size: 12px;
        color: #cbd5e1;
      }
      .myz-interest-link {
        color: #a5b4fc;
        text-decoration: underline;
        cursor: pointer;
      }
    `;
    shadow.appendChild(style);
    shadow.appendChild(wrapper);
    document.documentElement.appendChild(host);
    interestPopupHost = host;
    return host;
  }

  function showInterestPopup(element, matches) {
    const host = ensureInterestPopupHost();
    const shadow = host.shadowRoot;
    if (!shadow) return;
    const container = shadow.querySelector("#myz-interest-popup");
    if (!container) return;
    container.innerHTML = "";

    if (interestPopupCollapsed) {
      container.classList.add("collapsed");
      applyDockPosition(container);
      renderDock(container);
      return;
    }

    container.classList.remove("collapsed");
    container.style.top = "auto";
    container.style.left = "auto";
    container.style.right = "20px";
    container.style.bottom = "20px";

    const header = document.createElement("div");
    header.className = "myz-interest-header";
    const title = document.createElement("div");
    title.className = "myz-interest-title";
    title.textContent = "发现与你标注相关的内容";
    header.appendChild(title);
    const badgeCount = interestMatchesByRecord.size;
    const badge = document.createElement("div");
    badge.className = "myz-interest-badge";
    badge.textContent = badgeCount;
    header.appendChild(badge);
    container.appendChild(header);

    const closeBtn = document.createElement("button");
    closeBtn.className = "myz-interest-close";
    closeBtn.textContent = "×";
    closeBtn.onclick = (e) => {
      e?.stopPropagation?.();
      collapseInterestPopup();
    };
    header.appendChild(closeBtn);

    const sorted = Array.from(interestMatchesByRecord.values()).sort(
      (a, b) => (b.match.score || 0) - (a.match.score || 0),
    );
    const visibleMatches = sorted.filter(({ element }) =>
      isElementInViewport(element),
    );
    const topMatches = visibleMatches.slice(0, 5);
    const remaining = Math.max(sorted.length - topMatches.length, 0);

    topMatches.forEach(({ match, element }) => {
      const item = document.createElement("div");
      item.className = "myz-interest-item";
      const meta = document.createElement("div");
      meta.className = "myz-interest-meta";
      const hostLabel =
        match.metadata?.host || match.metadata?.url || "已保存的标注";
      meta.textContent = `${hostLabel} · 相似度 ${(match.score * 100).toFixed(1)}%`;
      const text = document.createElement("div");
      text.className = "myz-interest-text";
      const snippet = (match.text || "").slice(0, 140);
      text.textContent = snippet;
      const actions = document.createElement("div");
      actions.className = "myz-interest-actions";
      const viewBtn = document.createElement("button");
      viewBtn.className = "myz-interest-btn";
      viewBtn.textContent = "定位当前段落";
      viewBtn.onclick = () => handleInterestClick(match, element);
      const openPageBtn = document.createElement("button");
      openPageBtn.className = "myz-interest-btn secondary";
      openPageBtn.textContent = "打开页面";
      openPageBtn.onclick = () => {
        if (match.metadata?.url) {
          window.open(match.metadata.url, "_blank", "noopener");
        }
      };
      actions.appendChild(viewBtn);
      actions.appendChild(openPageBtn);
      item.appendChild(meta);
      item.appendChild(text);
      item.appendChild(actions);
      container.appendChild(item);
    });

    if (remaining > 0) {
      const footer = document.createElement("div");
      footer.className = "myz-interest-footer";
      const footerText = document.createElement("div");
      footerText.textContent = `还有 ${remaining} 条相关标注已统计`;
      const sideLink = document.createElement("span");
      sideLink.className = "myz-interest-link";
      sideLink.textContent = "侧边栏查看全部";
      sideLink.onclick = () =>
        openMatchesInSidepanel(sorted.map((m) => m.match));
      footer.appendChild(footerText);
      footer.appendChild(sideLink);
      container.appendChild(footer);
    }
  }

  function handleInterestClick(match, element) {
    const recordId = match.metadata?.recordId;
    const targetUrl = match.metadata?.url || "";
    const currentCanonical = canonicalUrl(window.location.href);
    const targetCanonical = canonicalUrl(targetUrl);

    // If same page match is filtered, rely on current element for positioning.
    if (element) {
      element.scrollIntoView({ behavior: "smooth", block: "center" });
      flashElement(element);
    } else if (match.rect && isRectValid(match.rect)) {
      const targetTop = Math.max(0, match.rect.top - 120);
      window.scrollTo({ top: targetTop, behavior: "smooth" });
    } else if (recordId && targetCanonical === currentCanonical) {
      if (highlightCache.has(recordId)) {
        focusHighlight(recordId);
      } else {
        markHighlightForReapply(recordId);
        setTimeout(() => focusHighlight(recordId), 800);
      }
    }
  }

  function openMatchesInSidepanel(matches) {
    const aggregated = Array.from(interestMatchesByRecord.values()).map(
      (item) => item.match,
    );
    const payloadMatches =
      aggregated.length && Array.isArray(matches)
        ? aggregated.slice().sort((a, b) => (b.score || 0) - (a.score || 0))
        : Array.isArray(matches)
          ? matches.slice().sort((a, b) => (b.score || 0) - (a.score || 0))
          : [];
    if (!payloadMatches.length) return;
    sendMessage("myz:showRelatedHighlights", {
      matches: payloadMatches.map((item) => ({
        id: item.id,
        text: item.text,
        score: item.score,
        metadata: item.metadata,
      })),
      url: window.location.href,
    }).catch((error) => console.warn("open sidepanel failed", error));
  }

  function updateInterestAggregates(matches = [], element) {
    matches.forEach((match) => {
      const key =
        match?.metadata?.recordId ||
        match?.id ||
        match?.metadata?.url ||
        match?.text;
      if (!key) return;
      const existing = interestMatchesByRecord.get(key);
      if (!existing || (match.score || 0) > (existing.match.score || 0)) {
        const rect = element ? getElementPageRect(element) : existing?.rect;
        const rectKey =
          element || existing?.rectKey
            ? existing?.rectKey
            : `rect-${++interestTempRectKeyId}`;
        interestMatchesByRecord.set(key, {
          match: { ...match },
          element,
          rect,
          rectKey,
        });
      }
    });
    updateInterestIndicators();
  }

  function flashElement(el) {
    if (!el || typeof el.classList?.add !== "function") return;
    el.classList.add("myz-ai-chunk-flash");
    setTimeout(() => el.classList.remove("myz-ai-chunk-flash"), 1200);
  }

  function ensureInterestIndicatorsHost() {
    if (
      interestIndicatorsHost &&
      document.contains(interestIndicatorsHost) &&
      interestIndicatorsHost.shadowRoot?.firstChild
    ) {
      return interestIndicatorsHost;
    }
    const host = document.createElement("div");
    host.setAttribute("data-myz-interest-indicators", "1");
    const shadow = host.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = `
      :host { all: initial; }
      .indicator {
        position: absolute;
        width: 12px;
        height: 12px;
        border-radius: 50%;
        background: #f59e0b;
        box-shadow: 0 0 0 2px rgba(255,255,255,0.8);
        pointer-events: none;
        z-index: 2147483644;
        opacity: 0.95;
      }
    `;
    const layer = document.createElement("div");
    layer.style.position = "fixed";
    layer.style.top = "0";
    layer.style.left = "0";
    layer.style.width = "100%";
    layer.style.height = "100%";
    layer.style.pointerEvents = "none";
    shadow.appendChild(style);
    shadow.appendChild(layer);
    document.documentElement.appendChild(host);
    interestIndicatorsHost = host;
    return host;
  }

  function updateInterestIndicators() {
    const host = ensureInterestIndicatorsHost();
    const layer = host.shadowRoot?.lastChild;
    if (!layer) return;
    // Cleanup removed elements and stale indicators
    Array.from(interestElementIndicators.entries()).forEach(
      ([key, indicator]) => {
        if (key instanceof Element && !document.contains(key)) {
          if (indicator.el?.parentNode) {
            indicator.el.parentNode.removeChild(indicator.el);
          }
          interestElementIndicators.delete(key);
        }
      },
    );

    let removedInvalid = false;

    Array.from(interestMatchesByRecord.entries()).forEach(
      ([mapKey, { element, rect, rectKey }]) => {
        let targetRect = null;
        if (element && document.contains(element)) {
          targetRect = element.getBoundingClientRect();
        } else if (isRectValid(rect)) {
          targetRect = {
            left: rect.left - window.scrollX,
            top: rect.top - window.scrollY,
            width: rect.width,
            height: rect.height,
          };
        }
        if (!targetRect) {
          interestMatchesByRecord.delete(mapKey);
          removedInvalid = true;
          return;
        }
        const indicatorKey = element || rectKey || mapKey;
        let indicator = interestElementIndicators.get(indicatorKey);
        if (!indicator) {
          const dot = document.createElement("div");
          dot.className = "indicator";
          layer.appendChild(dot);
          indicator = { el: dot };
          interestElementIndicators.set(indicatorKey, indicator);
        }
        const x = targetRect.left - 6;
        const y = targetRect.top - 6;
        indicator.el.style.transform = `translate(${x}px, ${y}px)`;
      },
    );
  }

  function scheduleIndicatorUpdate() {
    if (indicatorUpdateScheduled) return;
    indicatorUpdateScheduled = true;
    requestAnimationFrame(() => {
      indicatorUpdateScheduled = false;
      updateInterestIndicators();
      if (!interestPopupCollapsed) {
        showInterestPopup();
      }
    });
  }

  function resetInterestStateForNavigation() {
    interestMatchesByRecord.clear();
    interestElementIndicators.forEach(({ el }) => {
      if (el?.parentNode) {
        el.parentNode.removeChild(el);
      }
    });
    interestElementIndicators.clear();
    if (interestIndicatorsHost?.parentNode) {
      interestIndicatorsHost.parentNode.removeChild(interestIndicatorsHost);
    }
    interestIndicatorsHost = null;
    if (interestPopupHost?.parentNode) {
      interestPopupHost.parentNode.removeChild(interestPopupHost);
    }
    interestPopupHost = null;
    interestPopupCollapsed = false;
    if (interestObserver) {
      try {
        interestObserver.disconnect();
      } catch {}
    }
    interestObserver = null;
    if (interestMutationObserver) {
      try {
        interestMutationObserver.disconnect();
      } catch {}
    }
    interestMutationObserver = null;
    interestState.clear();
    startInterestMonitoring();
  }

  function applyDockPosition(container) {
    if (!container) return;
    const topPercent =
      typeof interestDockPosition.top === "number"
        ? interestDockPosition.top
        : 0.75;
    container.style.top = `${Math.min(0.9, Math.max(0.05, topPercent)) * 100}%`;
    container.style.bottom = "auto";
    if (interestDockPosition.left !== null) {
      container.style.left = `${Math.max(0, interestDockPosition.left * 100)}%`;
      container.style.right = "auto";
    } else {
      container.style.right = `${Math.max(
        0,
        (interestDockPosition.right ?? 0.05) * 100,
      )}%`;
      container.style.left = "auto";
    }
  }

  function renderDock(container) {
    container.innerHTML = "";
    const dock = document.createElement("button");
    dock.className = "dock-button";
    dock.textContent = Math.max(interestMatchesByRecord.size, 0);
    container.appendChild(dock);
    let dragging = false;
    let moved = false;
    let startY = 0;
    let startX = 0;
    let startTop = 0;
    let startLeft = 0;
    const onMouseMove = (e) => {
      if (!dragging) return;
      moved = true;
      const deltaY = e.clientY - startY;
      const deltaX = e.clientX - startX;
      const viewHeight = window.innerHeight || 1;
      const viewWidth = window.innerWidth || 1;
      const newTop = Math.min(viewHeight - 24, Math.max(24, startTop + deltaY));
      const newLeft = Math.min(viewWidth - 24, Math.max(0, startLeft + deltaX));
      interestDockPosition.top = newTop / viewHeight;
      interestDockPosition.left = newLeft / viewWidth;
      interestDockPosition.right = null;
      applyDockPosition(container);
    };
    const endDrag = () => {
      dragging = false;
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", endDrag);
    };
    dock.onmousedown = (e) => {
      e.preventDefault();
      dragging = true;
      startY = e.clientY;
      startX = e.clientX;
      startTop = (window.innerHeight || 1) * (interestDockPosition.top || 0.75);
      startLeft =
        interestDockPosition.left !== null
          ? (window.innerWidth || 1) * interestDockPosition.left
          : (window.innerWidth || 1) *
            (1 - (interestDockPosition.right ?? 0.05));
      window.addEventListener("mousemove", onMouseMove);
      window.addEventListener("mouseup", endDrag);
    };
    dock.onclick = (e) => {
      if (e && typeof e.stopPropagation === "function") {
        e.stopPropagation();
      }
      if (dragging || moved) {
        moved = false;
        return;
      }
      interestPopupCollapsed = false;
      showInterestPopup();
    };
  }

  function collapseInterestPopup() {
    interestPopupCollapsed = true;
    showInterestPopup();
    scheduleIndicatorUpdate();
  }
})();
