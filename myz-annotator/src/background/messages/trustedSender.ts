import {
  isPrivilegedMessage,
  requiresUserGesture,
} from "@/messaging/privilege.js";

type Sender = chrome.runtime.MessageSender | undefined;

export function isTrustedExtensionPage(sender: Sender): boolean {
  if (!sender) return false;
  const url = sender.url;
  if (!url) return false;
  const extensionId = chrome.runtime?.id;
  if (!extensionId) return false;
  // Trust only our own extension pages. Content scripts report the host page
  // URL here (and have `sender.tab` set), so this rejects them. Note extension
  // pages opened in a tab (options/dashboard) *do* carry `sender.tab`, so the
  // check must not require `sender.tab === undefined`.
  return url.startsWith(`chrome-extension://${extensionId}/`);
}

export type AuthorizationResult = { ok: true } | { ok: false; error: string };

/**
 * Authorize an incoming runtime message. Privilege and user-gesture metadata
 * live in `@/messaging/privilege.ts`, keyed to the typed message contract, so a
 * message that is added/removed/renamed cannot silently fall out of sync with
 * its authorization policy.
 */
export function authorizeMessage(
  type: string,
  payload: unknown,
  sender: Sender,
): AuthorizationResult {
  if (!isPrivilegedMessage(type)) {
    return { ok: true };
  }
  if (!isTrustedExtensionPage(sender)) {
    return {
      ok: false,
      error: "Unauthorized sender for privileged sync message",
    };
  }
  if (requiresUserGesture(type)) {
    const userGesture = (payload as { userGesture?: unknown } | undefined)
      ?.userGesture;
    if (userGesture !== true) {
      return { ok: false, error: "User gesture required for key changes" };
    }
  }
  return { ok: true };
}
