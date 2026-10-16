/**
 * Transport port.
 *
 * A host-agnostic message channel a host can register handlers on and invoke
 * through. The extension implements it over `chrome.runtime` / `chrome.tabs`
 * (`myz-annotator/src/messaging/transport.ts`); desktop/mobile implement it as
 * an in-process call with no serialization. Domain handlers depend only on
 * {@link MessageContext}, so the same logic runs on every host.
 */
import type {
  MessageContext,
  MessageContract,
  MessageHandler,
} from "./messageRegistry"

export interface Transport<M extends MessageContract> {
  /** Send a request on this channel and await the handler's result. */
  invoke<K extends keyof M>(type: K, payload: M[K]["payload"]): Promise<M[K]["result"]>
  /** Register the handler for a key of this channel's contract. */
  handle<K extends keyof M>(type: K, handler: MessageHandler<M, K>): void
  /** Whether a key has a registered handler. */
  has(type: string): boolean
  /** Dispatch an inbound wire message (untyped boundary). */
  run(type: string, payload: unknown, ctx: MessageContext): Promise<unknown>
}
