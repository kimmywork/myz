/**
 * IndexedDB-backed translation cache (local only, never synced).
 *
 * Kept separate from the reader progress databases so clearing translation
 * history cannot touch reading progress, and vice versa.
 */

import { idbGet, idbPut, openDatabase } from "@myz/shared/idb";
import type { TranslationCache } from "./cache.js";

const DB_NAME = "myz_translate_db";
const DB_VERSION = 1;
const STORE_NAME = "entries";

interface CachedTranslation {
  key: string;
  value: string;
  updatedAt: string;
}

function getDb(): Promise<IDBDatabase> {
  return openDatabase({
    name: DB_NAME,
    version: DB_VERSION,
    upgrade: (db) => {
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "key" });
      }
    },
  });
}

export function createIndexedDbTranslationCache(): TranslationCache {
  return {
    async get(key) {
      try {
        const entry = await idbGet<CachedTranslation>(
          await getDb(),
          STORE_NAME,
          key,
        );
        return entry?.value;
      } catch {
        return undefined;
      }
    },
    async set(key, value) {
      try {
        await idbPut(await getDb(), STORE_NAME, {
          key,
          value,
          updatedAt: new Date().toISOString(),
        } satisfies CachedTranslation);
      } catch {
        // A cache write failure must never fail the translation.
      }
    },
  };
}

/** In-memory cache, used by tests and as a fallback when IndexedDB is absent. */
export function createMemoryTranslationCache(): TranslationCache {
  const entries = new Map<string, string>();
  return {
    async get(key) {
      return entries.get(key);
    },
    async set(key, value) {
      entries.set(key, value);
    },
  };
}

interface ChromeStorageArea {
  get(keys: string | string[] | null): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
}

const CHROME_STORAGE_PREFIX = "myz:translate:";

/**
 * `chrome.storage.local`-backed cache, for content scripts.
 *
 * A content script's IndexedDB is scoped to the host page's origin, so caching
 * there would expose translations to every site and duplicate them per origin.
 * `chrome.storage.local` belongs to the extension and is shared across sites.
 */
export function createChromeStorageTranslationCache(): TranslationCache {
  const api = (
    globalThis as {
      chrome?: { storage?: { local?: ChromeStorageArea } };
    }
  ).chrome?.storage?.local;
  if (!api) {
    return createMemoryTranslationCache();
  }
  return {
    async get(key) {
      try {
        const record = await api.get(CHROME_STORAGE_PREFIX + key);
        const value = record?.[CHROME_STORAGE_PREFIX + key];
        return typeof value === "string" ? value : undefined;
      } catch {
        return undefined;
      }
    },
    async set(key, value) {
      try {
        await api.set({ [CHROME_STORAGE_PREFIX + key]: value });
      } catch {
        // A cache write failure must never fail the translation.
      }
    },
  };
}
