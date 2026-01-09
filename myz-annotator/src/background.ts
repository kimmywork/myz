import { syncAiRequestHeaderRules } from "./background/aiHeaders.js";
import { DEFAULT_SETTINGS, SETTINGS_KEY } from "./background/constants.js";
import { initializeAIMessageHandlers } from "./background/messages/ai.js";
import { initializeCaptureMessageHandlers } from "./background/messages/capture.js";
import { handleMessage } from "./background/messages/handler.js";
import { initializeHighlightMessageHandlers } from "./background/messages/highlights.js";
import { initializeSettingsMessageHandlers } from "./background/messages/settings.js";
import { initializeSocialImportMessageHandlers } from "./background/messages/social-import.js";
import { initializeVectoriaMessageHandlers } from "./background/messages/vectoria.js";
import { readSettings } from "./background/storage.js";
import {
  applyVectorSearchSettings,
  getVectoria,
} from "./background/vectoria-index.js";
import { resolveAgentTarget } from "./background/ai/runtime/agentSelection.js";

const PENDING_SIDEPANEL_ACTION_KEY = "myz::pendingSidePanelAction";

function generateDraftId(prefix = "draft") {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Queues a SidePanel action so it can be delivered even if the SidePanel page
 * is not yet ready to receive runtime messages.
 */
async function queueSidePanelAction(payload: any) {
  const nextPayload = payload && typeof payload === "object" ? payload : {};
  if (!nextPayload.draftId) {
    nextPayload.draftId = generateDraftId();
  }

  try {
    await chrome.storage.session.set({ [PENDING_SIDEPANEL_ACTION_KEY]: nextPayload });
  } catch {
    await chrome.storage.local.set({ [PENDING_SIDEPANEL_ACTION_KEY]: nextPayload });
  }

  try {
    await chrome.runtime.sendMessage({
      type: "myz:openSidePanelWithAction",
      payload: nextPayload,
    });
  } catch {
    // ignore
  }
}

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
    applyVectorSearchSettings(settings as any);
    await getVectoria();
  } catch (error) {
    console.warn("Failed to initialize vector settings", error);
  }
})();

