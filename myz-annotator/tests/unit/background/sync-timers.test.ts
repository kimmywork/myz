// @vitest-environment node
import type { Scheduler } from "@myz/core/ports";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createSyncTimers } from "@/background/sync/v2/timers";

function fakeScheduler() {
  let tick: ((name: string) => void) | null = null;
  const every = vi.fn(async () => {});
  const cancel = vi.fn(async () => {});
  const sched: Scheduler = {
    every,
    once: vi.fn(async () => {}),
    cancel,
    has: vi.fn(async () => false),
    onTick: (listener) => {
      tick = listener;
      return () => {};
    },
  };
  return { sched, every, cancel, fire: (name: string) => tick?.(name) };
}

describe("sync lease timers", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("uses setInterval below the alarm floor", () => {
    vi.useFakeTimers();
    const { sched, every } = fakeScheduler();
    const fn = vi.fn();
    const timers = createSyncTimers(sched);

    const handle = timers.setInterval(fn, 15_000);
    vi.advanceTimersByTime(15_000);

    expect(fn).toHaveBeenCalledTimes(1);
    expect(every).not.toHaveBeenCalled();

    // The native interval must actually stop (Node returns a Timeout object).
    timers.clearInterval(handle);
    vi.advanceTimersByTime(15_000);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("uses the host scheduler at or above the alarm floor", () => {
    const { sched, every, cancel, fire } = fakeScheduler();
    const fn = vi.fn();
    const timers = createSyncTimers(sched);

    const handle = timers.setInterval(fn, 30_000);
    expect(every).toHaveBeenCalledWith("myz-sync-lock", 0.5);

    fire("myz-sync-lock");
    expect(fn).toHaveBeenCalledTimes(1);

    fire("some-other-alarm");
    expect(fn).toHaveBeenCalledTimes(1);

    timers.clearInterval(handle);
    expect(cancel).toHaveBeenCalledWith("myz-sync-lock");
  });

  it("clears native timer handles that are objects (Node)", () => {
    const nativeHandle = { ref: () => {}, unref: () => {} };
    const clearSpy = vi.fn();
    vi.stubGlobal("setInterval", vi.fn(() => nativeHandle));
    vi.stubGlobal("clearInterval", clearSpy);

    const { sched } = fakeScheduler();
    const timers = createSyncTimers(sched);
    const handle = timers.setInterval(() => {}, 15_000);
    timers.clearInterval(handle);

    expect(clearSpy).toHaveBeenCalledWith(nativeHandle);
    vi.unstubAllGlobals();
  });

  it("subscribes to the scheduler once across renewals", () => {
    const { sched } = fakeScheduler();
    const timers = createSyncTimers(sched);
    const onTick = vi.spyOn(sched, "onTick");

    const first = timers.setInterval(() => {}, 60_000);
    const second = timers.setInterval(() => {}, 60_000);
    expect(onTick).toHaveBeenCalledTimes(1);

    timers.clearInterval(first);
    timers.clearInterval(second);
  });
});
