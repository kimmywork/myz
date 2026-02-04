import {
  aesGcmDecrypt,
  aesGcmEncrypt,
  hkdfSha256,
  packNoncePayload,
  splitNoncePayload,
  utf8ToBytes,
} from "./crypto";
import { decodeBinaryPayload, encodeBinaryPayload } from "./utils";

export interface RotationNotice {
  newKeyId: string;
  rotatedAt: string;
}

export async function buildRotationNotice(
  masterKey: Uint8Array,
  newKeyId: string,
): Promise<Uint8Array> {
  const payload = {
    newKeyId,
    rotatedAt: new Date().toISOString(),
  };
  const plain = encodeBinaryPayload(payload);
  const key = await hkdfSha256(masterKey, utf8ToBytes("rotation"), 32);
  const { nonce, ciphertext } = await aesGcmEncrypt(key, plain);
  return packNoncePayload(nonce, ciphertext);
}

export async function parseRotationNotice(
  masterKey: Uint8Array,
  payload: Uint8Array,
): Promise<RotationNotice | null> {
  try {
    const { nonce, ciphertext } = splitNoncePayload(payload, 12);
    const key = await hkdfSha256(masterKey, utf8ToBytes("rotation"), 32);
    const plain = await aesGcmDecrypt(key, nonce, ciphertext);
    const decoded = decodeBinaryPayload(plain) as RotationNotice;
    if (!decoded || typeof decoded.newKeyId !== "string") {
      return null;
    }
    return decoded;
  } catch {
    return null;
  }
}
