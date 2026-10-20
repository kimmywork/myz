import { readDeviceKey, writeDeviceKey } from "./storage";

/**
 * The local, non-extractable AES key used to wrap the device key pair, the
 * account roster and S3 credentials at rest. It lives in `myz_sync_db` and is
 * never exported.
 */
async function ensureDeviceKey(): Promise<CryptoKey> {
  const existing = await readDeviceKey();
  if (existing?.key) {
    return existing.key;
  }
  const key = await crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
  await writeDeviceKey({ id: "deviceKey", key });
  return key;
}

export async function getDeviceKey(): Promise<CryptoKey> {
  return ensureDeviceKey();
}
