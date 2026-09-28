import { ed25519, x25519 } from "@noble/curves/ed25519"
import { aesGcmDecrypt, aesGcmEncrypt, hkdfSha256, sha256, utf8ToBytes } from "./crypto"
import {
  base32Encode,
  base64ToBytes,
  bytesToBase64,
  concatBytes,
  toArrayBuffer,
} from "./utils"

const WRAP_INFO = "myz:device-wrap:v2"

export interface DeviceKeyPair {
  signPrivateKey: Uint8Array
  signPublicKey: Uint8Array
  agreePrivateKey: Uint8Array
  agreePublicKey: Uint8Array
}

export interface WrappedDataKey {
  ephPub: string
  nonce: string
  cipher: string
}

export interface WrappedDeviceKeys {
  nonce: string
  cipher: string
}

export function generateDeviceKeyPair(): DeviceKeyPair {
  const signPrivateKey = ed25519.utils.randomPrivateKey()
  const agreePrivateKey = x25519.utils.randomPrivateKey()
  return {
    signPrivateKey,
    signPublicKey: ed25519.getPublicKey(signPrivateKey),
    agreePrivateKey,
    agreePublicKey: x25519.getPublicKey(agreePrivateKey),
  }
}

export async function deviceIdFromSignPublicKey(
  signPublicKey: Uint8Array,
): Promise<string> {
  return base32Encode(await sha256(signPublicKey))
}

/** ECIES-wrap the data key D to a device's X25519 public key. */
export async function wrapDataKeyForDevice(
  dataKey: Uint8Array,
  agreePublicKey: Uint8Array,
  epoch: number,
): Promise<WrappedDataKey> {
  const ephPrivate = x25519.utils.randomPrivateKey()
  const ephPub = x25519.getPublicKey(ephPrivate)
  const shared = x25519.getSharedSecret(ephPrivate, agreePublicKey)
  const kek = await hkdfSha256(shared, utf8ToBytes(WRAP_INFO), 32)
  const { nonce, ciphertext } = await aesGcmEncrypt(
    kek,
    dataKey,
    utf8ToBytes(`epoch:${epoch}`),
  )
  return {
    ephPub: bytesToBase64(ephPub),
    nonce: bytesToBase64(nonce),
    cipher: bytesToBase64(ciphertext),
  }
}

export async function unwrapDataKeyForDevice(
  wrapped: WrappedDataKey,
  agreePrivateKey: Uint8Array,
  epoch: number,
): Promise<Uint8Array> {
  const shared = x25519.getSharedSecret(
    agreePrivateKey,
    base64ToBytes(wrapped.ephPub),
  )
  const kek = await hkdfSha256(shared, utf8ToBytes(WRAP_INFO), 32)
  return aesGcmDecrypt(
    kek,
    base64ToBytes(wrapped.nonce),
    base64ToBytes(wrapped.cipher),
    utf8ToBytes(`epoch:${epoch}`),
  )
}

/** Wrap a device's private keys with the local, non-extractable device key. */
export async function wrapDeviceKeys(
  deviceKey: CryptoKey,
  pair: DeviceKeyPair,
  aad: Uint8Array,
): Promise<WrappedDeviceKeys> {
  const plain = concatBytes(
    pair.signPrivateKey,
    pair.agreePrivateKey,
  )
  const nonce = new Uint8Array(12)
  crypto.getRandomValues(nonce)
  const cipher = new Uint8Array(
    await crypto.subtle.encrypt(
      {
        name: "AES-GCM",
        iv: toArrayBuffer(nonce),
        additionalData: toArrayBuffer(aad),
      },
      deviceKey,
      toArrayBuffer(plain),
    ),
  )
  return { nonce: bytesToBase64(nonce), cipher: bytesToBase64(cipher) }
}

export async function unwrapDeviceKeys(
  deviceKey: CryptoKey,
  wrapped: WrappedDeviceKeys,
  aad: Uint8Array,
): Promise<DeviceKeyPair> {
  const plain = new Uint8Array(
    await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: toArrayBuffer(base64ToBytes(wrapped.nonce)),
        additionalData: toArrayBuffer(aad),
      },
      deviceKey,
      toArrayBuffer(base64ToBytes(wrapped.cipher)),
    ),
  )
  const signPrivateKey = plain.slice(0, 32)
  const agreePrivateKey = plain.slice(32, 64)
  return {
    signPrivateKey,
    signPublicKey: ed25519.getPublicKey(signPrivateKey),
    agreePrivateKey,
    agreePublicKey: x25519.getPublicKey(agreePrivateKey),
  }
}
