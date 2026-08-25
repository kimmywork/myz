type MessageHandler<T = unknown, R = unknown> = (
  payload: T,
  sender: chrome.runtime.MessageSender,
) => Promise<R> | R

interface RegistryEntry {
  key: string
  handler: MessageHandler<unknown, unknown>
}

/**
 * 创建一个消息处理器注册表。background service worker 与 content script
 * 共用同一套注册/分发逻辑；handler 可返回 Promise 或同步值。
 */
export function createMessageRegistry() {
  const handlers: Map<string, RegistryEntry> = new Map()

  function registerMessageHandler<T = unknown, R = unknown>(
    key: string,
    handler: MessageHandler<T, R>,
  ) {
    handlers.set(key, {
      key,
      handler: (payload, sender) =>
        Promise.resolve(handler(payload as T, sender)),
    })
  }

  async function handleMessage<T = unknown, R = unknown>(
    key: string,
    payload: T,
    sender: chrome.runtime.MessageSender,
  ): Promise<R> {
    const entry = handlers.get(key)
    if (!entry) {
      throw new Error(`No handler registered for message key: ${key}`)
    }
    return entry.handler(payload, sender) as Promise<R>
  }

  function hasHandler(key: string): boolean {
    return handlers.has(key)
  }

  return { registerMessageHandler, handleMessage, hasHandler }
}
