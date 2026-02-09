import { handleMessage, hasHandler } from "./messages/handler";
import { initializeAiMessageHandlers } from "./messages/ai";
import { initializeHighlightMessageHandlers } from "./messages/highlights";
import { initializeSocialMessageHandlers } from "./messages/social";
import { initializeZenMessageHandlers } from "./messages/zen";
import { initializeSuperpowerMessageHandlers } from "./messages/superpower";

// Initialize handlers
initializeAiMessageHandlers();
initializeHighlightMessageHandlers();
initializeSocialMessageHandlers();
initializeZenMessageHandlers();
initializeSuperpowerMessageHandlers();

export interface MessagePayload {
  type: string;
  payload?: any;
}

export function messageListener(
  message: MessagePayload,
  sender: chrome.runtime.MessageSender,
  sendResponse: (response?: any) => void,
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
