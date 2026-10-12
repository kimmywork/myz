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

function keysetAad(keyId: string, epoch: number): Uint8Array {
  return utf8ToBytes(`myz:keyset:v1:${keyId}:${epoch}`);
}

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

/** The local, non-extractable device key used to wrap keysets and credentials. */
export async function getDeviceKey(): Promise<CryptoKey> {
  return ensureDeviceKey();
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
      {
        name: "AES-GCM",
        iv: toArrayBuffer(nonce),
        additionalData: toArrayBuffer(keysetAad(keyset.keyId, keyset.epoch)),
      },
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
  let plain: Uint8Array;
  let migratedFromLegacy = false;
  try {
    plain = new Uint8Array(
      await crypto.subtle.decrypt(
        {
          name: "AES-GCM",
          iv: toArrayBuffer(nonce),
          additionalData: toArrayBuffer(keysetAad(record.keyId, record.epoch)),
        },
        deviceKey,
        toArrayBuffer(cipher),
      ),
    );
  } catch {
    // Legacy keysets were sealed without AAD; open them and re-seal below.
    plain = new Uint8Array(
      await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: toArrayBuffer(nonce) },
        deviceKey,
        toArrayBuffer(cipher),
      ),
    );
    migratedFromLegacy = true;
  }
  const decoded = new TextDecoder().decode(plain);
  let payload: KeysetPayload;
  try {
    payload = JSON.parse(decoded) as KeysetPayload;
  } catch (error) {
    console.warn("Failed to parse stored keyset payload", error);
    return null;
  }
  if (!payload || payload.version !== KEYSET_VERSION) {
    return null;
  }
  const keyset: Keyset = {
    keyId: record.keyId,
    publicKey: base64ToBytes(payload.publicKey),
    privateKey: base64ToBytes(payload.privateKey),
    masterKey: base64ToBytes(payload.masterKey),
    createdAt: payload.createdAt,
    epoch: payload.epoch,
  };
  if (migratedFromLegacy) {
    try {
      await storeKeyset(keyset);
    } catch (error) {
      console.warn("Failed to migrate keyset to AAD-bound format", error);
    }
  }
  return keyset;
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
