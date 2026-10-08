import { describe, expect, it } from "vitest"
import type { SyncAccount } from "../src/account"
import { createSyncAccount, openSyncAccount } from "../src/account"
import {
  syncAccountStreams,
  type StreamDataset,
  type StreamStateSnapshot,
  type StreamStateStore,
} from "../src/accountSync"
import { generateDeviceKeyPair } from "../src/deviceKeys"
import { addDeviceToRoster } from "../src/roster"
import type {
  StreamRecordInput,
  StreamRemoteRecord,
} from "../src/streamClient"
import { InMemoryObjectStore } from "./helpers/inMemoryStore"

const ACCOUNT = "acct_multi"
const STREAM = "highlights"

function createDataset(streamId: string) {
  const records = new Map<string, StreamRemoteRecord>()
  const dataset: StreamDataset = {
    streamId,
    async collect(): Promise<StreamRecordInput[]> {
      return Array.from(records.values()).map((record) => ({
        recordId: record.recordId,
        updatedAt: record.updatedAt,
        data: record.data,
      }))
    },
    async apply(record) {
      records.set(record.recordId, record)
    },
    async remove(recordId) {
      records.delete(recordId)
    },
  }
  return { dataset, records }
}

function createStateStore() {
  const states = new Map<string, StreamStateSnapshot>()
  const store: StreamStateStore = {
    async getStreamState(streamId) {
      return states.get(streamId) ?? null
    },
    async setStreamState(streamId, state) {
      states.set(streamId, state)
    },
  }
  return store
}

async function fixture() {
  const hostDevice = generateDeviceKeyPair()
  const guestDevice = generateDeviceKeyPair()
  const hostAccount = await createSyncAccount({
    device: hostDevice,
    accountId: ACCOUNT,
  })
  const { roster } = await addDeviceToRoster({
    roster: hostAccount.roster,
    approver: hostDevice,
    approverDeviceId: hostAccount.deviceId,
    newDevice: guestDevice,
    dataKey: hostAccount.dataKey,
  })
  const hostWithRoster = await openSyncAccount({
    device: hostDevice,
    roster,
  })
  const guestAccount = await openSyncAccount({
    device: guestDevice,
    roster,
  })
  return {
    hostDevice,
    guestDevice,
    hostAccount: hostWithRoster,
    guestAccount,
    roster,
  }
}

async function syncDevice(
  store: InMemoryObjectStore,
  account: SyncAccount,
  device: ReturnType<typeof generateDeviceKeyPair>,
  dataset: StreamDataset,
  stateStore: StreamStateStore,
) {
  return syncAccountStreams({
    store,
    account,
    device,
    clientId: account.deviceId,
    datasets: [dataset],
    stateStore,
  })
}

describe("account stream orchestration", () => {
  it("converges two devices across a shared stream", async () => {
    const { hostDevice, guestDevice, hostAccount, guestAccount } =
      await fixture()
    const store = new InMemoryObjectStore()
    const host = createDataset(STREAM)
    const guest = createDataset(STREAM)
    const hostState = createStateStore()
    const guestState = createStateStore()

    host.records.set("h:1", {
      recordId: "h:1",
      updatedAt: "2026-01-01T00:00:00.000Z",
      recordHash: "",
      data: { v: 1 },
    })
    guest.records.set("h:2", {
      recordId: "h:2",
      updatedAt: "2026-01-01T00:01:00.000Z",
      recordHash: "",
      data: { v: 2 },
    })

    await syncDevice(store, hostAccount, hostDevice, host.dataset, hostState)
    await syncDevice(
      store,
      guestAccount,
      guestDevice,
      guest.dataset,
      guestState,
    )
    const third = await syncDevice(
      store,
      hostAccount,
      hostDevice,
      host.dataset,
      hostState,
    )
    expect(third.applied).toBeGreaterThan(0)

    expect(host.records.has("h:1")).toBe(true)
    expect(host.records.has("h:2")).toBe(true)
    expect(guest.records.has("h:1")).toBe(true)
    expect(guest.records.get("h:2")?.data).toEqual({ v: 2 })
  })

  it("isolates a failing stream from the others", async () => {
    const { hostDevice, hostAccount } = await fixture()
    const store = new InMemoryObjectStore()
    const good = createDataset(STREAM)
    await syncDevice(store, hostAccount, hostDevice, good.dataset, createStateStore())

    const failing: StreamDataset = {
      streamId: "inbox",
      async collect() {
        throw new Error("boom")
      },
      async apply() {},
      async remove() {},
    }
    const result = await syncAccountStreams({
      store,
      account: hostAccount,
      device: hostDevice,
      clientId: hostAccount.deviceId,
      datasets: [failing, good.dataset],
      stateStore: createStateStore(),
    })
    const failingSummary = result.streams.find(
      (stream) => stream.streamId === "inbox",
    )
    expect(failingSummary?.error).toMatch(/boom/)
    expect(
      result.streams.find((stream) => stream.streamId === STREAM)?.error,
    ).toBeUndefined()
  })

  it("propagates dataset tombstones to another device and clears pending deletions", async () => {
    const { hostDevice, hostAccount, guestDevice, guestAccount } = await fixture()
    const store = new InMemoryObjectStore()
    const hostState = createStateStore()
    const host = createDataset(STREAM)
    host.records.set("h:1", {
      recordId: "h:1",
      updatedAt: "2026-01-01T00:00:00.000Z",
      recordHash: "",
      data: { v: 1 },
    })
    await syncAccountStreams({
      store,
      account: hostAccount,
      device: hostDevice,
      clientId: hostAccount.deviceId,
      datasets: [host.dataset],
      stateStore: hostState,
    })

    const guest = createDataset(STREAM)
    const guestState = createStateStore()
    await syncAccountStreams({
      store,
      account: guestAccount,
      device: guestDevice,
      clientId: guestAccount.deviceId,
      datasets: [guest.dataset],
      stateStore: guestState,
    })
    expect(guest.records.has("h:1")).toBe(true)

    host.records.delete("h:1")
    let cleared: string[] = []
    const hostWithTombstones: StreamDataset = {
      ...host.dataset,
      collectTombstones: async () => ({ "h:1": new Date().toISOString() }),
      clearTombstones: async (ids) => {
        cleared = ids
      },
    }
    await syncAccountStreams({
      store,
      account: hostAccount,
      device: hostDevice,
      clientId: hostAccount.deviceId,
      datasets: [hostWithTombstones],
      stateStore: hostState,
    })
    expect(cleared).toEqual(["h:1"])

    const guestAfter = await syncAccountStreams({
      store,
      account: guestAccount,
      device: guestDevice,
      clientId: guestAccount.deviceId,
      datasets: [guest.dataset],
      stateStore: guestState,
    })
    expect(guest.records.has("h:1")).toBe(false)
    expect(guestAfter.streams[0].deleted).toBe(1)
  })
})
