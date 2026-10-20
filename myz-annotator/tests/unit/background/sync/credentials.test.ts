// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  credentialAad,
  isSealedCredential,
  openCredential,
  openS3Credentials,
  sealCredential,
  sealS3Credentials,
} from "@/background/sync/credentials";

const holder = vi.hoisted(() => ({ key: null as CryptoKey | null }));

vi.mock("@/background/sync/deviceKey", () => ({
  getDeviceKey: async () => holder.key,
}));

const baseS3 = {
  endpoint: "https://s3.example.com",
  region: "us-east-1",
  bucket: "myz",
  accessKeyId: "AKIAEXAMPLE",
  secretAccessKey: "super-secret",
  sessionToken: "session-token",
  prefix: "",
};

describe("s3 credential sealing", () => {
  beforeEach(async () => {
    holder.key = await crypto.subtle.generateKey(
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"],
    );
  });

  it("round-trips a sealed credential without leaving plaintext", async () => {
    const sealed = await sealCredential(
      "super-secret",
      holder.key!,
      credentialAad("secretAccessKey"),
    );
    expect(isSealedCredential(sealed)).toBe(true);
    expect(sealed).not.toContain("super-secret");
    expect(
      await openCredential(
        sealed,
        holder.key!,
        credentialAad("secretAccessKey"),
      ),
    ).toBe("super-secret");
  });

  it("binds the AAD so a credential cannot open under another field", async () => {
    const sealed = await sealCredential(
      "token",
      holder.key!,
      credentialAad("sessionToken"),
    );
    expect(
      await openCredential(
        sealed,
        holder.key!,
        credentialAad("secretAccessKey"),
      ),
    ).toBe("");
  });

  it("seals and opens the full s3 settings", async () => {
    const sealed = await sealS3Credentials(baseS3);
    expect(isSealedCredential(sealed.secretAccessKey)).toBe(true);
    expect(isSealedCredential(sealed.sessionToken)).toBe(true);
    expect(sealed.secretAccessKey).not.toContain("super-secret");

    const opened = await openS3Credentials(sealed);
    expect(opened.secretAccessKey).toBe("super-secret");
    expect(opened.sessionToken).toBe("session-token");
    expect(opened.accessKeyId).toBe("AKIAEXAMPLE");
  });

  it("reads legacy plaintext credentials unchanged", async () => {
    const opened = await openS3Credentials({ ...baseS3 });
    expect(opened.secretAccessKey).toBe("super-secret");
    expect(opened.sessionToken).toBe("session-token");
  });

  it("keeps empty credentials empty", async () => {
    const sealed = await sealS3Credentials({
      ...baseS3,
      secretAccessKey: "",
      sessionToken: "",
    });
    expect(sealed.secretAccessKey).toBe("");
    expect(sealed.sessionToken).toBe("");
  });
});
