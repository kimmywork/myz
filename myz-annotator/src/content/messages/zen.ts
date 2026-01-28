import { registerMessageHandler } from "./handler";
import {
  hasArticleElement,
  toggleZenMode,
  captureZenTargetFull,
} from "../zen";
import { useNotificationStore } from "../stores/notification-store";

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
        message: "未检测到 article 元素，无法进入禅定模式",
      });
      throw new Error("No article element found");
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

    try {
      chrome.runtime?.sendMessage?.({ type: "myz:zenModeStateChanged" });
    } catch {}

    if (state === "error") {
      throw new Error("Failed to toggle Zen Mode");
    }
    return { state };
  });

  registerMessageHandler("myz:captureZenTargetFull", async () => {
    await captureZenTargetFull();
  });
}
