import { sendMessage } from "../shared/messaging.ts";
import { canonicalUrl } from "../shared/url.ts";

import { mergeArchiveResult, getArchiveState } from "./highlight-state.ts";
import { useNotificationStore } from "./stores/notification-store.ts";

export async function ensureArchiveSnapshotForCurrentPage({
  force = false,
} = {}) {
  const notificationStore = useNotificationStore();
  if (!getArchiveState().archiveFeatureEnabled) {
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
      notificationStore.notify({
        message: "页面已保存到 Internet Archive",
      });
    } else if (result.status === "exists") {
      notificationStore.notify({
        message: "Internet Archive 已存在该页面的存档",
      });
    } else if (result.status === "pending") {
      notificationStore.notify({
        message: "已提交保存请求，存档生成可能需要一些时间",
      });
    }
    return result;
  } catch (error) {
    console.error("Internet Archive 保存失败", error);
    notificationStore.notify({
      message: "保存到 Internet Archive 失败，请稍后重试",
    });
    return null;
  }
}
