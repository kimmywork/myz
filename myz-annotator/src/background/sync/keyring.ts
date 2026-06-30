import {
  deriveKeysetFromSecret as deriveSharedKeysetFromSecret,
  sealPublicKey as sealSharedPublicKey,
  type SyncKeyset,
  verifySealedPublicKey as verifySharedSealedPublicKey,
} from "@myz/sync-core/keyset";
import { utf8ToBytes } from "./crypto";
import {
  clearKeysetRecord,
  readDeviceKey,
  readKeysetRecord,
  writeDeviceKey,
  writeKeysetRecord,
} from "./storage";
import { base64ToBytes, bytesToBase64, toArrayBuffer } from "./utils";

const KEYSET_VERSION = "v1";

export type Keyset = SyncKeyset;

interface KeysetPayload {
  version: string;
  publicKey: string;
  privateKey: string;
  masterKey: string;
  createdAt: string;
  epoch: number;
}

export async function deriveKeysetFromSecret(
  secret: string,
  epoch: number,
): Promise<Keyset> {
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

export async function storeKeyset(keyset: Keyset): Promise<void> {
  const key = await ensureDeviceKey();
  const payload: KeysetPayload = {
    version: KEYSET_VERSION,
    publicKey: bytesToBase64(keyset.publicKey),
    privateKey: bytesToBase64(keyset.privateKey),
    masterKey: bytesToBase64(keyset.masterKey),
    createdAt: keyset.createdAt,
    epoch: keyset.epoch,
  };
  const encoded = utf8ToBytes(JSON.stringify(payload));
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: toArrayBuffer(nonce) },
      key,
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

export async function loadKeyset(): Promise<Keyset | null> {
  const record = await readKeysetRecord();
  if (!record) return null;
  const deviceKey = await ensureDeviceKey();
  const cipher = base64ToBytes(record.cipher);
  const nonce = base64ToBytes(record.nonce);
  const plain = new Uint8Array(
    await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: toArrayBuffer(nonce) },
      deviceKey,
      toArrayBuffer(cipher),
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

export async function sealPublicKey(
  masterKey: Uint8Array,
  publicKey: Uint8Array,
) {
  return sealSharedPublicKey(masterKey, publicKey);
}

export async function verifySealedPublicKey(
  masterKey: Uint8Array,
  publicKey: Uint8Array,
  sealed: Uint8Array,
): Promise<boolean> {
  return verifySharedSealedPublicKey(masterKey, publicKey, sealed);
}
