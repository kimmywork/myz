export function sendMessage(type, payload) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ type, payload }, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      if (!response) {
        reject(new Error("无响应"));
        return;
      }
      if (!response.ok) {
        reject(new Error(response.error || "未知错误"));
        return;
      }
      resolve(response.data);
    });
  });
}
