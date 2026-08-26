/**
 * Check if a tab URL is an extension internal page (popup, dashboard, etc.)
 * that does NOT have the content script injected.
 */
export function isExtensionPage(url?: string): boolean {
  if (!url) return false;
  return (
    url.startsWith("chrome-extension://") ||
    url.startsWith("chrome://") ||
    url.startsWith("about:") ||
    url.startsWith("edge://") ||
    url.startsWith("brave://")
  );
}

/**
 * Find a tab that has the content script injected (i.e. a regular web page,
 * not an extension internal page). Falls back to any non-extension tab.
 */
export async function findContentScriptTab(): Promise<number | undefined> {
  // 1. Try the active tab in the current window if it's a regular page.
  const [activeTab] = await chrome.tabs.query({
    active: true,
    currentWindow: true,
  });
  if (activeTab?.id && !isExtensionPage(activeTab.url)) {
    return activeTab.id;
  }

  // 2. Find any regular web page tab.
  const allTabs = await chrome.tabs.query({});
  for (const tab of allTabs) {
    if (tab.id && !isExtensionPage(tab.url)) {
      return tab.id;
    }
  }

  return undefined;
}

/**
 * Send a message to the content script of a specific tab or the active tab.
 * Automatically skips extension internal pages (popup, dashboard) and finds
 * a regular web page tab that has the content script injected.
 */
export async function sendToContentScript<T = unknown, R = unknown>(
  type: string,
  payload: T,
  tabId?: number,
): Promise<R> {
  // If a specific tabId is provided and it's not an extension page, use it directly.
  // Otherwise, find a suitable tab.
  let targetTabId: number | undefined;

  if (typeof tabId === "number" && !Number.isNaN(tabId)) {
    // Check if the provided tabId is an extension page via single-tab lookup.
    try {
      const tab = await chrome.tabs.get(tabId);
      if (tab && !isExtensionPage(tab.url)) {
        targetTabId = tabId;
      }
    } catch {
      // Tab may no longer exist; fall through to findContentScriptTab.
    }
  }

  // If we don't have a valid target yet, find a content script tab.
  if (typeof targetTabId !== "number" || Number.isNaN(targetTabId)) {
    targetTabId = await findContentScriptTab();
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
