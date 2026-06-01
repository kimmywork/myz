import { ed25519 } from "@noble/curves/ed25519"
import { argon2id } from "hash-wasm"
import { aesGcmDecrypt, aesGcmEncrypt, hkdfSha256, sha256, utf8ToBytes } from "./crypto"
import { base32Encode, bytesToHex, concatBytes } from "./utils"

const ARGON2_SALT = utf8ToBytes("myz:e2ee:argon2id:v1")

export interface SyncKeyset {
  keyId: string
  publicKey: Uint8Array
  privateKey: Uint8Array
  masterKey: Uint8Array
  createdAt: string
  epoch: number
}

export async function deriveKeysetFromSecret(
  secret: string,
  epoch: number,
): Promise<SyncKeyset> {
  const seed = await argon2id({
    password: secret,
    salt: ARGON2_SALT,
    iterations: 3,
    memorySize: 65536,
    parallelism: 1,
    hashLength: 32,
    outputType: "binary",
  })
  const privateKey = new Uint8Array(seed)
  const publicKey = ed25519.getPublicKey(privateKey)
  const masterKey = await hkdfSha256(privateKey, utf8ToBytes("myz:e2ee:master"), 32)
  const keyId = base32Encode(await sha256(publicKey))
  const createdAt = new Date().toISOString()
  seed.fill(0)
  return { keyId, publicKey, privateKey, masterKey, createdAt, epoch }
}

export async function sealPublicKey(
  masterKey: Uint8Array,
  publicKey: Uint8Array,
) {
  const key = await hkdfSha256(masterKey, utf8ToBytes("myz:seal"), 32)
  const fingerprint = await sha256(publicKey)
  const { nonce, ciphertext } = await aesGcmEncrypt(key, fingerprint)
  return concatBytes(nonce, ciphertext)
}

export async function verifySealedPublicKey(
  masterKey: Uint8Array,
  publicKey: Uint8Array,
  sealed: Uint8Array,
): Promise<boolean> {
  try {
    const key = await hkdfSha256(masterKey, utf8ToBytes("myz:seal"), 32)
    const nonce = sealed.slice(0, 12)
    const ciphertext = sealed.slice(12)
    const decrypted = await aesGcmDecrypt(key, nonce, ciphertext)
    const fingerprint = await sha256(publicKey)
    return bytesToHex(decrypted) === bytesToHex(fingerprint)
  } catch {
    return false
  }
}
