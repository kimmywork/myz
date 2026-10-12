// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const holder = vi.hoisted(() => ({ key: null as CryptoKey | null }));

vi.mock("@/background/sync/keyring", () => ({
  getDeviceKey: async () => holder.key,
}));

import { SETTINGS_KEY } from "@/background/constants";
import { readSettings, writeSettings } from "@/background/storage";

const store = new Map<string, unknown>();

interface StoredBundle {
  data: { sync: { s3: { secretAccessKey: string; sessionToken: string } } };
}

describe("settings credential encryption (QW3 integration)", () => {
  beforeEach(async () => {
    store.clear();
    holder.key = await crypto.subtle.generateKey(
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"],
    );
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

  it("stores sealed credentials and returns plaintext on read", async () => {
    const updated = await writeSettings({
      sync: {
        enabled: true,
        s3: {
          endpoint: "https://s3.example.com",
          region: "us-east-1",
          bucket: "myz",
          accessKeyId: "AKIAEXAMPLE",
          secretAccessKey: "SK-secret",
          sessionToken: "ST-token",
          prefix: "",
        },
      },
    });
    expect(updated.sync.s3.secretAccessKey).toBe("SK-secret");

    const bundle = store.get(SETTINGS_KEY) as StoredBundle;
    const stored = bundle.data.sync.s3;
    expect(stored.secretAccessKey.startsWith("enc:v1:")).toBe(true);
    expect(stored.secretAccessKey).not.toContain("SK-secret");
    expect(stored.sessionToken.startsWith("enc:v1:")).toBe(true);

    const read = await readSettings();
    expect(read.sync.s3.secretAccessKey).toBe("SK-secret");
    expect(read.sync.s3.sessionToken).toBe("ST-token");
  });

  it("reads legacy plaintext credentials and upgrades them on the next write", async () => {
    store.set(SETTINGS_KEY, {
      schemaVersion: "1.0.0",
      data: {
        sync: {
          enabled: true,
          s3: {
            endpoint: "https://s3.example.com",
            region: "us-east-1",
            bucket: "myz",
            accessKeyId: "AKIAEXAMPLE",
            secretAccessKey: "legacy-secret",
            sessionToken: "",
            prefix: "",
          },
        },
      },
    });

    const read = await readSettings();
    expect(read.sync.s3.secretAccessKey).toBe("legacy-secret");

    await writeSettings({ colorScheme: read.colorScheme });
    const bundle = store.get(SETTINGS_KEY) as StoredBundle;
    expect(bundle.data.sync.s3.secretAccessKey.startsWith("enc:v1:")).toBe(
      true,
    );
  });
});
