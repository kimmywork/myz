export interface MessageHandler<T = unknown, R = unknown> {
  key: string;
  handler: (payload: T, sender: chrome.runtime.MessageSender) => Promise<R> | R;
}

const messageHandlers: Map<
  string,
  MessageHandler<unknown, unknown>
> = new Map();

export function registerMessageHandler<T = unknown, R = unknown>(
  key: string,
  handler: (payload: T, sender: chrome.runtime.MessageSender) => Promise<R> | R,
) {
  messageHandlers.set(key, {
    key,
    handler: (payload, sender) =>
      Promise.resolve(handler(payload as T, sender)),
  });
}

export async function handleMessage<T = unknown, R = unknown>(
  key: string,
  payload: T,
  sender: chrome.runtime.MessageSender,
): Promise<R> {
  const messageHandler = messageHandlers.get(key);
  if (!messageHandler) {
    throw new Error(`No handler registered for message key: ${key}`);
  }
  return messageHandler.handler(payload, sender) as Promise<R>;
}

export function hasHandler(key: string): boolean {
  return messageHandlers.has(key);
}
