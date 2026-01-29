import { ed25519 } from "@noble/curves/ed25519";
import {
  aesGcmDecrypt,
  aesGcmEncrypt,
  hkdfSha256,
  packNoncePayload,
  sha256,
  splitNoncePayload,
  utf8ToBytes,
} from "./crypto";
import { decodeBinaryPayload, encodeBinaryPayload } from "./utils";
import type { ManifestData } from "./types";

export interface EncryptedManifest {
  payload: Uint8Array;
  plainBytes: Uint8Array;
}

export async function encryptManifest(
  manifest: ManifestData,
  masterKey: Uint8Array,
): Promise<EncryptedManifest> {
  const plainBytes = encodeBinaryPayload(manifest);
  const versionKey = await hkdfSha256(
    masterKey,
    utf8ToBytes(`manifest:${manifest.version}`),
    32,
  );
  const { nonce, ciphertext } = await aesGcmEncrypt(versionKey, plainBytes);
  return { payload: packNoncePayload(nonce, ciphertext), plainBytes };
}

export async function decryptManifest(
  payload: Uint8Array,
  version: number,
  masterKey: Uint8Array,
): Promise<{ manifest: ManifestData; plainBytes: Uint8Array }> {
  const { nonce, ciphertext } = splitNoncePayload(payload, 12);
  const versionKey = await hkdfSha256(
    masterKey,
    utf8ToBytes(`manifest:${version}`),
    32,
  );
  const plainBytes = await aesGcmDecrypt(versionKey, nonce, ciphertext);
  const manifest = decodeBinaryPayload(plainBytes) as ManifestData;
  return { manifest, plainBytes };
}

export async function signManifest(
  plainBytes: Uint8Array,
  privateKey: Uint8Array,
): Promise<Uint8Array> {
  const digest = await sha256(plainBytes);
  return ed25519.sign(digest, privateKey);
}

export async function verifyManifest(
  plainBytes: Uint8Array,
  signature: Uint8Array,
  publicKey: Uint8Array,
): Promise<boolean> {
  const digest = await sha256(plainBytes);
  return ed25519.verify(signature, digest, publicKey);
}
