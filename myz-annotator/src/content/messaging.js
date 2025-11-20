// Messaging utilities for content scripts

export function sendMessage(type, payload) {
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

      if (!response) {
        reject(new Error("No response from background"));
        return;
      }

      if (!response.ok) {
        reject(new Error(response.error || "Unknown error"));
        return;
      }

      resolve(response.data);
    });
  });
}

export function addMessageListener(handler) {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    const result = handler(message, sender);

    if (result && typeof result.then === "function") {
      // Handle async handlers
      result
        .then((data) => sendResponse({ ok: true, data }))
        .catch((error) => sendResponse({ ok: false, error: error.message }));
      return true; // Keep message channel open for async response
    } else if (result !== undefined) {
      // Handle sync handlers
      sendResponse({ ok: true, data: result });
    }
  });
}
