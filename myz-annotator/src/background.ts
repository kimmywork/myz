import { DEFAULT_SETTINGS, SETTINGS_KEY } from "./background/constants.js";
import { initializeInboxReminder } from "./background/inbox/reminder.js";
import { initializeCaptureMessageHandlers } from "./background/messages/capture.js";
import { handleMessage, hasHandler } from "./background/messages/handler.js";
import { initializeHighlightMessageHandlers } from "./background/messages/highlights.js";
import { initializeInboxMessageHandlers } from "./background/messages/inbox.js";
import { initializeSearchMessageHandlers } from "./background/messages/search.js";
import { initializeSettingsMessageHandlers } from "./background/messages/settings.js";
import { initializeStagedAssetMessageHandlers } from "./background/messages/staged-assets.js";
import { initializeSyncMessageHandlers } from "./background/messages/sync.js";
import { authorizeMessage } from "./background/messages/trustedSender.js";
import { initializeSyncScheduler } from "./background/sync/scheduler.js";
import { toMessageContext } from "./messaging/context.js";
import { resolvePdfTargetUrl } from "./pdf/detect.js";

async function ensureContextMenus() {
  try {
    // Remove existing if present to avoid duplicate id error
    try {
      await chrome.contextMenus.remove("myz-zen-mode");
    } catch (error) {
      console.warn("Failed to remove existing zen-mode menu", error);
    }
    chrome.contextMenus.create({
      id: "myz-zen-mode",
      title: "专注阅读 (仅显示文章)",
      contexts: ["page", "selection"],
    });
    // Add capture as image when in zen mode
    try {
      await chrome.contextMenus.remove("myz-zen-capture");
    } catch (error) {
      console.warn("Failed to remove existing zen-capture menu", error);
    }
    chrome.contextMenus.create({
      id: "myz-zen-capture",
      title: "保存文章为图片",
      contexts: ["page", "selection"],
      visible: false,
    });
    try {
      await chrome.contextMenus.remove("myz-open-pdf");
    } catch (error) {
      console.warn("Failed to remove existing open-pdf menu", error);
    }
    chrome.contextMenus.create({
      id: "myz-open-pdf",
      title: "在 MyZ 中打开 PDF",
      contexts: ["link"],
    });
    try {
      await chrome.contextMenus.remove("myz-save-image");
    } catch (error) {
      console.warn("Failed to remove existing save-image menu", error);
    }
    chrome.contextMenus.create({
      id: "myz-save-image",
      title: "保存图片到 MyZ",
      contexts: ["image"],
    });
    try {
      await chrome.contextMenus.remove("myz-capture-video-frame");
    } catch (error) {
      console.warn("Failed to remove existing video-frame menu", error);
    }
    chrome.contextMenus.create({
      id: "myz-capture-video-frame",
      title: "截取当前视频帧到 MyZ",
      contexts: ["video"],
    });
    try {
      await chrome.contextMenus.remove("myz-open-stitch");
    } catch (error) {
      console.warn("Failed to remove existing open-stitch menu", error);
    }
    chrome.contextMenus.create({
      id: "myz-open-stitch",
      title: "打开 MyZ 拼图",
      contexts: ["page", "selection"],
    });
  } catch (error) {
    console.warn("Context menu creation failed", error);
  }
}

void ensureContextMenus();

chrome.runtime.onInstalled.addListener(async () => {
  const { [SETTINGS_KEY]: existingSettings } =
    await chrome.storage.local.get(SETTINGS_KEY);
  if (!existingSettings) {
    await chrome.storage.local.set({ [SETTINGS_KEY]: DEFAULT_SETTINGS });
  }
  await ensureContextMenus();
});

