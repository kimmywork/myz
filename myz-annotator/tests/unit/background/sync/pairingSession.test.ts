// @vitest-environment node
import { createSyncAccount, openSyncAccount } from "@myz/sync-core/account";
import {
  deviceIdFromSignPublicKey,
  generateDeviceKeyPair,
} from "@myz/sync-core/deviceKeys";
import type { Roster } from "@myz/sync-core/roster";
import { bytesToBase64, encodeBinaryPayload } from "@myz/sync-core/utils";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  pair: null as ReturnType<typeof generateDeviceKeyPair> | null,
  account: null as Awaited<ReturnType<typeof createSyncAccount>> | null,
  s3: {
    endpoint: "https://s3.example.com",
    region: "us-east-1",
    bucket: "myz-sync",
    accessKeyId: "AKIASECRET",
    secretAccessKey: "super-secret-key",
    sessionToken: "session-token",
    prefix: "team-a",
  },
}));

vi.mock("@/background/sync/deviceKeyring", () => ({
  loadOrCreateDeviceKeys: async () => ({
    deviceId: state.account?.deviceId,
    pair: state.pair,
  }),
}));

vi.mock("@/background/sync/accountKeyring", () => ({
  loadLocalAccount: async () => state.account,
}));

vi.mock("@/background/sync/storage", () => ({
  writeAccountRecord: vi.fn(async () => {}),
}));

vi.mock("@/background/storage", () => ({
  readSettings: async () => ({ sync: { enabled: true, s3: state.s3 } }),
}));

import {
  acceptPairingInvite,
  approvePairing,
  createPairingInvite,
  decodePairing,
  encodePairing,
  type PairingInvite,
} from "@/background/sync/v2/pairingSession";

const store = new Map<string, unknown>();

describe("device pairing session", () => {
  beforeEach(() => {
    store.clear();
    vi.stubGlobal("chrome", {
      storage: {
        local: {
          get: async (key: string) => ({ [key]: store.get(key) }),
          set: async (value: Record<string, unknown>) => {
            for (const [key, entry] of Object.entries(value)) {
              store.set(key, entry);
            }
          },
          remove: async (key: string) => {
            store.delete(key);
          },
        },
      },
    });
  });

  it("adds a new device that can then unwrap D", async () => {
    const hostPair = generateDeviceKeyPair();
    const guestPair = generateDeviceKeyPair();
    const hostAccount = await createSyncAccount({
      device: hostPair,
      accountId: "acct_pair",
    });
    state.account = hostAccount;
    state.pair = hostPair;

    const { offer } = await createPairingInvite();

    state.pair = guestPair;
    const guest = await acceptPairingInvite(offer);

    state.pair = hostPair;
    const approved = await approvePairing(guest.response);
    expect(approved.sas).toBe(guest.sas);

    const roster = decodePairing<Roster>(approved.roster);
    const guestId = await deviceIdFromSignPublicKey(guestPair.signPublicKey);
    expect(roster.devices.map((device) => device.deviceId)).toContain(guestId);

    const guestAccount = await openSyncAccount({
      device: guestPair,
      roster,
    });
    expect(Array.from(guestAccount.dataKey)).toEqual(
      Array.from(hostAccount.dataKey),
    );
  });

  it("carries non-sensitive S3 prefill but never credentials", async () => {
    const hostPair = generateDeviceKeyPair();
    const hostAccount = await createSyncAccount({
      device: hostPair,
      accountId: "acct_pair_s3",
    });
    state.account = hostAccount;
    state.pair = hostPair;

    const { offer } = await createPairingInvite();
    const envelope = decodePairing<PairingInvite>(offer);
    expect(envelope.s3).toEqual({
      endpoint: "https://s3.example.com",
      region: "us-east-1",
      bucket: "myz-sync",
      prefix: "team-a",
    });

    state.pair = generateDeviceKeyPair();
    const guest = await acceptPairingInvite(offer);
    expect(guest.s3?.bucket).toBe("myz-sync");

    const serialized = JSON.stringify(envelope);
    expect(serialized).not.toContain("super-secret-key");
    expect(serialized).not.toContain("AKIASECRET");
    expect(serialized).not.toContain("session-token");
  });

  it("rejects an unknown/expired invite response", async () => {
    const hostPair = generateDeviceKeyPair();
    const hostAccount = await createSyncAccount({
      device: hostPair,
      accountId: "acct_pair2",
    });
    state.account = hostAccount;
    state.pair = hostPair;
    await expect(approvePairing("not-a-real-response")).rejects.toThrow();
  });

  it("encodes transferable strings as URL-safe, decodable base64", () => {
    const payload = {
      offer: { accountId: "a" },
      s3: { endpoint: "https://x", region: "", bucket: "b" },
    };
    const encoded = encodePairing(payload);
    expect(encoded).not.toMatch(/[+/=]/);
    expect(decodePairing(encoded)).toEqual(payload);
    // Legacy standard-alphabet (padded, `+`/`/`) strings still decode.
    const legacy = bytesToBase64(encodeBinaryPayload(payload));
    expect(legacy).toMatch(/[+/=]/);
    expect(decodePairing(legacy)).toEqual(payload);
  });

  it("reports a friendly error for a truncated invite", async () => {
    await expect(acceptPairingInvite("HY/LbsIwE")).rejects.toThrow(
      /长度不完整/,
    );
  });
});
