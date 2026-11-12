// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const INTENT_KEY = "myz_reader_removal_intents";

/** Minimal chrome.storage.local with switchable failure modes. */
const storage = new Map<string, unknown>();
let getFails = false;
let setFails = false;
const setSpy = vi.fn();
const getSpy = vi.fn();

(globalThis as unknown as { chrome: unknown }).chrome = {
  storage: {
    local: {
      get: async (key: string) => {
        getSpy(key);
        if (getFails) throw new Error("storage read failed");
        return { [key]: storage.get(key) };
      },
      set: async (items: Record<string, unknown>) => {
        setSpy(items);
        if (setFails) throw new Error("storage write failed");
        Object.entries(items).forEach(([key, value]) =>
          storage.set(key, value),
        );
      },
      remove: async (key: string) => {
        storage.delete(key);
      },
    },
  },
};

vi.mock("@/reader/progress-store", () => ({
  readerProgress: { get: vi.fn(async () => undefined), remove: vi.fn() },
}));

import { createRemovalIntents } from "@/dashboard/pages/readers/removal-intents";

function doc(key: string) {
  return {
    key,
    kind: "epub" as const,
    sourceKey: `myz-epub:local:${key}`,
    fingerprint: key,
    title: `Doc ${key}`,
  };
}

describe("createRemovalIntents", () => {
  beforeEach(() => {
    storage.clear();
    setSpy.mockClear();
    getSpy.mockClear();
    getFails = false;
    setFails = false;
  });

  it("does not overwrite stored intents when the read fails", async () => {
    // An earlier removal is already queued...
    storage.set(INTENT_KEY, [{ ...doc("a"), dueAt: Date.now() + 5_000 }]);
    // ...and reading it back fails.
    getFails = true;

    const intents = createRemovalIntents();
    await expect(intents.persist("queue", [doc("b")])).rejects.toThrow();

    // Nothing was written, so intent `a` survives instead of being replaced.
    expect(setSpy).not.toHaveBeenCalled();
    const stored = storage.get(INTENT_KEY) as Array<{ key: string }>;
    expect(stored.map((intent) => intent.key)).toEqual(["a"]);
  });

  it("still writes when the read succeeds", async () => {
    const intents = createRemovalIntents();
    await intents.persist("queue", [doc("b")]);

    expect(setSpy).toHaveBeenCalledTimes(1);
    const stored = storage.get(INTENT_KEY) as Array<{ key: string }>;
    expect(stored.map((intent) => intent.key)).toEqual(["b"]);
  });

  it("keeps the chain usable after a failed write", async () => {
    setFails = true;
    const intents = createRemovalIntents();
    await expect(intents.persist("queue", [doc("a")])).rejects.toThrow();

    setFails = false;
    await intents.persist("queue", [doc("b")]);
    const stored = storage.get(INTENT_KEY) as Array<{ key: string }>;
    expect(stored.map((intent) => intent.key)).toEqual(["b"]);
  });
});
