import { useNotificationStore } from "../stores/notification-store";
import { hasArticleElement, toggleZenMode, captureZenTargetFull } from "../zen";
import { registerMessageHandler } from "./handler";

export function initializeZenMessageHandlers() {
  registerMessageHandler("myz:canEnterZenMode", async () => {
    const ok = hasArticleElement();
    return { canEnter: ok };
  });

  registerMessageHandler("myz:getZenModeState", async () => {
    const enabled =
      document.documentElement.classList.contains("myz-zen-enabled");
    return { enabled };
  });

  registerMessageHandler("myz:toggleZenMode", async () => {
    const notificationStore = useNotificationStore();
    if (!hasArticleElement()) {
      notificationStore.notify({
        message: "未检测到 article 元素，无法进入专注阅读",
      });
      throw new Error("No article element found");
    }
    const state = toggleZenMode();
    if (state === "on") {
      notificationStore.notify({
        message: "已进入专注阅读",
      });
    } else if (state === "off") {
      notificationStore.notify({
        message: "已退出专注阅读",
      });
    } else {
      notificationStore.notify({
        message: "切换专注阅读失败",
      });
    }

    try {
      chrome.runtime?.sendMessage?.({ type: "myz:zenModeStateChanged" });
    } catch (error) {
      // The popped-out reader page may have no runtime; ignore silently on purpose.
      console.debug("MyZ: zenModeStateChanged broadcast failed", error);
    }

    if (state === "error") {
      throw new Error("Failed to toggle Zen Mode");
    }
    return { state };
  });

  registerMessageHandler("myz:captureZenTargetFull", async () => {
    await captureZenTargetFull();
  });
}
