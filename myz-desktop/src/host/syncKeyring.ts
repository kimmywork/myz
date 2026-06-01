import {
  type SyncKeyset,
  deriveKeysetFromSecret as deriveSharedKeysetFromSecret,
} from "@myz/sync-core";
import { base64ToBytes, bytesToBase64, toArrayBuffer } from "@myz/sync-core/utils";
import {
  clearKeysetRecord,
  readDeviceKey,
  readKeysetRecord,
  writeDeviceKey,
  writeKeysetRecord,
} from "./syncStorage";

const KEYSET_VERSION = "v1";

interface KeysetPayload {
  version: string;
  publicKey: string;
  privateKey: string;
  masterKey: string;
  createdAt: string;
  epoch: number;
}

export type DesktopSyncKeyset = SyncKeyset;

export async function deriveKeysetFromSecret(
  secret: string,
  epoch: number,
): Promise<DesktopSyncKeyset> {
  return deriveSharedKeysetFromSecret(secret, epoch);
}

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

export async function storeKeyset(keyset: DesktopSyncKeyset): Promise<void> {
  const deviceKey = await ensureDeviceKey();
  const payload: KeysetPayload = {
    version: KEYSET_VERSION,
    publicKey: bytesToBase64(keyset.publicKey),
    privateKey: bytesToBase64(keyset.privateKey),
    masterKey: bytesToBase64(keyset.masterKey),
    createdAt: keyset.createdAt,
    epoch: keyset.epoch,
  };
  const encoded = new TextEncoder().encode(JSON.stringify(payload));
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: toArrayBuffer(nonce) },
      deviceKey,
      toArrayBuffer(encoded),
    ),
  );
  await writeKeysetRecord({
    id: "active",
    keyId: keyset.keyId,
    createdAt: keyset.createdAt,
    epoch: keyset.epoch,
    cipher: bytesToBase64(ciphertext),
    nonce: bytesToBase64(nonce),
  });
}

export async function loadKeyset(): Promise<DesktopSyncKeyset | null> {
  const record = await readKeysetRecord();
  if (!record) return null;
  const deviceKey = await ensureDeviceKey();
  const plain = new Uint8Array(
    await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: toArrayBuffer(base64ToBytes(record.nonce)) },
      deviceKey,
      toArrayBuffer(base64ToBytes(record.cipher)),
    ),
  );
  const payload = JSON.parse(new TextDecoder().decode(plain)) as KeysetPayload;
  if (!payload || payload.version !== KEYSET_VERSION) {
    return null;
  }
  return {
    keyId: record.keyId,
    publicKey: base64ToBytes(payload.publicKey),
    privateKey: base64ToBytes(payload.privateKey),
    masterKey: base64ToBytes(payload.masterKey),
    createdAt: payload.createdAt,
    epoch: payload.epoch,
  };
}

export async function clearKeyset(): Promise<void> {
  await clearKeysetRecord();
}
