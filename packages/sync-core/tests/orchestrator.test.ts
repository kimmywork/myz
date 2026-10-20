import { describe, expect, it, vi } from "vitest"
import { createSyncAccount } from "../src/account"
import type {
  StreamDataset,
  StreamStateSnapshot,
  StreamStateStore,
} from "../src/accountSync"
import { generateDeviceKeyPair } from "../src/deviceKeys"
import { acquireLock } from "../src/lock"
import {
  runAccountSync,
  type RunAccountSyncOptions,
} from "../src/orchestrator"
import type { StreamRemoteRecord } from "../src/streamClient"
import { InMemoryObjectStore } from "./helpers/inMemoryStore"

const { gcStreamMock } = vi.hoisted(() => ({
  gcStreamMock: vi.fn(async () => ({ deletedManifests: 0, deletedShards: 0 })),
}))

vi.mock("../src/streamGc", () => ({ gcStream: gcStreamMock }))

const DATA_KEY = new Uint8Array(32).fill(7)

function createDataset(streamId: string) {
  const records = new Map<string, StreamRemoteRecord>()
  const dataset: StreamDataset = {
    streamId,
    async collect() {
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

function createStateStore(): StreamStateStore {
  const states = new Map<string, StreamStateSnapshot>()
  return {
    async getStreamState(streamId) {
      return states.get(streamId) ?? null
    },
    async setStreamState(streamId, state) {
      states.set(streamId, state)
    },
  }
}

function failingDataset(streamId: string): StreamDataset {
  return {
    streamId,
    async collect() {
      throw new Error("collect boom")
    },
    async apply() {},
    async remove() {},
  }
}

async function fixture() {
  const device = generateDeviceKeyPair()
  const account = await createSyncAccount({
    device,
    accountId: "acct_orch",
    dataKey: DATA_KEY,
  })
  return { device, account }
}

function lockPath(accountId: string) {
  return `${accountId}/lock/lease.bin`
}

describe("runAccountSync", () => {
  it("syncs, uploads, releases the lock and reports the uploaded streams", async () => {
    const store = new InMemoryObjectStore()
    const { device, account } = await fixture()
    const highlights = createDataset("highlights")
    highlights.records.set("h:1", {
      recordId: "h:1",
      updatedAt: "2026-01-01T00:00:00.000Z",
      recordHash: "",
      data: { v: 1 },
    })

    const result = await runAccountSync({
      store,
      account,
      device,
      clientId: "client-1",
      datasets: [highlights.dataset],
      stateStore: createStateStore(),
      lock: {},
      gc: false,
    })

    expect(result.status).toBe("synced")
    expect(result.uploadedStreamIds).toEqual(["highlights"])
    expect(result.error).toBeUndefined()
    expect(store.has(lockPath(account.accountId))).toBe(false)
  })

  it("returns locked without syncing when another client holds the lease", async () => {
    const store = new InMemoryObjectStore()
    const { device, account } = await fixture()
    const path = lockPath(account.accountId)
    await acquireLock({
      client: store,
      lockPath: path,
      masterKey: account.masterKey,
      privateKey: device.signPrivateKey,
      clientId: "other-client",
      deviceId: account.deviceId,
      leaseMs: 30_000,
      roster: account.roster,
    })
    const highlights = createDataset("highlights")
    highlights.records.set("h:1", {
      recordId: "h:1",
      updatedAt: "2026-01-01T00:00:00.000Z",
      recordHash: "",
      data: { v: 1 },
    })

    const result = await runAccountSync({
      store,
      account,
      device,
      clientId: "client-1",
      datasets: [highlights.dataset],
      stateStore: createStateStore(),
      lock: {},
      gc: false,
    })

    expect(result.status).toBe("locked")
    expect(result.applied).toBe(0)
    expect(result.streams).toEqual([])
    // The other client's lock must not be released.
    expect(store.has(path)).toBe(true)
  })

  it("reports partial and keeps applying the healthy streams", async () => {
    const store = new InMemoryObjectStore()
    const { device, account } = await fixture()
    const highlights = createDataset("highlights")
    highlights.records.set("h:1", {
      recordId: "h:1",
      updatedAt: "2026-01-01T00:00:00.000Z",
      recordHash: "",
      data: { v: 1 },
    })

    const result = await runAccountSync({
      store,
      account,
      device,
      clientId: "client-1",
      datasets: [highlights.dataset, failingDataset("inbox")],
      stateStore: createStateStore(),
      lock: {},
      gc: false,
    })

    expect(result.status).toBe("partial")
    expect(result.streams.find((s) => s.streamId === "inbox")?.error).toBe(
      "collect boom",
    )
    expect(result.uploadedStreamIds).toEqual(["highlights"])
  })

  it("only runs GC for streams that uploaded", async () => {
    const store = new InMemoryObjectStore()
    const { device, account } = await fixture()
    const stateStore = createStateStore()
    const highlights = createDataset("highlights")
    const inbox = createDataset("inbox")
    highlights.records.set("h:1", {
      recordId: "h:1",
      updatedAt: "2026-01-01T00:00:00.000Z",
      recordHash: "",
      data: { v: 1 },
    })

    // First sync creates a manifest for both streams.
    await runAccountSync({
      store,
      account,
      device,
      clientId: "client-1",
      datasets: [highlights.dataset, inbox.dataset],
      stateStore,
      lock: false,
      gc: false,
    })

    gcStreamMock.mockClear()
    highlights.records.set("h:2", {
      recordId: "h:2",
      updatedAt: "2026-01-01T00:01:00.000Z",
      recordHash: "",
      data: { v: 2 },
    })

    // Second sync: only highlights is dirty, inbox has nothing to upload.
    const result = await runAccountSync({
      store,
      account,
      device,
      clientId: "client-1",
      datasets: [highlights.dataset, inbox.dataset],
      stateStore,
      lock: false,
      gc: { keepManifests: 5 },
    })

    expect(result.status).toBe("synced")
    expect(result.uploadedStreamIds).toEqual(["highlights"])
    expect(gcStreamMock).toHaveBeenCalledTimes(1)
    expect(gcStreamMock).toHaveBeenCalledWith(
      expect.objectContaining({
        streamId: "highlights",
        keepManifests: 5,
      }),
    )
  })

  it("returns error and still releases the lock when GC throws", async () => {
    gcStreamMock.mockClear()
    gcStreamMock.mockRejectedValueOnce(new Error("gc boom"))
    const store = new InMemoryObjectStore()
    const { device, account } = await fixture()
    const highlights = createDataset("highlights")
    highlights.records.set("h:1", {
      recordId: "h:1",
      updatedAt: "2026-01-01T00:00:00.000Z",
      recordHash: "",
      data: { v: 1 },
    })

    const result = await runAccountSync({
      store,
      account,
      device,
      clientId: "client-1",
      datasets: [highlights.dataset],
      stateStore: createStateStore(),
      lock: {},
      gc: {},
    })

    expect(result.status).toBe("error")
    expect(result.error).toBe("gc boom")
    expect(store.has(lockPath(account.accountId))).toBe(false)
  })

  it("flags lockLost when lease renewal loses the lock", async () => {
    const store = new InMemoryObjectStore()
    const { device, account } = await fixture()
    const path = lockPath(account.accountId)
    let renewFn: (() => void) | null = null
    let releaseCollect!: () => void
    const gate = new Promise<void>((resolve) => {
      releaseCollect = resolve
    })
    const dataset: StreamDataset = {
      streamId: "highlights",
      async collect() {
        await gate
        return []
      },
      async apply() {},
      async remove() {},
    }

    const promise = runAccountSync({
      store,
      account,
      device,
      clientId: "client-1",
      datasets: [dataset],
      stateStore: createStateStore(),
      lock: {},
      gc: false,
      timers: {
        setInterval: (fn) => {
          renewFn = fn
          return 1
        },
        clearInterval: () => {},
      },
    } satisfies RunAccountSyncOptions)

    await vi.waitFor(() => expect(renewFn).not.toBeNull())
    await store.deleteObject(path)
    renewFn!()
    await new Promise((resolve) => setTimeout(resolve, 0))

    releaseCollect()
    const result = await promise

    expect(result.status).toBe("synced")
    expect(result.lockLost).toBe(true)
  })

  it("skips the lock entirely when lock is false", async () => {
    const store = new InMemoryObjectStore()
    const { device, account } = await fixture()
    const highlights = createDataset("highlights")

    const result = await runAccountSync({
      store,
      account,
      device,
      clientId: "client-1",
      datasets: [highlights.dataset],
      stateStore: createStateStore(),
      lock: false,
      gc: false,
    })

    expect(result.status).toBe("synced")
    expect(store.has(lockPath(account.accountId))).toBe(false)
  })

  it("stamps startedAt/finishedAt from the injected clock", async () => {
    const store = new InMemoryObjectStore()
    const { device, account } = await fixture()
    let calls = 0
    const stamps = [
      "2026-01-01T00:00:00.000Z",
      "2026-01-01T00:00:01.000Z",
    ]

    const result = await runAccountSync({
      store,
      account,
      device,
      clientId: "client-1",
      datasets: [createDataset("highlights").dataset],
      stateStore: createStateStore(),
      lock: false,
      gc: false,
      now: () => stamps[calls++] ?? stamps[stamps.length - 1],
    })

    expect(result.startedAt).toBe(stamps[0])
    expect(result.finishedAt).toBe(stamps[1])
  })
})
