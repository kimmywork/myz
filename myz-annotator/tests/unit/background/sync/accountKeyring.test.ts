// @vitest-environment node
import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const holder = vi.hoisted(() => ({ key: null as CryptoKey | null }));

vi.mock("@/background/sync/deviceKey", () => ({
  getDeviceKey: async () => holder.key,
}));

import {
  clearLocalAccount,
  createLocalAccount,
  loadLocalAccount,
} from "@/background/sync/accountKeyring";
import { clearDeviceKeys } from "@/background/sync/deviceKeyring";

describe("account keyring", () => {
  beforeEach(async () => {
    holder.key = await crypto.subtle.generateKey(
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"],
    );
    await clearLocalAccount();
    await clearDeviceKeys();
  });

  it("creates then reloads the same account", async () => {
    const created = await createLocalAccount();
    const loaded = await loadLocalAccount();
    expect(loaded?.accountId).toBe(created.accountId);
    expect(Array.from(loaded!.masterKey)).toEqual(
      Array.from(created.masterKey),
    );
  });

  it("returns null when no account is stored", async () => {
    expect(await loadLocalAccount()).toBeNull();
  });
});
