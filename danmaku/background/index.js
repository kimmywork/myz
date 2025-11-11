const danmakuByTab = new Map();

chrome.runtime.onInstalled.addListener(() => {
  chrome.action.setBadgeText({ text: "" });
  chrome.action.setBadgeBackgroundColor({ color: "#E31A1C" });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "danmaku:get") {
    const targetId = typeof message.tabId === "number" ? message.tabId : sender.tab?.id;
    const snapshot = targetId !== undefined ? danmakuByTab.get(targetId) : null;
    sendResponse(snapshot || { count: 0, list: [], title: null, videoId: null });
    return true;
  }

  if (!sender.tab || sender.tab.id === undefined) {
    return false;
  }

  const tabId = sender.tab.id;

  if (message?.type === "danmaku:update") {
    danmakuByTab.set(tabId, {
      count: message.count || 0,
      list: message.list || [],
      videoId: message.videoId || null,
      title: message.title || null,
      lastUpdated: Date.now()
    });
    updateBadge(tabId, message.count || 0);
    return false;
  }

  if (message?.type === "danmaku:clear") {
    danmakuByTab.delete(tabId);
    updateBadge(tabId, 0);
    return false;
  }

  return false;
});

chrome.tabs.onRemoved.addListener(tabId => {
  danmakuByTab.delete(tabId);
});

function updateBadge(tabId, count) {
  const text = count > 0 ? String(Math.min(count, 999)) : "";
  chrome.action.setBadgeText({ tabId, text: count > 999 ? "999+" : text });
  if (count > 999) {
    chrome.action.setBadgeBackgroundColor({ tabId, color: "#B31D1D" });
  } else {
    chrome.action.setBadgeBackgroundColor({ tabId, color: "#E31A1C" });
  }
}
