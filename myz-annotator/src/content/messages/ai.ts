/**
 * Content-side handler that fills an external AI chat composer.
 *
 * Registered on every page, but only the chat tab ever receives the message:
 * the background targets it after resolving/opening that provider's tab.
 */
import { composeInChat } from "../ai-compose";
import type { AiComposePayload } from "../ai-compose";
import { registerMessageHandler } from "./handler";

export function initializeAiMessageHandlers() {
  registerMessageHandler("myz:aiCompose", (payload: AiComposePayload) =>
    composeInChat(payload),
  );
}
