/**
 * Typed message-handler registry.
 *
 * A host defines one contract map per transport channel (message key →
 * `{ payload, result }`) and instantiates a registry from it. Registration is
 * then checked against the map, so unknown keys and payload/result drift fail
 * at compile time. Dispatch stays untyped on purpose: the wire payload is
 * untrusted until a matching handler runs, and the dispatcher only knows the
 * key as a runtime string.
 *
 * The module is host-agnostic: handlers receive a {@link MessageContext}, not a
 * `chrome.runtime.MessageSender`, so the same logic runs under a non-extension
 * transport (desktop in-process, mobile).
 */

/** The payload/result shape a single message key carries. */
export interface MessageSpec {
  payload: unknown
  result: unknown
}

/** Maps message keys to their payload/result contract for one channel. */
export type MessageContract = Record<string, MessageSpec>

/**
 * Host-agnostic view of a message sender, extracted by the transport adapter.
 * Carries only what domain handlers may rely on.
 */
export interface MessageContext {
  /** Tab the message came from, when there is one. */
  tabId?: number
  /** Window of that tab, when there is one. */
  windowId?: number
  /** Sender URL: the host page for content scripts, the extension page otherwise. */
  url?: string
  /** Whether the sender is one of this host's own trusted pages. */
  trusted: boolean
}

/** A handler for one key of a contract map. */
export type MessageHandler<M extends MessageContract, K extends keyof M> = (
  payload: M[K]["payload"],
  ctx: MessageContext,
) => M[K]["result"] | Promise<M[K]["result"]>

/** Type-erased handler used for storage; `never` accepts any payload. */
type ErasedHandler = (payload: never, ctx: MessageContext) => unknown

/**
 * Create a typed message-handler registry for one channel.
 *
 * - `registerMessageHandler<K>(key, handler)` — key and handler are checked
 *   against the contract map.
 * - `handleMessage(key, payload, ctx)` — untyped dispatch for the wire
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
    ctx: MessageContext,
  ): Promise<unknown> {
    const entry = handlers.get(key)
    if (!entry) {
      throw new Error(`No handler registered for message key: ${key}`)
    }
    return entry(payload as never, ctx)
  }

  function hasHandler(key: string): boolean {
    return handlers.has(key)
  }

  return { registerMessageHandler, handleMessage, hasHandler }
}
