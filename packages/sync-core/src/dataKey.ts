import { hkdfSha256, randomBytes, utf8ToBytes } from "./crypto"
import { base32Encode } from "./utils"

/** A random, non-derivable account address (never derived from A). */
export function generateAccountId(): string {
  return `acct_${base32Encode(randomBytes(20))}`
}

/** Fresh 32-byte data key D, one per epoch. */
export function generateDataKey(): Uint8Array {
  return randomBytes(32)
}

/**
 * Content/manifest/chunk keys are derived from D. Exposing `masterKey` keeps
 * the existing record/chunk/manifest helpers usable unchanged once their key
 * source is switched from the local password-derived key to D.
 */
export async function deriveMasterKeyFromDataKey(
  dataKey: Uint8Array,
): Promise<Uint8Array> {
  return hkdfSha256(dataKey, utf8ToBytes("myz:e2ee:v2:master"), 32)
}

export async function deriveStreamMasterKey(
  masterKey: Uint8Array,
  streamId: string,
): Promise<Uint8Array> {
  return hkdfSha256(
    masterKey,
    utf8ToBytes(`stream:${streamId}:master`),
    32,
  )
}
