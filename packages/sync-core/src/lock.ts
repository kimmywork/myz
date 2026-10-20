import { ed25519 } from "@noble/curves/ed25519"
import type { SyncObjectStore } from "./adapters"
import {
  aesGcmDecrypt,
  aesGcmEncrypt,
  hkdfSha256,
  packNoncePayload,
  sha256,
  splitNoncePayload,
  utf8ToBytes,
} from "./crypto"
import type { Roster } from "./roster"
import type { LockPayload } from "./types"
import { base64ToBytes, decodeBinaryPayload, encodeBinaryPayload } from "./utils"

export const DEFAULT_LEASE_MS = 30_000

export interface LockResult {
  acquired: boolean
  leaseExpiresAt?: string
}

/** Arguments shared by lock acquisition and renewal. */
export interface LockOptions {
  client: SyncObjectStore
  lockPath: string
  masterKey: Uint8Array
  privateKey: Uint8Array
  clientId: string
  deviceId: string
  leaseMs?: number
  roster: Roster
}

export async function acquireLock(
  options: LockOptions,
): Promise<LockResult> {
  const leaseMs = options.leaseMs || DEFAULT_LEASE_MS
  const existing = await options.client.getObject(options.lockPath)
  let etag: string | undefined
  if (existing) {
    etag = existing.etag
    const decoded = await decodeLock(
      existing.body,
      options.masterKey,
      options.roster,
    )
    const held =
      decoded && Date.parse(decoded.leaseExpiresAt) > Date.now()
    if (held) {
      return { acquired: false }
    }
  }
  const { payload, encrypted } = await buildEncryptedLock(
    options.clientId,
    options.deviceId,
    options.privateKey,
    options.masterKey,
    leaseMs,
  )
  await options.client.putObject(options.lockPath, encrypted, {
    ifMatch: etag,
    ifNoneMatch: etag ? undefined : "*",
  })
  return { acquired: true, leaseExpiresAt: payload.leaseExpiresAt }
}

/** Seal a signed lock payload for storage, shared by acquire and renew. */
async function buildEncryptedLock(
  clientId: string,
  deviceId: string,
  privateKey: Uint8Array,
  masterKey: Uint8Array,
  leaseMs: number,
): Promise<{ payload: LockPayload; encrypted: Uint8Array }> {
  const payload = await buildLockPayload(clientId, deviceId, privateKey, leaseMs)
  const encrypted = await encryptLockPayload(payload, masterKey)
  return { payload, encrypted }
}

/**
 * Extend the lease of a lock this client already owns. Returns
 * `{ acquired: false }` when the lock is gone, expired, tampered with, or
 * now held by another client (ownership is proven by the `clientId`).
 */
export async function renewLock(
  options: LockOptions,
): Promise<LockResult> {
  const leaseMs = options.leaseMs || DEFAULT_LEASE_MS
  const existing = await options.client.getObject(options.lockPath)
  if (!existing) return { acquired: false }
  const decoded = await decodeLock(
    existing.body,
    options.masterKey,
    options.roster,
  )
  // Ownership: the lock must belong to this client AND have been signed by
  // this device (verified against the roster above).
  if (
    !decoded ||
    decoded.clientId !== options.clientId ||
    decoded.deviceId !== options.deviceId
  ) {
    return { acquired: false }
  }
  const { payload, encrypted } = await buildEncryptedLock(
    options.clientId,
    options.deviceId,
    options.privateKey,
    options.masterKey,
    leaseMs,
  )
  try {
    await options.client.putObject(options.lockPath, encrypted, {
      ifMatch: existing.etag,
    })
  } catch {
    return { acquired: false }
  }
  return { acquired: true, leaseExpiresAt: payload.leaseExpiresAt }
}

/**
 * Release the lock only when this client still owns it. If the lease expired
 * and another client acquired the lock in the meantime, the release is a no-op
 * instead of deleting someone else's lock.
 */
export async function releaseLock(options: {
  client: SyncObjectStore
  lockPath: string
  masterKey: Uint8Array
  clientId: string
  roster: Roster
}): Promise<void> {
  const existing = await options.client.getObject(options.lockPath)
  if (!existing) return
  const decoded = await decodeLock(
    existing.body,
    options.masterKey,
    options.roster,
  )
  if (
    !decoded ||
    decoded.clientId !== options.clientId
  ) {
    return
  }
  try {
    await options.client.deleteObject(options.lockPath, {
      ifMatch: existing.etag,
    })
  } catch {
    // The lock changed between read and delete; leave it to its new owner.
  }
}

async function buildLockPayload(
  clientId: string,
  deviceId: string,
  privateKey: Uint8Array,
  leaseMs: number,
): Promise<LockPayload> {
  const issuedAt = new Date().toISOString()
  const leaseExpiresAt = new Date(Date.now() + leaseMs).toISOString()
  const payload: Omit<LockPayload, "signature"> = {
    clientId,
    deviceId,
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

async function decodeLock(
  payload: Uint8Array,
  masterKey: Uint8Array,
  roster: Roster,
): Promise<LockPayload | null> {
  try {
    const { nonce, ciphertext } = splitNoncePayload(payload, 12)
    const key = await hkdfSha256(masterKey, utf8ToBytes("lock"), 32)
    const plain = await aesGcmDecrypt(key, nonce, ciphertext)
    const decoded = decodeBinaryPayload(plain) as LockPayload
    if (!decoded || typeof decoded.deviceId !== "string") return null
    const signer = roster.devices.find(
      (device) => device.deviceId === decoded.deviceId,
    )
    if (!signer || signer.revokedAt) return null
    const signature = Uint8Array.from(atob(decoded.signature), (c) =>
      c.charCodeAt(0),
    )
    const payloadToVerify: Omit<LockPayload, "signature"> = {
      clientId: decoded.clientId,
      deviceId: decoded.deviceId,
      leaseExpiresAt: decoded.leaseExpiresAt,
      issuedAt: decoded.issuedAt,
    }
    const verifyBytes = encodeBinaryPayload(payloadToVerify)
    const digest = await sha256(verifyBytes)
    if (!ed25519.verify(signature, digest, base64ToBytes(signer.signPub))) {
      return null
    }
    return decoded
  } catch {
    return null
  }
}
