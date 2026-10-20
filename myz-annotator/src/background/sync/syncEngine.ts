import { readSettings } from "../storage";
import { loadLocalAccount } from "./accountKeyring";
import { syncAccountNow } from "./v2/engine";

export type SyncResult = {
  ok: boolean;
  status: "disabled" | "missing_account" | "locked" | "synced" | "error";
  message?: string;
  /** True when some streams synced and others failed (partial success). */
  partial?: boolean;
};

/**
 * Sync once. v1 (keyset) sync has been removed; only the v2 device-bound
 * account path remains.
 */
export async function syncNow(): Promise<SyncResult> {
  const settings = await readSettings();
  if (!settings.sync?.enabled) {
    return { ok: true, status: "disabled" };
  }
  const account = await loadLocalAccount();
  if (!account) {
    return { ok: false, status: "missing_account", message: "No sync account" };
  }
  return syncAccountNow();
}
