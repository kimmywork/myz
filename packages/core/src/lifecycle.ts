import {
  DEFAULT_INBOX_STATUS,
  INBOX_STATUSES,
  isInboxPending,
  resolveInboxStatus,
  type InboxStatus,
  type InboxStatusState,
} from "@myz/shared/inbox";

/**
 * Lifecycle model.
 *
 * Inbox status is one instance of a generic, orthogonal lifecycle on a record
 * (§4.4). Only `record` scope is supported today (§10/2); the `LifecycleScope`
 * parameter is the seam for a future source-level lifecycle.
 */

export const LIFECYCLE_STATUSES = INBOX_STATUSES;
export type LifecycleStatus = InboxStatus;

export const DEFAULT_LIFECYCLE_STATUS: LifecycleStatus = DEFAULT_INBOX_STATUS;

/** Scope of a lifecycle state. Source scope is deliberately out of scope. */
export type LifecycleScope = "record";

/** Terminal statuses record a `handledAt` timestamp. */
const TERMINAL_STATUSES: ReadonlySet<LifecycleStatus> = new Set([
  "kept",
  "archived",
]);

export function currentLifecycleStatus(
  state: InboxStatusState | null | undefined,
): LifecycleStatus {
  return resolveInboxStatus(state);
}

export function isLifecycleActive(
  state: InboxStatusState | null | undefined,
  now?: number,
): boolean {
  return isInboxPending(state, now);
}

/**
 * Pure lifecycle transition. Marks `handledAt` on terminal statuses; it does
 * NOT persist or touch the badge — those side effects stay in the host
 * (plan §7 I4/I5).
 */
export function transitionLifecycle(
  targetId: string,
  status: LifecycleStatus,
  options: { snoozedUntil?: string; now?: string } = {},
): InboxStatusState {
  const changedAt = options.now ?? new Date().toISOString();
  return {
    targetId,
    status,
    changedAt,
    ...(status === "snoozed" && options.snoozedUntil
      ? { snoozedUntil: options.snoozedUntil }
      : {}),
    ...(TERMINAL_STATUSES.has(status) ? { handledAt: changedAt } : {}),
  };
}
