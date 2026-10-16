/**
 * Typed message-handler registry.
 *
 * A host defines one contract map per transport channel (message key →
 * `{ payload, result }`) and instantiates a registry from it. Registration is
 * then checked against the map, so unknown keys and payload/result drift fail
 * at compile time. Dispatch stays untyped on purpose: the wire payload is
 * untrusted until a matching handler runs, and the dispatcher only knows the
 * key as a runtime string.
 */

/** The payload/result shape a single message key carries. */
export interface MessageSpec {
  payload: unknown
  result: unknown
}

/** Maps message keys to their payload/result contract for one channel. */
export type MessageContract = Record<string, MessageSpec>

/** A handler for one key of a contract map. */
export type MessageHandler<M extends MessageContract, K extends keyof M> = (
  payload: M[K]["payload"],
  sender: chrome.runtime.MessageSender,
) => M[K]["result"] | Promise<M[K]["result"]>

/** Type-erased handler used for storage; `never` accepts any payload. */
type ErasedHandler = (
  payload: never,
  sender: chrome.runtime.MessageSender,
) => unknown

/**
 * Create a typed message-handler registry for one channel.
 *
 * - `registerMessageHandler<K>(key, handler)` — key and handler are checked
 *   against the contract map.
 * - `handleMessage(key, payload, sender)` — untyped dispatch for the wire
 *   boundary; throws when no handler is registered.
 * - `hasHandler(key)` — whether a key is registered.
 */
export function createMessageRegistry<M extends MessageContract>() {
  const handlers = new Map<string, ErasedHandler>()

  function registerMessageHandler<K extends keyof M>(
    key: K,
    handler: MessageHandler<M, K>,
  ): void {
    handlers.set(key as string, handler as unknown as ErasedHandler)
  }

  async function handleMessage(
    key: string,
    payload: unknown,
    sender: chrome.runtime.MessageSender,
  ): Promise<unknown> {
    const entry = handlers.get(key)
    if (!entry) {
      throw new Error(`No handler registered for message key: ${key}`)
    }
    return entry(payload as never, sender)
  }

  function hasHandler(key: string): boolean {
    return handlers.has(key)
  }

  return { registerMessageHandler, handleMessage, hasHandler }
}
