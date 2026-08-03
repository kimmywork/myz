import { concatBytes, toArrayBuffer } from "./utils"

const textEncoder = new TextEncoder()
const textDecoder = new TextDecoder()

export function utf8ToBytes(value: string): Uint8Array {
  return textEncoder.encode(value)
}

export function bytesToUtf8(bytes: Uint8Array): string {
  return textDecoder.decode(bytes)
}

export function randomBytes(length: number): Uint8Array {
  const output = new Uint8Array(length)
  crypto.getRandomValues(output)
  return output
}

export async function sha256(bytes: Uint8Array): Promise<Uint8Array> {
  const digest = await crypto.subtle.digest("SHA-256", toArrayBuffer(bytes))
  return new Uint8Array(digest)
}

export async function hmacSha256(
  keyBytes: Uint8Array,
  dataBytes: Uint8Array,
): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    toArrayBuffer(keyBytes),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  )
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    toArrayBuffer(dataBytes),
  )
  return new Uint8Array(signature)
}

export async function hkdfSha256(
  keyBytes: Uint8Array,
  infoBytes: Uint8Array,
  length = 32,
  saltBytes?: Uint8Array,
): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    toArrayBuffer(keyBytes),
    "HKDF",
    false,
    ["deriveBits"],
  )
  const bits = await crypto.subtle.deriveBits(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: toArrayBuffer(saltBytes || new Uint8Array()),
      info: toArrayBuffer(infoBytes),
    },
    key,
    length * 8,
  )
  return new Uint8Array(bits)
}

export async function pbkdf2Sha256(
  password: Uint8Array,
  salt: Uint8Array,
  iterations: number,
  length: number,
): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    toArrayBuffer(password),
    { name: "PBKDF2" },
    false,
    ["deriveBits"],
  )
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: toArrayBuffer(salt),
      iterations,
    },
    key,
    length * 8,
  )
  return new Uint8Array(bits)
}

export async function aesGcmEncrypt(
  keyBytes: Uint8Array,
  plaintext: Uint8Array,
  aad?: Uint8Array,
): Promise<{ nonce: Uint8Array; ciphertext: Uint8Array }> {
  const nonce = randomBytes(12)
  const key = await crypto.subtle.importKey(
    "raw",
    toArrayBuffer(keyBytes),
    "AES-GCM",
    false,
    ["encrypt"],
  )
  const params: AesGcmParams = {
    name: "AES-GCM",
    iv: toArrayBuffer(nonce),
  }
  if (aad !== undefined) {
    params.additionalData = toArrayBuffer(aad)
  }
  const cipher = await crypto.subtle.encrypt(
    params,
    key,
    toArrayBuffer(plaintext),
  )
  return { nonce, ciphertext: new Uint8Array(cipher) }
}

export async function aesGcmDecrypt(
  keyBytes: Uint8Array,
  nonce: Uint8Array,
  ciphertext: Uint8Array,
  aad?: Uint8Array,
): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    toArrayBuffer(keyBytes),
    "AES-GCM",
    false,
    ["decrypt"],
  )
  const params: AesGcmParams = {
    name: "AES-GCM",
    iv: toArrayBuffer(nonce),
  }
  if (aad !== undefined) {
    params.additionalData = toArrayBuffer(aad)
  }
  const plain = await crypto.subtle.decrypt(
    params,
    key,
    toArrayBuffer(ciphertext),
  )
  return new Uint8Array(plain)
}

export function splitNoncePayload(payload: Uint8Array, nonceLength = 12) {
  const nonce = payload.slice(0, nonceLength)
  const ciphertext = payload.slice(nonceLength)
  return { nonce, ciphertext }
}

export function packNoncePayload(nonce: Uint8Array, ciphertext: Uint8Array) {
  return concatBytes(nonce, ciphertext)
}
