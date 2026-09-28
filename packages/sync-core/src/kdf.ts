import { pbkdf2Sha256, utf8ToBytes } from "./crypto"

/**
 * Minimum PBKDF2 iterations for the local unlock passphrase. The plan allows
 * Argon2id or PBKDF2 >= 600k; we use PBKDF2 to avoid a new dependency.
 */
export const LOCAL_KDF_ITERATIONS = 600_000

export async function deriveLocalUnlockKey(
  passphrase: string,
  salt: Uint8Array,
  iterations: number = LOCAL_KDF_ITERATIONS,
): Promise<Uint8Array> {
  if (!Number.isInteger(iterations) || iterations < LOCAL_KDF_ITERATIONS) {
    throw new Error(
      `Local KDF iterations must be an integer >= ${LOCAL_KDF_ITERATIONS}`,
    )
  }
  return pbkdf2Sha256(utf8ToBytes(passphrase), salt, iterations, 32)
}
