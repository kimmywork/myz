import { syncAiRequestHeaderRules } from "./background/aiHeaders.js";
import { DEFAULT_SETTINGS, SETTINGS_KEY } from "./background/constants.js";
import { initializeAIMessageHandlers } from "./background/messages/ai.js";
import { initializeCaptureMessageHandlers } from "./background/messages/capture.js";
import { handleMessage } from "./background/messages/handler.js";
import { initializeHighlightMessageHandlers } from "./background/messages/highlights.js";
import { initializeSettingsMessageHandlers } from "./background/messages/settings.js";
import { initializeVectoriaMessageHandlers } from "./background/messages/vectoria.js";
import { readSettings } from "./background/storage.js";
import {
  applyVectoriaSettings,
  warmVectoriaModel,
} from "./background/vectoria-index.js";

(async function initializeAiHeaderRules() {
  try {
    const settings = await readSettings();
    await syncAiRequestHeaderRules(settings);
  } catch (error) {
    console.warn("Failed to initialize AI header rules", error);
  }
})();

(async function initializeVectoriaSettings() {
  try {
    const settings = await readSettings();
    applyVectoriaSettings(settings);
    if (settings.vectorSearchEnabled) {
      try {
        await warmVectoriaModel();
      } catch (error) {
        console.warn("Vectoria warm-up on startup failed", error);
      }
    }
  } catch (error) {
    console.warn("Failed to initialize vector settings", error);
  }
})();

chrome.runtime.onInstalled.addListener(async () => {
  const { [SETTINGS_KEY]: existingSettings } =
    await chrome.storage.local.get(SETTINGS_KEY);
  if (!existingSettings) {
    await chrome.storage.local.set({ [SETTINGS_KEY]: DEFAULT_SETTINGS });
  }
  try {
    // Remove existing if present to avoid duplicate id error
    await chrome.contextMenus.remove("myz-zen-mode").catch(() => {});
    chrome.contextMenus.create({
      id: "myz-zen-mode",
      title: "禅定模式 (仅显示文章)",
      contexts: ["page", "selection"],
    });
    // Add capture as image when in zen mode
    await chrome.contextMenus.remove("myz-zen-capture").catch(() => {});
    chrome.contextMenus.create({
      id: "myz-zen-capture",
      title: "保存文章为图片",
      contexts: ["page", "selection"],
      visible: false,
    });

    // Add AI Assistant menu
    await chrome.contextMenus.remove("myz-ai-assistant").catch(() => {});
    chrome.contextMenus.create({
      id: "myz-ai-assistant",
      title: "打开AI助手",
      contexts: ["page", "selection"],
    });

    // Add AI Assistant submenu actions
    await chrome.contextMenus.remove("myz-ai-summarize").catch(() => {});
    chrome.contextMenus.create({
      id: "myz-ai-summarize",
      parentId: "myz-ai-assistant",
      title: "总结页面内容",
      contexts: ["page", "selection"],
    });

    await chrome.contextMenus.remove("myz-ai-keypoints").catch(() => {});
    chrome.contextMenus.create({
      id: "myz-ai-keypoints",
      parentId: "myz-ai-assistant",
      title: "发现关键要点",
      contexts: ["page", "selection"],
    });

    await chrome.contextMenus.remove("myz-ai-custom").catch(() => {});
    chrome.contextMenus.create({
      id: "myz-ai-custom",
      parentId: "myz-ai-assistant",
      title: "打开面板",
      contexts: ["page", "selection"],
    });
  } catch (e) {
    // ignore menu creation failures
  }
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
      } else if (
        info.menuItemId === "myz-ai-assistant" ||
        info.menuItemId === "myz-ai-custom"
      ) {
        // Open side panel only (no auto-trigger for parent menu and "打开面板")
        await chrome.sidePanel.open({ windowId: tab.windowId });
      } else if (
        info.menuItemId === "myz-ai-summarize" ||
        info.menuItemId === "myz-ai-keypoints"
      ) {
        // Open side panel with AI assistant
        await chrome.sidePanel.open({ windowId: tab.windowId });

        type ExtractPageContentResponse = {
          data?: { text?: string };
        };

        // Try to extract page content first
        try {
          const result = await new Promise<ExtractPageContentResponse>(
            (resolve, reject) => {
              chrome.tabs.sendMessage<
                { type: string },
                ExtractPageContentResponse
              >(tab.id!, { type: "myz:extractPageContent" }, (response) => {
                if (chrome.runtime.lastError) {
                  reject(chrome.runtime.lastError);
                } else {
                  resolve(response);
                }
              });
            },
          );

          let hasContent = false;
          if (
            result &&
            result.data &&
            result.data.text &&
            result.data.text.length > 100
          ) {
            hasContent = true;
          }

          // Only auto-trigger if we have enough page content
          if (hasContent) {
            // Extract action type from menu ID
            let action = "custom";
            if (info.menuItemId === "myz-ai-summarize") action = "summarize";
            else if (info.menuItemId === "myz-ai-keypoints")
              action = "key_points";

            // Send message to side panel with the selected action
            setTimeout(async () => {
              try {
                await chrome.runtime.sendMessage({
                  type: "myz:openSidePanelWithAction",
                  payload: { action, tabId: tab.id },
                });
              } catch (e) {
                console.warn("Could not send side panel action message:", e);
              }
            }, 500);
          } else {
            console.log("Not enough page content, skipping auto-trigger");
          }
        } catch (e) {
          console.warn(
            "Could not check page content, skipping auto-trigger:",
            e,
          );
        }
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
    await chrome.contextMenus.update("myz-zen-mode", {
      title: "禅定模式 (仅显示文章)",
      visible: false,
    });
    await chrome.contextMenus.update("myz-zen-capture", { visible: false });
    const canResp = await chrome.tabs.sendMessage(tabId, {
      type: "myz:canEnterZenMode",
    });
    const stateResp = await chrome.tabs.sendMessage(tabId, {
      type: "myz:getZenModeState",
    });
    const canEnter = Boolean(canResp?.data?.canEnter);
    const enabled = Boolean(stateResp?.data?.enabled);
    const title = enabled ? "退出禅定模式" : "禅定模式 (仅显示文章)";
    await chrome.contextMenus.update("myz-zen-mode", {
      title,
      visible: canEnter || enabled,
    });
    await chrome.contextMenus.update("myz-zen-capture", { visible: enabled });
  } catch (e) {
    await Promise.all([
      chrome.contextMenus
        .update("myz-zen-mode", {
          title: "禅定模式 (仅显示文章)",
          visible: false,
        })
        .catch(() => {}),
      chrome.contextMenus
        .update("myz-zen-capture", { visible: false })
        .catch(() => {}),
    ]);
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

initializeAIMessageHandlers();
initializeCaptureMessageHandlers();
initializeHighlightMessageHandlers();
initializeSettingsMessageHandlers();
initializeVectoriaMessageHandlers();

chrome.runtime.onMessage.addListener(
  (message: { type: string; payload: any }, sender, sendResponse) => {
    if (!message || !message.type) {
      return false;
    }
    try {
      handleMessage(message.type, message.payload, sender)
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
