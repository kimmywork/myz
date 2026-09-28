import { x25519 } from "@noble/curves/ed25519"
import {
  aesGcmDecrypt,
  aesGcmEncrypt,
  hkdfSha256,
  randomBytes,
  utf8ToBytes,
} from "./crypto"
import { deviceIdFromSignPublicKey, type DeviceKeyPair } from "./deviceKeys"
import type { DevicePublicKeys } from "./roster"
import {
  base64ToBytes,
  bytesToBase64,
  decodeBinaryPayload,
  encodeBinaryPayload,
} from "./utils"

const PAIRING_INFO = "myz:pairing:v2"

export interface PairingOffer {
  accountId: string
  hostDeviceId: string
  ephPub: string
  nonce: string
}

export interface PairingResponse {
  ephPub: string
  nonce: string
  cipher: string
}

interface PairingPayload {
  accountId: string
  deviceId: string
  signPub: string
  agreePub: string
}

async function kekFrom(shared: Uint8Array): Promise<Uint8Array> {
  return hkdfSha256(shared, utf8ToBytes(PAIRING_INFO), 32)
}

/** A 6-digit short authentication string for the user to compare by voice. */
export async function deriveSas(shared: Uint8Array): Promise<string> {
  const digest = await hkdfSha256(shared, utf8ToBytes("myz:pairing:sas"), 4)
  const value =
    ((digest[0] << 16) | (digest[1] << 8) | digest[2]) % 1_000_000
  return value.toString().padStart(6, "0")
}

export async function createPairingOffer(options: {
  accountId: string
  host: DeviceKeyPair
}): Promise<{ offer: PairingOffer; secret: Uint8Array }> {
  const ephPrivateKey = x25519.utils.randomPrivateKey()
  const offer: PairingOffer = {
    accountId: options.accountId,
    hostDeviceId: await deviceIdFromSignPublicKey(options.host.signPublicKey),
    ephPub: bytesToBase64(x25519.getPublicKey(ephPrivateKey)),
    nonce: bytesToBase64(randomBytes(16)),
  }
  return { offer, secret: ephPrivateKey }
}

export async function acceptPairingOffer(options: {
  offer: PairingOffer
  device: DeviceKeyPair
}): Promise<{ response: PairingResponse; sas: string }> {
  const ephPrivateKey = x25519.utils.randomPrivateKey()
  const shared = x25519.getSharedSecret(
    ephPrivateKey,
    base64ToBytes(options.offer.ephPub),
  )
  const kek = await kekFrom(shared)
  const payload: PairingPayload = {
    accountId: options.offer.accountId,
    deviceId: await deviceIdFromSignPublicKey(options.device.signPublicKey),
    signPub: bytesToBase64(options.device.signPublicKey),
    agreePub: bytesToBase64(options.device.agreePublicKey),
  }
  const { nonce, ciphertext } = await aesGcmEncrypt(
    kek,
    encodeBinaryPayload(payload),
    utf8ToBytes(options.offer.nonce),
  )
  return {
    response: {
      ephPub: bytesToBase64(x25519.getPublicKey(ephPrivateKey)),
      nonce: bytesToBase64(nonce),
      cipher: bytesToBase64(ciphertext),
    },
    sas: await deriveSas(shared),
  }
}

export async function completePairing(options: {
  offer: PairingOffer
  secret: Uint8Array
  response: PairingResponse
}): Promise<{ device: DevicePublicKeys; sas: string }> {
  const shared = x25519.getSharedSecret(
    options.secret,
    base64ToBytes(options.response.ephPub),
  )
  const kek = await kekFrom(shared)
  const plain = await aesGcmDecrypt(
    kek,
    base64ToBytes(options.response.nonce),
    base64ToBytes(options.response.cipher),
    utf8ToBytes(options.offer.nonce),
  )
  const payload = decodeBinaryPayload(plain) as PairingPayload
  if (payload.accountId !== options.offer.accountId) {
    throw new Error("Pairing account mismatch")
  }
  const expectedId = await deviceIdFromSignPublicKey(
    base64ToBytes(payload.signPub),
  )
  if (expectedId !== payload.deviceId) {
    throw new Error("Pairing device id mismatch")
  }
  return {
    device: {
      signPublicKey: base64ToBytes(payload.signPub),
      agreePublicKey: base64ToBytes(payload.agreePub),
    },
    sas: await deriveSas(shared),
  }
}
