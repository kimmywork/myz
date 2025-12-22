export interface MessageHandler<T = any, R = any> {
  key: string;
  handler: (payload: T, sender: chrome.runtime.MessageSender) => Promise<R>;
}

const messageHandlers: Map<string, MessageHandler> = new Map();

export function registerMessageHandler<T = any, R = any>(
  key: string,
  handler: (payload: T, sender: chrome.runtime.MessageSender) => Promise<R>,
) {
  messageHandlers.set(key, { key, handler });
}

export async function handleMessage<T = any, R = any>(
  key: string,
  payload: T,
  sender: chrome.runtime.MessageSender,
): Promise<R> {
  const messageHandler = messageHandlers.get(key);
  if (!messageHandler) {
    throw new Error(`No handler registered for message key: ${key}`);
  }
  return messageHandler.handler(payload, sender);
}