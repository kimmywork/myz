import { describe, expect, it } from "vitest"
import { generateAccountId, generateDataKey } from "../src/dataKey"
import {
  approveDeviceRequest,
  buildDeviceIndex,
  buildDeviceRequest,
  loadDeviceIndex,
  loadRoster,
  publishDeviceIndex,
  publishDeviceRequest,
  publishRoster,
  verifyDeviceIndex,
  verifyDeviceRequest,
} from "../src/deviceEnrollment"
import { deviceIdFromSignPublicKey, generateDeviceKeyPair } from "../src/deviceKeys"
import { createGenesisRoster, unwrapRosterDataKey } from "../src/roster"
import { bytesToBase64 } from "../src/utils"
import { InMemoryObjectStore } from "./helpers/inMemoryStore"

async function setup() {
  const host = generateDeviceKeyPair()
  const dataKey = generateDataKey()
  const accountId = generateAccountId()
  const roster = await createGenesisRoster({ accountId, device: host, dataKey })
  const hostId = await deviceIdFromSignPublicKey(host.signPublicKey)
  return { host, hostId, dataKey, accountId, roster }
}

describe("device enrollment (S3 mailbox)", () => {
  it("publishes and loads a roster", async () => {
    const { roster, accountId } = await setup()
    const store = new InMemoryObjectStore()
    await publishRoster(store, roster)
    expect(await loadRoster(store, accountId)).toEqual(roster)
  })

  it("rejects a roster publish that does not match the expected etag", async () => {
    const { roster } = await setup()
    const store = new InMemoryObjectStore()
    await publishRoster(store, roster)
    await expect(
      publishRoster(store, roster, { ifMatch: '"stale"' }),
    ).rejects.toThrow()
  })

  it("builds a signed device request and rejects tampering/expiry", async () => {
    const { accountId } = await setup()
    const guest = generateDeviceKeyPair()
    const now = new Date("2026-01-01T00:00:00.000Z")
    const request = await buildDeviceRequest({
      accountId,
      device: guest,
      name: "phone",
      now,
    })
    expect(await verifyDeviceRequest(request, now.getTime())).toBe(true)

    expect(
      await verifyDeviceRequest({ ...request, name: "tampered" }, now.getTime()),
    ).toBe(false)

    const later = Date.parse(request.expiresAt) + 1
    expect(await verifyDeviceRequest(request, later)).toBe(false)
  })

  it("stores a request with create-only semantics", async () => {
    const { accountId } = await setup()
    const guest = generateDeviceKeyPair()
    const request = await buildDeviceRequest({ accountId, device: guest })
    const store = new InMemoryObjectStore()
    await publishDeviceRequest(store, request)
    await expect(publishDeviceRequest(store, request)).rejects.toThrow()
  })

  it("builds and verifies a device index only for authorized devices", async () => {
    const { host, hostId, roster } = await setup()
    const index = await buildDeviceIndex({
      roster,
      signer: host,
      signerDeviceId: hostId,
      latestRequestId: null,
    })
    expect(await verifyDeviceIndex(index, roster)).toBe(true)
    expect(
      await verifyDeviceIndex({ ...index, rosterVersion: 42 }, roster),
    ).toBe(false)

    const outsider = generateDeviceKeyPair()
    const outsiderId = await deviceIdFromSignPublicKey(outsider.signPublicKey)
    await expect(
      buildDeviceIndex({
        roster,
        signer: outsider,
        signerDeviceId: outsiderId,
        latestRequestId: null,
      }),
    ).rejects.toThrow(/authorized/i)

    const store = new InMemoryObjectStore()
    await publishDeviceIndex(store, index)
    expect(await loadDeviceIndex(store, roster.accountId)).toEqual(index)
  })

  it("approves a request, adding the device and wrapping D for it", async () => {
    const { host, hostId, dataKey, accountId, roster } = await setup()
    const guest = generateDeviceKeyPair()
    const request = await buildDeviceRequest({ accountId, device: guest })

    const { roster: updated, newDeviceId } = await approveDeviceRequest({
      roster,
      approver: host,
      approverDeviceId: hostId,
      dataKey,
      request,
    })
    const guestId = await deviceIdFromSignPublicKey(guest.signPublicKey)
    expect(newDeviceId).toBe(guestId)
    expect(updated.rosterVersion).toBe(roster.rosterVersion + 1)
    const opened = await unwrapRosterDataKey(
      updated,
      guestId,
      guest.agreePrivateKey,
    )
    expect(Array.from(opened)).toEqual(Array.from(dataKey))
  })

  it("rejects a request signed by a device that is not the claimed id", async () => {
    const { accountId } = await setup()
    const guest = generateDeviceKeyPair()
    const request = await buildDeviceRequest({ accountId, device: guest })
    const impostor = generateDeviceKeyPair()
    expect(
      await verifyDeviceRequest({
        ...request,
        signPub: bytesToBase64(impostor.signPublicKey),
      }),
    ).toBe(false)
  })
})
