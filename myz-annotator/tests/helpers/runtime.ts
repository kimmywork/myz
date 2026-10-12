import type { Page } from "@playwright/test";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Directory of the calling module. Replaces the repeated
 * `path.dirname(fileURLToPath(import.meta.url))` boilerplate in specs.
 */
export function dirnameFromImportMeta(metaUrl: string): string {
  return path.dirname(fileURLToPath(metaUrl));
}

/**
 * Send a background message from an extension page and unwrap the `data` field
 * of the `{ ok, data }` envelope the handlers return. Shared by the extension
 * and PDF/EPUB specs.
 */
export async function send<T>(
  page: Page,
  type: string,
  payload?: unknown,
): Promise<T> {
  const response = await page.evaluate(
    async (message: { type: string; payload: unknown }) =>
      new Promise((resolve) => {
        chrome.runtime.sendMessage(message, (result) => {
          if (chrome.runtime.lastError) {
            resolve({ ok: false, error: chrome.runtime.lastError.message });
            return;
          }
          resolve(result);
        });
      }),
    { type, payload },
  );
  const typed = response as { ok?: boolean; error?: string; data?: T };
  if (!typed?.ok) {
    throw new Error(`${type} failed: ${typed?.error ?? "no response"}`);
  }
  return typed.data as T;
}
