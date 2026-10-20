import type { Scheduler } from "@myz/core/ports";
import type { SyncTimers } from "@myz/sync-core/orchestrator";
import { scheduler } from "../../runtime";

/**
 * Lease-renewal timers for the orchestrator.
 *
 * `chrome.alarms` survives MV3 worker suspension but its minimum period is 30s.
 * When the requested renewal cadence is at/above that floor we use the host
 * `Scheduler` port; below it we fall back to `setInterval`, which is safe because
 * the running sync itself keeps the worker alive (if the worker dies, the sync
 * dies with it and the lease simply expires).
 */
const ALARM_FLOOR_MS = 30_000;
const ALARM_NAME = "myz-sync-lock";

/** Handle returned for alarm-backed intervals. */
interface AlarmHandle {
  alarm: string;
}

/**
 * Distinguish our alarm handle from the host timer id. In browsers the id is a
 * number, but Node (and some hosts) return an object, so a `typeof === "number"`
 * check would misclassify native intervals in tests.
 */
function isAlarmHandle(handle: unknown): handle is AlarmHandle {
  return (
    typeof handle === "object" &&
    handle !== null &&
    typeof (handle as AlarmHandle).alarm === "string"
  );
}

export function createSyncTimers(sched: Scheduler = scheduler): SyncTimers {
  let handler: (() => void) | null = null;
  let subscribed = false;

  return {
    setInterval(fn, ms) {
      if (ms < ALARM_FLOOR_MS) return setInterval(fn, ms);
      if (!subscribed) {
        subscribed = true;
        sched.onTick((name) => {
          if (name === ALARM_NAME) handler?.();
        });
      }
      handler = fn;
      void sched.every(ALARM_NAME, ms / 60_000).catch(() => undefined);
      return { alarm: ALARM_NAME } satisfies AlarmHandle;
    },
    clearInterval(handle) {
      if (isAlarmHandle(handle)) {
        handler = null;
        void sched.cancel(handle.alarm).catch(() => undefined);
        return;
      }
      clearInterval(handle as number);
    },
  };
}

/** Process-wide timer adapter passed to `runAccountSync`. */
export const syncTimers = createSyncTimers();

/**
 * Cancel a lock-renewal alarm left behind by a terminated worker. Call once at
 * startup: if the worker died mid-sync, the alarm keeps waking it for nothing.
 */
export function cancelStaleLockRenewal(): void {
  void scheduler.cancel(ALARM_NAME).catch(() => undefined);
}
