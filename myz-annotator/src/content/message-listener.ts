import { initializeConvertMessageHandlers } from "./messages/convert";
import { handleMessage, hasHandler } from "./messages/handler";
import { initializeHighlightMessageHandlers } from "./messages/highlights";
import { initializeZenMessageHandlers } from "./messages/zen";

// Initialize handlers
initializeHighlightMessageHandlers();
initializeConvertMessageHandlers();
initializeZenMessageHandlers();

export interface MessagePayload {
  type: string;
  payload?: unknown;
}

export function messageListener(
  message: MessagePayload,
  sender: chrome.runtime.MessageSender,
  sendResponse: (response?: unknown) => void,
) {
  if (!message || !message.type) {
    return false;
  }

  if (hasHandler(message.type)) {
    handleMessage(message.type, message.payload, sender)
      .then((data) => {
        sendResponse({ ok: true, data });
      })
      .catch((error) => {
        console.error(`Handler error for ${message.type}`, error);
        sendResponse({ ok: false, error: error.message || String(error) });
      });
    return true; // Async response
  }

  return false;
}
