import { describe, expect, it } from "vitest"
import {
  createSyncAccount,
  openSyncAccount,
  signAccountPayload,
  verifyAccountPayload,
} from "../src/account"
import { deriveMasterKeyFromDataKey } from "../src/dataKey"
import { deviceIdFromSignPublicKey, generateDeviceKeyPair } from "../src/deviceKeys"

describe("sync account (KM4 core)", () => {
  it("creates a self-signed account with a random id and derived master key", async () => {
    const device = generateDeviceKeyPair()
    const account = await createSyncAccount({ device })
    expect(account.accountId.startsWith("acct_")).toBe(true)
    expect(account.deviceId).toBe(
      await deviceIdFromSignPublicKey(device.signPublicKey),
    )
    const expectedMaster = await deriveMasterKeyFromDataKey(account.dataKey)
    expect(Array.from(account.masterKey)).toEqual(Array.from(expectedMaster))
    expect(account.roster.devices).toHaveLength(1)
  })

  it("opens an account on the authorized device and rejects others", async () => {
    const host = generateDeviceKeyPair()
    const account = await createSyncAccount({ device: host })
    const reopened = await openSyncAccount({
      device: host,
      roster: account.roster,
    })
    expect(reopened.accountId).toBe(account.accountId)
    expect(Array.from(reopened.dataKey)).toEqual(Array.from(account.dataKey))

    const stranger = generateDeviceKeyPair()
    await expect(
      openSyncAccount({ device: stranger, roster: account.roster }),
    ).rejects.toThrow()
  })

  it("signs payloads per device and only roster members verify", async () => {
    const host = generateDeviceKeyPair()
    const account = await createSyncAccount({ device: host })
    const payload = { streamId: "inbox", streamVersion: 1 }
    const signature = await signAccountPayload(payload, host)
    expect(
      await verifyAccountPayload(
        payload,
        signature,
        account.deviceId,
        account.roster,
      ),
    ).toBe(true)
    expect(
      await verifyAccountPayload(
        { ...payload, streamVersion: 2 },
        signature,
        account.deviceId,
        account.roster,
      ),
    ).toBe(false)

    const stranger = generateDeviceKeyPair()
    const strangerId = await deviceIdFromSignPublicKey(stranger.signPublicKey)
    expect(
      await verifyAccountPayload(
        payload,
        signature,
        strangerId,
        account.roster,
      ),
    ).toBe(false)
  })
})
