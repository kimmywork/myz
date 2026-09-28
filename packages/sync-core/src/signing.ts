import { ed25519 } from "@noble/curves/ed25519"
import { sha256, utf8ToBytes } from "./crypto"
import { base64ToBytes, bytesToBase64, stableStringify } from "./utils"

/**
 * Sign any JSON-compatible object over its stable stringification. The
 * signature is stored base64 outside the signed object.
 */
export async function signStable(
  unsigned: unknown,
  signPrivateKey: Uint8Array,
): Promise<string> {
  const digest = await sha256(utf8ToBytes(stableStringify(unsigned)))
  return bytesToBase64(ed25519.sign(digest, signPrivateKey))
}

export async function verifyStable(
  unsigned: unknown,
  signature: string,
  signPublicKey: Uint8Array,
): Promise<boolean> {
  try {
    const digest = await sha256(utf8ToBytes(stableStringify(unsigned)))
    return ed25519.verify(
      base64ToBytes(signature),
      digest,
      signPublicKey,
    )
  } catch {
    return false
  }
}
