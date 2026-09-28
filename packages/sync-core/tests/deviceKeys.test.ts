import { describe, expect, it } from "vitest"
import { utf8ToBytes } from "../src/crypto"
import {
  deviceIdFromSignPublicKey,
  generateDeviceKeyPair,
  unwrapDataKeyForDevice,
  unwrapDeviceKeys,
  wrapDataKeyForDevice,
  wrapDeviceKeys,
} from "../src/deviceKeys"

describe("device keys", () => {
  it("generates distinct signing and agreement key pairs", () => {
    const a = generateDeviceKeyPair()
    const b = generateDeviceKeyPair()
    expect(a.signPublicKey).toHaveLength(32)
    expect(a.agreePublicKey).toHaveLength(32)
    expect(a.signPublicKey).not.toEqual(b.signPublicKey)
    expect(a.agreePublicKey).not.toEqual(b.agreePublicKey)
  })

  it("derives a stable device id from the signing public key", async () => {
    const pair = generateDeviceKeyPair()
    const id1 = await deviceIdFromSignPublicKey(pair.signPublicKey)
    const id2 = await deviceIdFromSignPublicKey(pair.signPublicKey)
    expect(id1).toBe(id2)
    expect(id1.length).toBeGreaterThan(0)
  })

  it("ECIES-wraps D and only the target device can unwrap it", async () => {
    const device = generateDeviceKeyPair()
    const other = generateDeviceKeyPair()
    const dataKey = new Uint8Array(32).fill(9)

    const wrapped = await wrapDataKeyForDevice(dataKey, device.agreePublicKey, 1)
    const opened = await unwrapDataKeyForDevice(
      wrapped,
      device.agreePrivateKey,
      1,
    )
    expect(Array.from(opened)).toEqual(Array.from(dataKey))

    await expect(
      unwrapDataKeyForDevice(wrapped, other.agreePrivateKey, 1),
    ).rejects.toThrow()
  })

  it("binds the wrapped data key to its epoch", async () => {
    const device = generateDeviceKeyPair()
    const wrapped = await wrapDataKeyForDevice(
      new Uint8Array(32).fill(1),
      device.agreePublicKey,
      1,
    )
    await expect(
      unwrapDataKeyForDevice(wrapped, device.agreePrivateKey, 2),
    ).rejects.toThrow()
  })

  it("wraps and unwraps device private keys with the local device key", async () => {
    const deviceKey = await crypto.subtle.generateKey(
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"],
    )
    const pair = generateDeviceKeyPair()
    const aad = utf8ToBytes("myz:device-keys:v2")
    const wrapped = await wrapDeviceKeys(deviceKey, pair, aad)
    const opened = await unwrapDeviceKeys(deviceKey, wrapped, aad)
    expect(Array.from(opened.signPrivateKey)).toEqual(
      Array.from(pair.signPrivateKey),
    )
    expect(Array.from(opened.agreePrivateKey)).toEqual(
      Array.from(pair.agreePrivateKey),
    )
    expect(Array.from(opened.signPublicKey)).toEqual(
      Array.from(pair.signPublicKey),
    )

    await expect(
      unwrapDeviceKeys(deviceKey, wrapped, utf8ToBytes("wrong-aad")),
    ).rejects.toThrow()
  })
})
