export async function sendMessage<Payload, Result = unknown>(
  type: string,
  payload?: Payload,
): Promise<Result> {
  return new Promise((resolve, reject) => {
    if (!chrome || !chrome.runtime) {
      reject(new Error("Chrome runtime not available"))
      return
    }

    chrome.runtime.sendMessage(
      { type, payload },
      (response: { data?: Result; error?: string; ok?: boolean }) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message))
          return
        }
        if (!response) {
          reject(new Error("无响应"))
          return
        }
        if (!response.ok) {
          reject(new Error(response.error || "未知错误"))
          return
        }

        resolve(response.data || (response as Result))
      },
    )
  })
}

export async function sendMessageToTab<Type, Payload, Response = unknown>(
  tabId: number,
  type: Type,
  payload: Payload,
): Promise<Response> {
  return new Promise((resolve, reject) => {
    if (!chrome || !chrome.tabs) {
      reject(new Error("Chrome tabs API not available"))
      return
    }

    chrome.tabs.sendMessage(tabId, { type, payload }, (response: Response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message))
        return
      }

      resolve(response)
    })
  })
}

export function addMessageListener<Message, Result>(
  handler: (
    message: Message,
    sender: chrome.runtime.MessageSender,
  ) => Promise<Result>,
) {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    const result = handler(message, sender)

    if (result && typeof result.then === "function") {
      // Handle async handlers
      result
        .then((data) => sendResponse({ ok: true, data }))
        .catch((error: Error) =>
          sendResponse({ ok: false, error: error.message }),
        )
      return true; // Keep message channel open for async response
    } else if (result !== undefined) {
      // Handle sync handlers
      sendResponse({ ok: true, data: result })
    }
  })
}
