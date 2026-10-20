import type { ChangeBus, ChangeEvent } from "@myz/core/changes";
import { afterEach, describe, expect, it, vi } from "vitest";
import { subscribeRefresh } from "@/messaging/changeRefresh";

function fakeBus(): ChangeBus {
  const listeners = new Set<(event: ChangeEvent) => void>();
  let seq = 0;
  return {
    publish({ domain, ids }) {
      const event: ChangeEvent = {
        id: `e${++seq}`,
        domain,
        ids,
        at: Date.now(),
      };
      for (const listener of [...listeners]) listener(event);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

describe("subscribeRefresh", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("coalesces a burst of matching events into one refresh", () => {
    vi.useFakeTimers();
    const bus = fakeBus();
    const refresh = vi.fn();
    const off = subscribeRefresh(["records"], refresh, { bus, delayMs: 50 });

    bus.publish({ domain: "records" });
    bus.publish({ domain: "records" });
    bus.publish({ domain: "records" });

    expect(refresh).not.toHaveBeenCalled();
    vi.advanceTimersByTime(50);
    expect(refresh).toHaveBeenCalledTimes(1);
    off();
  });

  it("ignores domains it did not subscribe to", () => {
    vi.useFakeTimers();
    const bus = fakeBus();
    const refresh = vi.fn();
    const off = subscribeRefresh(["records", "sync"], refresh, {
      bus,
      delayMs: 20,
    });

    bus.publish({ domain: "inbox" });
    bus.publish({ domain: "settings" });
    vi.advanceTimersByTime(20);
    expect(refresh).not.toHaveBeenCalled();

    bus.publish({ domain: "sync" });
    vi.advanceTimersByTime(20);
    expect(refresh).toHaveBeenCalledTimes(1);
    off();
  });

  it("clears a pending refresh on unsubscribe", () => {
    vi.useFakeTimers();
    const bus = fakeBus();
    const refresh = vi.fn();
    const off = subscribeRefresh(["records"], refresh, { bus, delayMs: 50 });

    bus.publish({ domain: "records" });
    off();
    vi.advanceTimersByTime(50);
    expect(refresh).not.toHaveBeenCalled();
  });
});
