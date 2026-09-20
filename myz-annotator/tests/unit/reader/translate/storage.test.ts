import { afterEach, describe, expect, it } from "vitest";
import {
  createChromeStorageTranslationCache,
  createMemoryTranslationCache,
} from "@/reader/translate/storage.js";

interface FakeGlobals {
  chrome?: unknown;
}

const globals = globalThis as unknown as FakeGlobals;

afterEach(() => {
  delete globals.chrome;
});

function installChromeStorage() {
  const store: Record<string, unknown> = {};
  globals.chrome = {
    storage: {
      local: {
        get: async (keys: string | string[]) => {
          const list = Array.isArray(keys) ? keys : [keys];
          const out: Record<string, unknown> = {};
          for (const key of list) {
            if (key in store) {
              out[key] = store[key];
            }
          }
          return out;
        },
        set: async (items: Record<string, unknown>) => {
          Object.assign(store, items);
        },
      },
    },
  };
  return store;
}

describe("createChromeStorageTranslationCache", () => {
  it("stores entries in chrome.storage.local under a namespaced key", async () => {
    const store = installChromeStorage();
    const cache = createChromeStorageTranslationCache();

    await cache.set("en:zh:abc", "你好");

    expect(store["myz:translate:en:zh:abc"]).toBe("你好");
    await expect(cache.get("en:zh:abc")).resolves.toBe("你好");
    await expect(cache.get("en:zh:missing")).resolves.toBeUndefined();
  });

  it("falls back to memory when chrome.storage is absent", async () => {
    const cache = createChromeStorageTranslationCache();
    await cache.set("k", "v");
    await expect(cache.get("k")).resolves.toBe("v");
  });
});

describe("createMemoryTranslationCache", () => {
  it("round-trips values", async () => {
    const cache = createMemoryTranslationCache();
    await cache.set("k", "v");
    await expect(cache.get("k")).resolves.toBe("v");
    await expect(cache.get("other")).resolves.toBeUndefined();
  });
});