chrome.contextMenus.onClicked.addListener(
  async (info: chrome.contextMenus.OnClickData, tab?: chrome.tabs.Tab) => {
    if (!tab || !tab.id) return;
    try {
      if (info.menuItemId === "myz-zen-mode") {
        await chrome.tabs.sendMessage(tab.id, { type: "myz:toggleZenMode" });
        await refreshZenMenuForTab(tab.id);
      } else if (info.menuItemId === "myz-zen-capture") {
        // In Zen mode, capture only the target article element instead of full page
        await chrome.tabs.sendMessage(tab.id, {
          type: "myz:captureZenTargetFull",
        });
      } else if (info.menuItemId === "myz-open-pdf") {
        const candidate = info.linkUrl || info.pageUrl;
        const target = await resolvePdfTargetUrl(candidate);
        const base = chrome.runtime.getURL("src/pdf/pdf-viewer.html");
        const url = target ? `${base}?url=${encodeURIComponent(target)}` : base;
        await chrome.tabs.create({ url });
      } else if (info.menuItemId === "myz-save-image") {
        await chrome.tabs.sendMessage(tab.id, {
          type: "myz:capturePageImage",
          payload: { srcUrl: info.srcUrl },
        });
      } else if (info.menuItemId === "myz-capture-video-frame") {
        await chrome.tabs.sendMessage(tab.id, {
          type: "myz:captureVideoFrame",
          payload: { srcUrl: info.srcUrl },
        });
      } else if (info.menuItemId === "myz-open-stitch") {
        await chrome.tabs.create({
          url: chrome.runtime.getURL("src/stitch/stitch.html"),
        });
      }
    } catch (e) {
      // ignore
    }
  },
);

// Dynamically update menu title/visibility per tab
async function refreshZenMenuForTab(tabId: number) {
  if (!tabId) return;
  try {
    // `myz:getZenModeState` is a cheap class check. Keep the zen item visible
    // by default so the context menu never has to wait for a content-script
    // round-trip (or a DOM scan) before it can render.
    const stateResp = await chrome.tabs.sendMessage(tabId, {
      type: "myz:getZenModeState",
    });
    const enabled = Boolean(stateResp?.data?.enabled);
    try {
      await chrome.contextMenus.update("myz-zen-mode", {
        title: enabled ? "退出专注阅读" : "专注阅读 (仅显示文章)",
        visible: true,
      });
      await chrome.contextMenus.update("myz-zen-capture", { visible: enabled });
    } catch {}
  } catch (e) {
    // Content script unavailable (e.g. chrome:// pages): keep the item visible
    // with the default title instead of hiding it.
    try {
      await chrome.contextMenus.update("myz-zen-mode", {
        title: "专注阅读 (仅显示文章)",
        visible: true,
      });
      await chrome.contextMenus.update("myz-zen-capture", { visible: false });
    } catch {}
  }
}

chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  refreshZenMenuForTab(tabId);
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status === "complete") {
    refreshZenMenuForTab(tabId);
  }
});

chrome.runtime.onMessage.addListener((msg, sender) => {
  // Content notifies when zen mode state changed (e.g., via shortcuts or internal toggles)
  if (msg && msg.type === "myz:zenModeStateChanged") {
    const tabId = sender?.tab?.id;
    if (tabId) refreshZenMenuForTab(tabId);
  }
});

initializeCaptureMessageHandlers();
initializeHighlightMessageHandlers();
initializeInboxMessageHandlers();
initializeSearchMessageHandlers();
initializeSettingsMessageHandlers();
initializeStagedAssetMessageHandlers();
initializeSyncMessageHandlers();
initializeSyncScheduler();
initializeInboxReminder();

chrome.runtime.onMessage.addListener(
  (
    message: { type: string; payload: unknown; [key: string]: unknown },
    sender,
    sendResponse,
  ) => {
    if (!message || !message.type) {
      return false;
    }
    if (!hasHandler(message.type)) {
      console.warn("Unknown message type", message.type);
      return false;
    }
    // Support both {type, payload} and {type, ...rest} formats
    const payload =
      message.payload !== undefined
        ? message.payload
        : (() => {
            const { type: _type, payload: _, ...rest } = message;
            return Object.keys(rest).length > 0 ? rest : undefined;
          })();
    const authorization = authorizeMessage(
      message.type,
      payload,
      toMessageContext(sender),
    );
    if (!authorization.ok) {
      console.warn("Rejected privileged message", message.type);
      sendResponse({ ok: false, error: authorization.error });
      return true;
    }
    try {
      handleMessage(message.type, payload, toMessageContext(sender))
        .then((result) => sendResponse({ ok: true, data: result }))
        .catch((error) => {
          console.error("Handler error", message.type, error);
          sendResponse({ ok: false, error: error.message || String(error) });
        });
    } catch (error) {
      console.error("Handler exception", message.type, error);
      sendResponse({
        ok: false,
        error: (error as Error).message || String(error),
      });
    }
    return true;
  },
);
