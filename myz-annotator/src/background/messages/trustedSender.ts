import type { MessageContext } from "@myz/shared/messageRegistry";
import {
  isPrivilegedMessage,
  requiresUserGesture,
} from "@/messaging/privilege.js";

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
  ctx: MessageContext,
): AuthorizationResult {
  if (!isPrivilegedMessage(type)) {
    return { ok: true };
  }
  if (!ctx.trusted) {
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
