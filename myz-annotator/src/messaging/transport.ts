import {
  createMessageRegistry,
  type MessageContract,
  type MessageHandler,
} from "@myz/shared/messageRegistry";
import { sendMessage } from "@myz/shared/messaging";
import type { Transport } from "@myz/shared/transport";

/**
 * Chrome-backed runtime transport (UI / content script / popup / readers →
 * background service worker). `sendMessage` is the shared, browser-only chrome
 * adapter; dispatch goes through the host-agnostic registry. A desktop/mobile
 * host implements the same {@link Transport} with an in-process call instead.
 */
export function createRuntimeTransport<
  M extends MessageContract,
>(): Transport<M> {
  const registry = createMessageRegistry<M>();
  return {
    invoke<K extends keyof M>(
      type: K,
      payload: M[K]["payload"],
    ): Promise<M[K]["result"]> {
      return sendMessage<M[K]["payload"], M[K]["result"]>(
        type as string,
        payload,
      );
    },
    handle<K extends keyof M>(type: K, handler: MessageHandler<M, K>): void {
      registry.registerMessageHandler(type, handler);
    },
    has: (type) => registry.hasHandler(type),
    run: (type, payload, ctx) => registry.handleMessage(type, payload, ctx),
  };
}
