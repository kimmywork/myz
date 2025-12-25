export interface MessageHandler<T = any, R = any> {
  key: string;
  handler: (payload: T, sender: chrome.runtime.MessageSender) => Promise<R> | R;
}

const messageHandlers: Map<string, MessageHandler> = new Map();

export function registerMessageHandler<T = any, R = any>(
  key: string,
  handler: (payload: T, sender: chrome.runtime.MessageSender) => Promise<R> | R,
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

export function hasHandler(key: string): boolean {
  return messageHandlers.has(key);
}
