type Sender = chrome.runtime.MessageSender | undefined;

// Messages only trusted extension pages (dashboard/options) may invoke. Keep
// this in sync with the handlers registered in ./messages/*.ts: non-privileged
// reads/writes for content scripts are `myz:getPublicSettings` and
// `myz:updateHighlightPreference`.
const PRIVILEGED_MESSAGES = new Set<string>([
  "myz:syncSetKey",
  "myz:syncClearKey",
  "myz:syncUpdateSettings",
  "myz:syncNow",
  "myz:syncTestConnection",
  "myz:accountCreate",
  "myz:accountImport",
  "myz:accountClear",
  "myz:accountBootstrap",
  "myz:accountMigrateLegacy",
  "myz:pairingInvite",
  "myz:pairingAccept",
  "myz:pairingApprove",
  // Settings: the full bundle (sealed S3 credentials) is extension-page only.
  "myz:getSettings",
  "myz:updateSettings",
  "myz:updatePalette",
  // Imports write records in bulk and are performed by the dashboard.
  "myz:importHighlights",
]);

const USER_GESTURE_MESSAGES = new Set<string>([
  "myz:syncSetKey",
  "myz:syncClearKey",
  "myz:accountCreate",
  "myz:accountImport",
  "myz:accountClear",
  "myz:accountBootstrap",
  "myz:accountMigrateLegacy",
  "myz:pairingInvite",
  "myz:pairingAccept",
  "myz:pairingApprove",
]);

export function isPrivilegedMessage(type: string): boolean {
  return PRIVILEGED_MESSAGES.has(type);
}

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
  if (USER_GESTURE_MESSAGES.has(type)) {
    const userGesture = (payload as { userGesture?: unknown } | undefined)
      ?.userGesture;
    if (userGesture !== true) {
      return { ok: false, error: "User gesture required for key changes" };
    }
  }
  return { ok: true };
}
