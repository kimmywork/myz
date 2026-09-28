// @vitest-environment node
import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const holder = vi.hoisted(() => ({ key: null as CryptoKey | null }));

vi.mock("@/background/sync/keyring", () => ({
  getDeviceKey: async () => holder.key,
}));

import {
  clearDeviceKeys,
  loadOrCreateDeviceKeys,
} from "@/background/sync/deviceKeyring";

describe("device keyring", () => {
  beforeEach(async () => {
    holder.key = await crypto.subtle.generateKey(
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"],
    );
    await clearDeviceKeys();
  });

  it("persists a stable device identity across loads", async () => {
    const first = await loadOrCreateDeviceKeys();
    const second = await loadOrCreateDeviceKeys();
    expect(second.deviceId).toBe(first.deviceId);
    expect(Array.from(second.pair.signPublicKey)).toEqual(
      Array.from(first.pair.signPublicKey),
    );
    expect(Array.from(second.pair.agreePublicKey)).toEqual(
      Array.from(first.pair.agreePublicKey),
    );
  });

  it("generates a fresh identity after clearing", async () => {
    const first = await loadOrCreateDeviceKeys();
    await clearDeviceKeys();
    const second = await loadOrCreateDeviceKeys();
    expect(second.deviceId).not.toBe(first.deviceId);
  });
});
