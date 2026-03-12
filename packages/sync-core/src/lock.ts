import { ed25519 } from "@noble/curves/ed25519"
import {
  aesGcmDecrypt,
  aesGcmEncrypt,
  hkdfSha256,
  packNoncePayload,
  sha256,
  splitNoncePayload,
  utf8ToBytes,
} from "./crypto"
import type { S3Client } from "./s3Client"
import type { LockPayload } from "./types"
import { decodeBinaryPayload, encodeBinaryPayload } from "./utils"

const DEFAULT_LEASE_MS = 30_000

export interface LockResult {
  acquired: boolean
  leaseExpiresAt?: string
}

export async function acquireLock(options: {
  client: S3Client
  lockPath: string
  masterKey: Uint8Array
  privateKey: Uint8Array
  publicKey: Uint8Array
  clientId: string
  leaseMs?: number
}): Promise<LockResult> {
  const leaseMs = options.leaseMs || DEFAULT_LEASE_MS
  const existing = await options.client.getObject(options.lockPath)
  let etag: string | undefined
  if (existing) {
    etag = existing.etag
    const isValid = await isLockValid(
      existing.body,
      options.masterKey,
      options.publicKey,
    )
    if (isValid) {
      return { acquired: false }
    }
  }
  const payload = await buildLockPayload(
    options.clientId,
    options.privateKey,
    leaseMs,
  )
  const encrypted = await encryptLockPayload(payload, options.masterKey)
  await options.client.putObject(options.lockPath, encrypted, {
    ifMatch: etag,
    ifNoneMatch: etag ? undefined : "*",
  })
  return { acquired: true, leaseExpiresAt: payload.leaseExpiresAt }
}

export async function releaseLock(options: {
  client: S3Client
  lockPath: string
}): Promise<void> {
  await options.client.deleteObject(options.lockPath)
}

async function buildLockPayload(
  clientId: string,
  privateKey: Uint8Array,
  leaseMs: number,
): Promise<LockPayload> {
  const issuedAt = new Date().toISOString()
  const leaseExpiresAt = new Date(Date.now() + leaseMs).toISOString()
  const payload: Omit<LockPayload, "signature"> = {
    clientId,
    leaseExpiresAt,
    issuedAt,
  }
  const encoded = encodeBinaryPayload(payload)
  const digest = await sha256(encoded)
  const signature = ed25519.sign(digest, privateKey)
  return {
    ...payload,
    signature: btoa(String.fromCharCode(...signature)),
  }
}

async function encryptLockPayload(
  payload: LockPayload,
  masterKey: Uint8Array,
): Promise<Uint8Array> {
  const plain = encodeBinaryPayload(payload)
  const key = await hkdfSha256(masterKey, utf8ToBytes("lock"), 32)
  const { nonce, ciphertext } = await aesGcmEncrypt(key, plain)
  return packNoncePayload(nonce, ciphertext)
}

async function isLockValid(
  payload: Uint8Array,
  masterKey: Uint8Array,
  publicKey: Uint8Array,
): Promise<boolean> {
  try {
    const { nonce, ciphertext } = splitNoncePayload(payload, 12)
    const key = await hkdfSha256(masterKey, utf8ToBytes("lock"), 32)
    const plain = await aesGcmDecrypt(key, nonce, ciphertext)
    const decoded = decodeBinaryPayload(plain) as LockPayload
    const signature = Uint8Array.from(atob(decoded.signature), (c) =>
      c.charCodeAt(0),
    )
    const payloadToVerify: Omit<LockPayload, "signature"> = {
      clientId: decoded.clientId,
      leaseExpiresAt: decoded.leaseExpiresAt,
      issuedAt: decoded.issuedAt,
    }
    const verifyBytes = encodeBinaryPayload(payloadToVerify)
    const digest = await sha256(verifyBytes)
    const validSig = ed25519.verify(signature, digest, publicKey)
    const notExpired = Date.parse(decoded.leaseExpiresAt) > Date.now()
    return validSig && notExpired
  } catch {
    return false
  }
}
