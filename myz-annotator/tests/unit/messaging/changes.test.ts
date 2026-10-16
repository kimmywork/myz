import { afterEach, describe, expect, it, vi } from "vitest";
import { createChangeBus } from "@/messaging/changes";

/** Minimal in-process BroadcastChannel: delivers to peers of the same name. */
class FakeBroadcastChannel {
  static channels = new Set<FakeBroadcastChannel>();
  onmessage: ((event: { data: unknown }) => void) | null = null;
  constructor(public name: string) {
    FakeBroadcastChannel.channels.add(this);
  }
  postMessage(data: unknown): void {
    for (const channel of FakeBroadcastChannel.channels) {
      if (channel !== this && channel.name === this.name) {
        channel.onmessage?.({ data });
      }
    }
  }
  close(): void {
    FakeBroadcastChannel.channels.delete(this);
  }
}

describe("changeBus", () => {
  afterEach(() => {
    FakeBroadcastChannel.channels.clear();
    vi.unstubAllGlobals();
  });

  it("delivers events between contexts over BroadcastChannel", () => {
    vi.stubGlobal("BroadcastChannel", FakeBroadcastChannel);
    const page = createChangeBus();
    const worker = createChangeBus();
    const received: string[] = [];
    page.subscribe((event) => received.push(event.domain));

    worker.publish({ domain: "records", ids: ["r1"] });

    expect(received).toEqual(["records"]);
  });

  it("falls back to chrome.storage.onChanged", () => {
    vi.stubGlobal("BroadcastChannel", undefined);
    const handlers: Array<(changes: unknown, area: string) => void> = [];
    vi.stubGlobal("chrome", {
      storage: {
        onChanged: {
          addListener: (fn: (changes: unknown, area: string) => void) =>
            handlers.push(fn),
          removeListener: () => {},
        },
        local: {
          set: (value: Record<string, unknown>) => {
            const changes = Object.fromEntries(
              Object.entries(value).map(([key, v]) => [key, { newValue: v }]),
            );
            handlers.forEach((fn) => fn(changes, "local"));
          },
        },
      },
    });

    const bus = createChangeBus();
    const received: string[] = [];
    bus.subscribe((event) => received.push(event.domain));
    bus.publish({ domain: "inbox" });

    expect(received).toEqual(["inbox"]);
  });

  it("deduplicates delivery across both channels", () => {
    vi.stubGlobal("BroadcastChannel", FakeBroadcastChannel);
    const handlers: Array<(changes: unknown, area: string) => void> = [];
    vi.stubGlobal("chrome", {
      storage: {
        onChanged: {
          addListener: (fn: (changes: unknown, area: string) => void) =>
            handlers.push(fn),
          removeListener: () => {},
        },
        local: {
          set: (value: Record<string, unknown>) => {
            const changes = Object.fromEntries(
              Object.entries(value).map(([key, v]) => [key, { newValue: v }]),
            );
            handlers.forEach((fn) => fn(changes, "local"));
          },
        },
      },
    });

    const page = createChangeBus();
    const worker = createChangeBus();
    const received: string[] = [];
    page.subscribe((event) => received.push(event.id));

    // Delivered on both BroadcastChannel and chrome.storage, but the shared
    // event id collapses them into one delivery.
    worker.publish({ domain: "records" });

    expect(received).toHaveLength(1);
  });

  it("stops delivery after unsubscribe", () => {
    vi.stubGlobal("BroadcastChannel", FakeBroadcastChannel);
    const page = createChangeBus();
    const worker = createChangeBus();
    const received: string[] = [];
    const off = page.subscribe((event) => received.push(event.domain));
    off();

    worker.publish({ domain: "settings" });

    expect(received).toEqual([]);
  });
});
