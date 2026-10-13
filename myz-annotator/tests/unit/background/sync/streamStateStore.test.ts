// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const store = new Map<string, unknown>();

vi.mock("@/background/sync/storage", () => ({
  readStreamState: async (streamId: string) => store.get(streamId) ?? null,
  writeStreamState: async (record: { streamId: string }) => {
    store.set(record.streamId, record);
  },
}));

import { createStreamStateStore } from "@/background/sync/v2/stateStore";

const state = {
  streamVersion: 7,
  shardHashes: { "0": "hash" },
  tombstones: { r1: "2026-01-01T00:00:00.000Z" },
};

describe("account-scoped stream state", () => {
  beforeEach(() => store.clear());

  it("round-trips state for the same account", async () => {
    const account = createStreamStateStore("acct_a");
    await account.setStreamState("h:x", state);
    expect(await account.getStreamState("h:x")).toEqual(state);
    expect(store.get("h:x")).toMatchObject({ accountId: "acct_a" });
  });

  it("ignores state written under another account", async () => {
    await createStreamStateStore("acct_a").setStreamState("h:x", state);
    const other = createStreamStateStore("acct_b");
    expect(await other.getStreamState("h:x")).toBeNull();
    // Writing under the new account overwrites the stale record.
    await other.setStreamState("h:x", { ...state, streamVersion: 1 });
    expect(await other.getStreamState("h:x")).toMatchObject({
      streamVersion: 1,
    });
    expect(
      await createStreamStateStore("acct_a").getStreamState("h:x"),
    ).toBeNull();
  });

  it("ignores legacy records that predate account scoping", async () => {
    store.set("h:y", { streamId: "h:y", ...state });
    expect(
      await createStreamStateStore("acct_a").getStreamState("h:y"),
    ).toBeNull();
  });
});
