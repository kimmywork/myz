/**
 * Send a message to the content script of a specific tab or the active tab.
 */
export async function sendToContentScript<T = unknown, R = unknown>(
  type: string,
  payload: T,
  tabId?: number,
): Promise<R> {
  let targetTabId = tabId;

  if (typeof targetTabId !== "number" || Number.isNaN(targetTabId)) {
    // Try to find the active tab
    const [activeTab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });
    if (activeTab?.id) {
      targetTabId = activeTab.id;
    }
  }

  if (typeof targetTabId !== "number" || Number.isNaN(targetTabId)) {
    throw new Error("No active tab found to send message");
  }

  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(targetTabId!, { type, payload }, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      if (!response) {
        reject(new Error("No response from content script"));
        return;
      }
      if (response.ok) {
        resolve(response.data as R);
      } else {
        reject(new Error(response.error || "Content script error"));
      }
    });
  });
}
