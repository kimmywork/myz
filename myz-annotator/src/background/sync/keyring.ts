import { ed25519 } from "@noble/curves/ed25519";
import { argon2id } from "hash-wasm";
import {
  aesGcmDecrypt,
  aesGcmEncrypt,
  hkdfSha256,
  sha256,
  utf8ToBytes,
} from "./crypto";
import {
  clearKeysetRecord,
  readDeviceKey,
  readKeysetRecord,
  writeDeviceKey,
  writeKeysetRecord,
} from "./storage";
import {
  base32Encode,
  base64ToBytes,
  bytesToBase64,
  bytesToHex,
  concatBytes,
  toArrayBuffer,
} from "./utils";

const ARGON2_SALT = utf8ToBytes("myz:e2ee:argon2id:v1");
const KEYSET_VERSION = "v1";

export interface Keyset {
  keyId: string;
  publicKey: Uint8Array;
  privateKey: Uint8Array;
  masterKey: Uint8Array;
  createdAt: string;
  epoch: number;
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
  const seed = await argon2id({
    password: secret,
    salt: ARGON2_SALT,
    iterations: 3,
    memorySize: 65536,
    parallelism: 1,
    hashLength: 32,
    outputType: "binary",
  });
  const privateKey = new Uint8Array(seed);
  const publicKey = ed25519.getPublicKey(privateKey);
  const masterKey = await hkdfSha256(
    privateKey,
    utf8ToBytes("myz:e2ee:master"),
    32,
  );
  const keyId = base32Encode(await sha256(publicKey));
  const createdAt = new Date().toISOString();
  seed.fill(0);
  return { keyId, publicKey, privateKey, masterKey, createdAt, epoch };
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
  const key = await hkdfSha256(masterKey, utf8ToBytes("myz:seal"), 32);
  const fingerprint = await sha256(publicKey);
  const { nonce, ciphertext } = await aesGcmEncrypt(key, fingerprint);
  return concatBytes(nonce, ciphertext);
}

export async function verifySealedPublicKey(
  masterKey: Uint8Array,
  publicKey: Uint8Array,
  sealed: Uint8Array,
): Promise<boolean> {
  try {
    const key = await hkdfSha256(masterKey, utf8ToBytes("myz:seal"), 32);
    const nonce = sealed.slice(0, 12);
    const ciphertext = sealed.slice(12);
    const decrypted = await aesGcmDecrypt(key, nonce, ciphertext);
    const fingerprint = await sha256(publicKey);
    return bytesToHex(decrypted) === bytesToHex(fingerprint);
  } catch {
    return false;
  }
}
