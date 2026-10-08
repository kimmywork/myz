import { describe, expect, it } from "vitest"
import { generateDataKey } from "../src/dataKey"
import {
  deviceIdFromSignPublicKey,
  generateDeviceKeyPair,
} from "../src/deviceKeys"
import {
  addDeviceToRoster,
  createGenesisRoster,
  revokeDeviceAndRotate,
} from "../src/roster"
import { readStreamAcks, writeStreamAck } from "../src/streamAcks"
import { InMemoryObjectStore } from "./helpers/inMemoryStore"

const ACCOUNT = "acct_ack"
const STREAM = "inbox"

async function setup() {
  const host = generateDeviceKeyPair()
  const dataKey = generateDataKey()
  const roster = await createGenesisRoster({ accountId: ACCOUNT, device: host, dataKey })
  const hostId = await deviceIdFromSignPublicKey(host.signPublicKey)
  const guest = generateDeviceKeyPair()
  const guestId = await deviceIdFromSignPublicKey(guest.signPublicKey)
  const { roster: shared } = await addDeviceToRoster({
    roster,
    approver: host,
    approverDeviceId: hostId,
    newDevice: guest,
    dataKey,
  })
  return { host, hostId, guest, guestId, roster: shared, dataKey }
}

describe("stream acks (device watermarks)", () => {
  it("writes and reads a verified ack", async () => {
    const { guest, guestId, roster } = await setup()
    const store = new InMemoryObjectStore()
    await writeStreamAck(store, {
      accountId: ACCOUNT,
      streamId: STREAM,
      device: guest,
      deviceId: guestId,
      streamVersion: 5,
    })
    const acks = await readStreamAcks(store, { accountId: ACCOUNT, streamId: STREAM, roster })
    expect(acks.get(guestId)).toBe(5)
  })

  it("ignores acks from devices not in the roster", async () => {
    const { roster } = await setup()
    const store = new InMemoryObjectStore()
    const outsider = generateDeviceKeyPair()
    const outsiderId = await deviceIdFromSignPublicKey(outsider.signPublicKey)
    await writeStreamAck(store, {
      accountId: ACCOUNT,
      streamId: STREAM,
      device: outsider,
      deviceId: outsiderId,
      streamVersion: 3,
    })
    const acks = await readStreamAcks(store, { accountId: ACCOUNT, streamId: STREAM, roster })
    expect(acks.has(outsiderId)).toBe(false)
  })

  it("ignores acks from revoked devices", async () => {
    const { host, hostId, guest, guestId, roster, dataKey } = await setup()
    const store = new InMemoryObjectStore()
    await writeStreamAck(store, {
      accountId: ACCOUNT,
      streamId: STREAM,
      device: guest,
      deviceId: guestId,
      streamVersion: 4,
    })
    const rotated = await revokeDeviceAndRotate({
      roster,
      approver: host,
      approverDeviceId: hostId,
      revokeDeviceId: guestId,
      newDataKey: generateDataKey(),
    })
    void dataKey
    const acks = await readStreamAcks(store, {
      accountId: ACCOUNT,
      streamId: STREAM,
      roster: rotated,
    })
    expect(acks.has(guestId)).toBe(false)
  })
})