async function ensureContextMenus() {
  try {
    // Remove existing if present to avoid duplicate id error
    try {
      await chrome.contextMenus.remove("myz-zen-mode");
    } catch {}
    chrome.contextMenus.create({
      id: "myz-zen-mode",
      title: "禅定模式 (仅显示文章)",
      contexts: ["page", "selection"],
    });
    // Add capture as image when in zen mode
    try {
      await chrome.contextMenus.remove("myz-zen-capture");
    } catch {}
    chrome.contextMenus.create({
      id: "myz-zen-capture",
      title: "保存文章为图片",
      contexts: ["page", "selection"],
      visible: false,
    });

    // Add AI Assistant menu
    try {
      await chrome.contextMenus.remove("myz-ai-assistant");
    } catch {}
    chrome.contextMenus.create({
      id: "myz-ai-assistant",
      title: "打开AI助理",
      contexts: ["page", "selection", "image"],
    });

    // Add AI Assistant submenu actions
    try {
      await chrome.contextMenus.remove("myz-ai-summarize");
    } catch {}
    chrome.contextMenus.create({
      id: "myz-ai-summarize",
      parentId: "myz-ai-assistant",
      title: "总结页面内容",
      contexts: ["page", "selection"],
    });

    try {
      await chrome.contextMenus.remove("myz-ai-keypoints");
    } catch {}
    chrome.contextMenus.create({
      id: "myz-ai-keypoints",
      parentId: "myz-ai-assistant",
      title: "发现关键要点",
      contexts: ["page", "selection"],
    });

    try {
      await chrome.contextMenus.remove("myz-ai-custom");
    } catch {}
    chrome.contextMenus.create({
      id: "myz-ai-custom",
      parentId: "myz-ai-assistant",
      title: "打开面板",
      contexts: ["page", "selection"],
    });

    try {
      await chrome.contextMenus.remove("myz-ai-interpret-image");
    } catch {}
    chrome.contextMenus.create({
      id: "myz-ai-interpret-image",
      parentId: "myz-ai-assistant",
      title: "解读图片内容（需 Vision 模型）",
      contexts: ["image"],
      visible: true,
      enabled: false,
    } as any);
  } catch (e) {
    // ignore menu creation failures
  }

  refreshAiImageMenuVisibility().catch(() => {});
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

async function refreshAiImageMenuVisibility() {
  try {
    const settings = await readSettings();
    if (!settings?.aiAssistantEnabled) {
      try {
        await chrome.contextMenus.update("myz-ai-interpret-image", {
          enabled: false,
          title: "解读图片内容（未启用 AI 助理）",
        });
      } catch {}
      return;
    }
    const target = resolveAgentTarget(settings as any, "conversation");
    const enabled = Boolean(target?.model?.capabilities?.vision);
    try {
      await chrome.contextMenus.update("myz-ai-interpret-image", {
        enabled,
        title: enabled ? "解读图片内容" : "解读图片内容（需 Vision 模型）",
      });
    } catch {}
  } catch {
    try {
      await chrome.contextMenus.update("myz-ai-interpret-image", {
        enabled: false,
        title: "解读图片内容（未配置）",
      });
    } catch {}
  }
}

const contextMenusAny = chrome.contextMenus as any;
if (contextMenusAny?.onShown?.addListener) {
  contextMenusAny.onShown.addListener(() => {
    refreshAiImageMenuVisibility()
      .then(() => contextMenusAny.refresh?.())
      .catch(() => {});
  });
}

const runtimeAny = chrome.runtime as any;
runtimeAny?.onStartup?.addListener(() => {
  refreshAiImageMenuVisibility().catch(() => {});
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local") return;
  if (!changes || !(SETTINGS_KEY in changes)) return;
  refreshAiImageMenuVisibility().catch(() => {});
});

function arrayBufferToBase64(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function parseMimeType(value: string) {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (!normalized) return "";
  return normalized.split(";")[0].trim();
}

async function fetchImageDataUrl(
  srcUrl: string,
  tabId: number,
): Promise<{ dataUrl: string; mimeType: string }> {
  if (!srcUrl) {
    throw new Error("srcUrl is required");
  }
  if (srcUrl.startsWith("data:")) {
    const mimeType = parseMimeType(srcUrl.slice(5).split(";")[0] || "");
    return { dataUrl: srcUrl, mimeType };
  }

  try {
    const response = await fetch(srcUrl, { credentials: "include" as RequestCredentials });
    if (!response.ok) {
      throw new Error(`fetch failed: ${response.status}`);
    }
    const mimeType = parseMimeType(response.headers.get("content-type") || "");
    const buffer = await response.arrayBuffer();
    const base64 = arrayBufferToBase64(buffer);
    const safeMimeType = mimeType || "image/png";
    return { dataUrl: `data:${safeMimeType};base64,${base64}`, mimeType: safeMimeType };
  } catch (error) {
    const result = await chrome.tabs.sendMessage(tabId, {
      type: "myz:fetchImageAsDataUrl",
      payload: { srcUrl },
    });
    const data = (result && (result.data || result)) || {};
    const dataUrl = typeof data?.dataUrl === "string" ? data.dataUrl : "";
    const mimeType = typeof data?.mimeType === "string" ? data.mimeType : "";
    if (!dataUrl.startsWith("data:")) {
      throw error as any;
    }
    return { dataUrl, mimeType: mimeType || "image/png" };
  }
}

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
      else if (info.menuItemId === "myz-ai-interpret-image") {
        if (!info.srcUrl) {
          return;
        }
        await chrome.sidePanel.open({ windowId: tab.windowId });

        const { dataUrl, mimeType } = await fetchImageDataUrl(info.srcUrl, tab.id);

        await queueSidePanelAction({
          action: "interpret_image",
          tabId: tab.id,
          prompt: "请解读这张图片的内容",
          attachments: [
            {
              type: "image",
              dataUrl,
              mimeType,
            },
          ],
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
    try {
      await chrome.contextMenus.update("myz-zen-mode", {
        title: "禅定模式 (仅显示文章)",
        visible: false,
      });
      await chrome.contextMenus.update("myz-zen-capture", { visible: false });
    } catch {}
    const canResp = await chrome.tabs.sendMessage(tabId, {
      type: "myz:canEnterZenMode",
    });
    const stateResp = await chrome.tabs.sendMessage(tabId, {
      type: "myz:getZenModeState",
    });
    const canEnter = Boolean(canResp?.data?.canEnter);
    const enabled = Boolean(stateResp?.data?.enabled);
    const title = enabled ? "退出禅定模式" : "禅定模式 (仅显示文章)";
    try {
      await chrome.contextMenus.update("myz-zen-mode", {
        title,
        visible: canEnter || enabled,
      });
      await chrome.contextMenus.update("myz-zen-capture", { visible: enabled });
    } catch {}
  } catch (e) {
    try {
      await chrome.contextMenus.update("myz-zen-mode", {
        title: "禅定模式 (仅显示文章)",
        visible: false,
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

initializeAIMessageHandlers();
initializeCaptureMessageHandlers();
initializeHighlightMessageHandlers();
initializeSettingsMessageHandlers();
initializeSocialImportMessageHandlers();
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
