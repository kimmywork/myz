import type { SyncS3Settings } from "@myz/sync-core/settings";
import { utf8ToBytes } from "./crypto";
import { getDeviceKey } from "./deviceKey";
import { base64ToBytes, bytesToBase64, toArrayBuffer } from "./utils";

const CREDENTIAL_PREFIX = "enc:v1:";

export function isSealedCredential(value: unknown): value is string {
  return typeof value === "string" && value.startsWith(CREDENTIAL_PREFIX);
}

export function credentialAad(field: string): Uint8Array {
  return utf8ToBytes(`myz:s3-credential:v1:${field}`);
}

/** Encrypt a single credential string with the device key (AES-GCM + AAD). */
export async function sealCredential(
  value: string,
  key: CryptoKey,
  aad: Uint8Array,
): Promise<string> {
  if (!value) return "";
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt(
      {
        name: "AES-GCM",
        iv: toArrayBuffer(nonce),
        additionalData: toArrayBuffer(aad),
      },
      key,
      toArrayBuffer(utf8ToBytes(value)),
    ),
  );
  return `${CREDENTIAL_PREFIX}${bytesToBase64(nonce)}:${bytesToBase64(ciphertext)}`;
}

/** Decrypt a sealed credential; returns "" when the value cannot be opened. */
export async function openCredential(
  value: string,
  key: CryptoKey,
  aad: Uint8Array,
): Promise<string> {
  if (!isSealedCredential(value)) return value;
  const parts = value.slice(CREDENTIAL_PREFIX.length).split(":");
  if (parts.length !== 2) return "";
  try {
    const nonce = base64ToBytes(parts[0]);
    const ciphertext = base64ToBytes(parts[1]);
    const plain = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: toArrayBuffer(nonce),
        additionalData: toArrayBuffer(aad),
      },
      key,
      toArrayBuffer(ciphertext),
    );
    return new TextDecoder().decode(plain);
  } catch {
    return "";
  }
}

export async function sealS3Credentials(
  s3: SyncS3Settings,
): Promise<SyncS3Settings> {
  const hasSecret = Boolean(s3.secretAccessKey || s3.sessionToken);
  if (!hasSecret) return { ...s3 };
  const key = await getDeviceKey();
  return {
    ...s3,
    secretAccessKey: await sealCredential(
      s3.secretAccessKey,
      key,
      credentialAad("secretAccessKey"),
    ),
    sessionToken: await sealCredential(
      s3.sessionToken || "",
      key,
      credentialAad("sessionToken"),
    ),
  };
}

export async function openS3Credentials(
  s3: SyncS3Settings,
): Promise<SyncS3Settings> {
  if (
    !isSealedCredential(s3.secretAccessKey) &&
    !isSealedCredential(s3.sessionToken)
  ) {
    return { ...s3 };
  }
  const key = await getDeviceKey();
  return {
    ...s3,
    secretAccessKey: await openCredential(
      s3.secretAccessKey,
      key,
      credentialAad("secretAccessKey"),
    ),
    sessionToken: await openCredential(
      s3.sessionToken || "",
      key,
      credentialAad("sessionToken"),
    ),
  };
}
