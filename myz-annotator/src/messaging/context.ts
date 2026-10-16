import type { MessageContext } from "@myz/shared/messageRegistry";

/**
 * Whether a sender is one of this extension's own trusted pages. Content
 * scripts report the host page URL here (and carry `sender.tab`), so they are
 * rejected; extension pages opened in a tab (options/dashboard) do carry
 * `sender.tab`, so the check must not require `sender.tab === undefined`.
 */
export function isTrustedExtensionPage(
  sender: chrome.runtime.MessageSender | undefined,
): boolean {
  if (!sender) return false;
  const url = sender.url;
  if (!url) return false;
  const extensionId = chrome.runtime?.id;
  if (!extensionId) return false;
  return url.startsWith(`chrome-extension://${extensionId}/`);
}

/**
 * Extract the host-agnostic {@link MessageContext} from a chrome sender, so
 * domain handlers never depend on `chrome.runtime.MessageSender`.
 */
export function toMessageContext(
  sender: chrome.runtime.MessageSender | undefined,
): MessageContext {
  return {
    tabId: sender?.tab?.id,
    windowId: sender?.tab?.windowId,
    url: sender?.url,
    trusted: isTrustedExtensionPage(sender),
  };
}
