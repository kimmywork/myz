import { describe, expect, it } from "vitest"
import { generateDeviceKeyPair } from "../src/deviceKeys"
import {
  acceptPairingOffer,
  completePairing,
  createPairingOffer,
  deriveSas,
} from "../src/pairing"

describe("same-machine pairing", () => {
  it("completes pairing and both sides agree on the SAS", async () => {
    const host = generateDeviceKeyPair()
    const guest = generateDeviceKeyPair()
    const { offer, secret } = await createPairingOffer({
      accountId: "acct_home",
      host,
    })
    const accepted = await acceptPairingOffer({ offer, device: guest })
    const completed = await completePairing({
      offer,
      secret,
      response: accepted.response,
    })
    expect(completed.sas).toBe(accepted.sas)
    expect(Array.from(completed.device.signPublicKey)).toEqual(
      Array.from(guest.signPublicKey),
    )
    expect(Array.from(completed.device.agreePublicKey)).toEqual(
      Array.from(guest.agreePublicKey),
    )
  })

  it("produces a different SAS under a key-substitution attack", async () => {
    const host = generateDeviceKeyPair()
    const guest = generateDeviceKeyPair()
    const attacker = generateDeviceKeyPair()

    const { offer, secret } = await createPairingOffer({
      accountId: "acct_home",
      host,
    })
    const honest = await acceptPairingOffer({ offer, device: guest })
    const completed = await completePairing({
      offer,
      secret,
      response: honest.response,
    })

    const { offer: evilOffer } = await createPairingOffer({
      accountId: "acct_home",
      host: attacker,
    })
    const onEvil = await acceptPairingOffer({ offer: evilOffer, device: guest })
    expect(onEvil.sas).not.toBe(completed.sas)
  })

  it("derives a stable six-digit SAS", async () => {
    const shared = new Uint8Array(32).fill(4)
    const sas = await deriveSas(shared)
    expect(sas).toMatch(/^\d{6}$/)
    expect(await deriveSas(shared)).toBe(sas)
  })
})
