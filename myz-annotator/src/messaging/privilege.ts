/**
 * Message privilege metadata, keyed to the typed contract so a mistyped or
 * removed message key fails to compile (previously two hand-maintained
 * `Set<string>`s in `trustedSender.ts` that could silently drift from the
 * handlers).
 *
 * - Privileged: only trusted extension pages (dashboard/options) may invoke.
 * - User gesture: additionally requires `payload.userGesture === true`.
 */
import type { MyzRuntimeType } from "./contract.js";

export const MYZ_PRIVILEGED_MESSAGES: ReadonlySet<MyzRuntimeType> =
  new Set<MyzRuntimeType>([
    "myz:syncUpdateSettings",
    "myz:syncNow",
    "myz:syncTestConnection",
    "myz:accountCreate",
    "myz:accountImport",
    "myz:accountClear",
    "myz:accountBootstrap",
    "myz:pairingInvite",
    "myz:pairingAccept",
    "myz:pairingApprove",
    // Settings: the full bundle (sealed S3 credentials) is extension-page only.
    "myz:getSettings",
    "myz:updateSettings",
    "myz:updatePalette",
    // Imports write records in bulk and are performed by the dashboard.
    "myz:importHighlights",
    // Capture cache: only content scripts may *write* an asset
    // (`myz:stageAsset`); reading/deleting is done from the stitch editor page.
    "myz:listStagedAssets",
    "myz:getStagedAsset",
    "myz:deleteStagedAsset",
    "myz:clearStagedAssets",
  ]);

export const MYZ_USER_GESTURE_MESSAGES: ReadonlySet<MyzRuntimeType> =
  new Set<MyzRuntimeType>([
    "myz:accountCreate",
    "myz:accountImport",
    "myz:accountClear",
    "myz:accountBootstrap",
    "myz:pairingInvite",
    "myz:pairingAccept",
    "myz:pairingApprove",
  ]);

export function isPrivilegedMessage(type: string): boolean {
  return MYZ_PRIVILEGED_MESSAGES.has(type as MyzRuntimeType);
}

export function requiresUserGesture(type: string): boolean {
  return MYZ_USER_GESTURE_MESSAGES.has(type as MyzRuntimeType);
}
