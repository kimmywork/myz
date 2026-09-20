/**
 * Translation cache contract and key format.
 *
 * Keys are `source:target:textHash` so different language pairs never collide
 * and identical text reuses a stored translation. The interface is small
 * enough that tests can supply an in-memory implementation and the browser
 * uses a dedicated IndexedDB database (`myz_translate_db`).
 */

import { hashText } from "./hash.js";

export interface TranslationCache {
  get(key: string): Promise<string | undefined>;
  set(key: string, value: string): Promise<void>;
}

export type TextHasher = (text: string) => Promise<string>;

export async function buildCacheKey(
  sourceLanguage: string,
  targetLanguage: string,
  text: string,
  hasher: TextHasher = hashText,
): Promise<string> {
  const hash = await hasher(text);
  return `${sourceLanguage.toLowerCase()}:${targetLanguage.toLowerCase()}:${hash}`;
}
