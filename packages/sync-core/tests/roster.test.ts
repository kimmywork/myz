import { describe, expect, it } from "vitest"
import { generateAccountId, generateDataKey } from "../src/dataKey"
import { deviceIdFromSignPublicKey, generateDeviceKeyPair } from "../src/deviceKeys"
import {
  addDeviceToRoster,
  assertRosterAdvance,
  createGenesisRoster,
  revokeDeviceAndRotate,
  unwrapRosterDataKey,
  verifyRoster,
} from "../src/roster"
import { RosterSchemaV2 } from "../src/schemas/v2"

async function deviceId(pair: ReturnType<typeof generateDeviceKeyPair>) {
  return deviceIdFromSignPublicKey(pair.signPublicKey)
}

describe("device roster", () => {
  it("creates a signed genesis roster matching the v2 schema", async () => {
    const device = generateDeviceKeyPair()
    const dataKey = generateDataKey()
    const roster = await createGenesisRoster({
      accountId: generateAccountId(),
      device,
      dataKey,
    })
    expect(RosterSchemaV2.safeParse(roster).success).toBe(true)
    expect(await verifyRoster(roster)).toBe(true)
    const opened = await unwrapRosterDataKey(
      roster,
      await deviceId(device),
      device.agreePrivateKey,
    )
    expect(Array.from(opened)).toEqual(Array.from(dataKey))
  })

  it("adds a device that can unwrap D while unrelated devices cannot", async () => {
    const a = generateDeviceKeyPair()
    const b = generateDeviceKeyPair()
    const stranger = generateDeviceKeyPair()
    const dataKey = generateDataKey()
    const genesis = await createGenesisRoster({
      accountId: generateAccountId(),
      device: a,
      dataKey,
    })
    const { roster } = await addDeviceToRoster({
      roster: genesis,
      approver: a,
      approverDeviceId: await deviceId(a),
      newDevice: b,
      dataKey,
    })
    expect(await verifyRoster(roster)).toBe(true)
    const bId = await deviceId(b)
    expect(roster.devices.map((device) => device.deviceId)).toContain(bId)
    const opened = await unwrapRosterDataKey(roster, bId, b.agreePrivateKey)
    expect(Array.from(opened)).toEqual(Array.from(dataKey))

    const strangerId = await deviceId(stranger)
    await expect(
      unwrapRosterDataKey(roster, strangerId, stranger.agreePrivateKey),
    ).rejects.toThrow()
  })

  it("rotates on revoke so the removed device cannot read the new epoch", async () => {
    const a = generateDeviceKeyPair()
    const b = generateDeviceKeyPair()
    const dataKey = generateDataKey()
    const genesis = await createGenesisRoster({
      accountId: generateAccountId(),
      device: a,
      dataKey,
    })
    const aId = await deviceId(a)
    const bId = await deviceId(b)
    const { roster } = await addDeviceToRoster({
      roster: genesis,
      approver: a,
      approverDeviceId: aId,
      newDevice: b,
      dataKey,
    })

    const newDataKey = generateDataKey()
    const rotated = await revokeDeviceAndRotate({
      roster,
      approver: a,
      approverDeviceId: aId,
      revokeDeviceId: bId,
      newDataKey,
    })
    expect(rotated.epoch).toBe(2)
    expect(
      rotated.devices.find((device) => device.deviceId === bId)?.revokedAt,
    ).toBeTruthy()
    expect(rotated.wrappedD.some((wrapped) => wrapped.deviceId === bId)).toBe(
      false,
    )
    await expect(
      unwrapRosterDataKey(rotated, bId, b.agreePrivateKey),
    ).rejects.toThrow()

    const opened = await unwrapRosterDataKey(
      rotated,
      aId,
      a.agreePrivateKey,
    )
    expect(Array.from(opened)).toEqual(Array.from(newDataKey))
  })

  it("rejects a tampered roster signature", async () => {
    const roster = await createGenesisRoster({
      accountId: generateAccountId(),
      device: generateDeviceKeyPair(),
      dataKey: generateDataKey(),
    })
    expect(await verifyRoster({ ...roster, rosterVersion: 99 })).toBe(false)
  })

  it("rejects a stale or cross-account roster advance", async () => {
    const roster = await createGenesisRoster({
      accountId: generateAccountId(),
      device: generateDeviceKeyPair(),
      dataKey: generateDataKey(),
    })
    expect(() =>
      assertRosterAdvance(roster, { ...roster, rosterVersion: 1 }),
    ).toThrow(/stale/i)
    expect(() =>
      assertRosterAdvance(roster, {
        ...roster,
        accountId: "acct_other",
        rosterVersion: 2,
      }),
    ).toThrow(/account/i)
  })
})
