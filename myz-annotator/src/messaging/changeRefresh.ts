import type { ChangeBus, ChangeDomain } from "@myz/core/changes";
import { changeBus } from "./changes";

export interface SubscribeRefreshOptions {
  /** Bus to subscribe to; defaults to the shared extension bus (tests inject one). */
  bus?: ChangeBus;
  /** Coalesce bursts of events into one refresh. */
  delayMs?: number;
}

/**
 * Subscribe to the given change domains and coalesce bursts into one refresh.
 * Sync publishes `sync` + `records` + `inbox` together, and local actions
 * publish while the caller already reloads, so debouncing avoids duplicate
 * reads. Returns an unsubscribe that also clears a pending refresh.
 */
export function subscribeRefresh(
  domains: readonly ChangeDomain[],
  refresh: () => void,
  options: SubscribeRefreshOptions = {},
): () => void {
  const bus = options.bus ?? changeBus;
  const delayMs = options.delayMs ?? 100;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const unsubscribe = bus.subscribe((event) => {
    if (!domains.includes(event.domain)) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      refresh();
    }, delayMs);
  });

  return () => {
    unsubscribe();
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  };
}
