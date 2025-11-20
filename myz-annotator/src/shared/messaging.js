export async function sendMessage(type, payload) {
  return new Promise((resolve, reject) => {
    if (!chrome || !chrome.runtime) {
      reject(new Error("Chrome runtime not available"));
      return;
    }

    chrome.runtime.sendMessage({ type, payload }, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }

      if (!response || response.error) {
        reject(new Error(response?.error || "Unknown error"));
        return;
      }

      resolve(response.data || response);
    });
  });
}

export async function sendMessageToTab(tabId, type, payload) {
  return new Promise((resolve, reject) => {
    if (!chrome || !chrome.tabs) {
      reject(new Error("Chrome tabs API not available"));
      return;
    }

    chrome.tabs.sendMessage(tabId, { type, payload }, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }

      resolve(response);
    });
  });
}
