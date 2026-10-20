import { afterEach, describe, expect, it, vi } from "vitest"
import { createSyncAccount, openSyncAccount } from "../src/account"
import type { SyncObjectStore } from "../src/adapters"
import { generateDeviceKeyPair } from "../src/deviceKeys"
import { acquireLock, releaseLock, renewLock } from "../src/lock"
import { addDeviceToRoster } from "../src/roster"
import { InMemoryObjectStore } from "./helpers/inMemoryStore"

const LOCK_PATH = "account/lock/lease.bin"
const masterKey = new Uint8Array(32).fill(7)

/** One device in a fresh account, with a roster it can verify against. */
async function singleDevice() {
  const device = generateDeviceKeyPair()
  const account = await createSyncAccount({
    device,
    accountId: "acct_lock",
    dataKey: masterKey,
  })
  return { device, account }
}

/** Lock options for one client of the given device/account. */
function lockOptions(
  store: InMemoryObjectStore,
  account: Awaited<ReturnType<typeof singleDevice>>["account"],
  device: Awaited<ReturnType<typeof singleDevice>>["device"],
  clientId: string,
  leaseMs?: number,
) {
  return {
    client: store,
    lockPath: LOCK_PATH,
    masterKey,
    privateKey: device.signPrivateKey,
    clientId,
    deviceId: account.deviceId,
    leaseMs,
    roster: account.roster,
  }
}

describe("sync lock ownership", () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it("acquires and owner-releases its own lock", async () => {
    const store = new InMemoryObjectStore()
    const { device, account } = await singleDevice()
    const result = await acquireLock(
      lockOptions(store, account, device, "A", 30_000),
    )
    expect(result.acquired).toBe(true)
    expect(store.has(LOCK_PATH)).toBe(true)

    await releaseLock({
      client: store,
      lockPath: LOCK_PATH,
      masterKey,
      clientId: "A",
      roster: account.roster,
    })
    expect(store.has(LOCK_PATH)).toBe(false)
  })

  it("refuses to acquire a lock still held by another client (same device)", async () => {
    const store = new InMemoryObjectStore()
    const { device, account } = await singleDevice()
    expect(
      (
        await acquireLock(lockOptions(store, account, device, "A", 30_000))
      ).acquired,
    ).toBe(true)
    expect(
      (
        await acquireLock(lockOptions(store, account, device, "B", 30_000))
      ).acquired,
    ).toBe(false)
  })

  it("refuses to acquire a lock held by another device in the same account", async () => {
    const store = new InMemoryObjectStore()
    const hostDevice = generateDeviceKeyPair()
    const guestDevice = generateDeviceKeyPair()
    const hostAccount = await createSyncAccount({
      device: hostDevice,
      accountId: "acct_lock",
      dataKey: masterKey,
    })
    const { roster } = await addDeviceToRoster({
      roster: hostAccount.roster,
      approver: hostDevice,
      approverDeviceId: hostAccount.deviceId,
      newDevice: guestDevice,
      dataKey: masterKey,
    })
    const guestAccount = await openSyncAccount({
      device: guestDevice,
      roster,
    })

    const hostOpts = {
      client: store,
      lockPath: LOCK_PATH,
      masterKey,
      privateKey: hostDevice.signPrivateKey,
      clientId: "host",
      deviceId: hostAccount.deviceId,
      leaseMs: 30_000,
      roster,
    }
    const guestOpts = {
      client: store,
      lockPath: LOCK_PATH,
      masterKey,
      privateKey: guestDevice.signPrivateKey,
      clientId: "guest",
      deviceId: guestAccount.deviceId,
      leaseMs: 30_000,
      roster,
    }

    expect((await acquireLock(hostOpts)).acquired).toBe(true)
    // Cross-device: guest must NOT steal host's live lock.
    expect((await acquireLock(guestOpts)).acquired).toBe(false)
  })

  it("treats a conditional-write conflict as a lost race, not an error", async () => {
    const store = new InMemoryObjectStore()
    const { device, account } = await singleDevice()
    const racing: SyncObjectStore = {
      listObjects: (prefix) => store.listObjects(prefix),
      getObject: (path) => store.getObject(path),
      putObject: async () => {
        throw new Error("S3 put failed: 412")
      },
      deleteObject: (path, options) => store.deleteObject(path, options),
    }

    const result = await acquireLock({
      ...lockOptions(store, account, device, "A", 30_000),
      client: racing,
    })
    expect(result.acquired).toBe(false)
  })

  it("propagates non-conflict acquire errors", async () => {
    const store = new InMemoryObjectStore()
    const { device, account } = await singleDevice()
    const failing: SyncObjectStore = {
      listObjects: (prefix) => store.listObjects(prefix),
      getObject: (path) => store.getObject(path),
      putObject: async () => {
        throw new Error("S3 put failed: 500")
      },
      deleteObject: (path, options) => store.deleteObject(path, options),
    }

    await expect(
      acquireLock({
        ...lockOptions(store, account, device, "A", 30_000),
        client: failing,
      }),
    ).rejects.toThrow("500")
  })

  it("does not let an expired owner release another client's lock", async () => {
    vi.useFakeTimers()
    const store = new InMemoryObjectStore()
    const { device, account } = await singleDevice()

    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"))
    expect(
      (
        await acquireLock(lockOptions(store, account, device, "A", 1000))
      ).acquired,
    ).toBe(true)

    vi.setSystemTime(new Date("2026-01-01T00:00:02.000Z"))
    expect(
      (
        await acquireLock(lockOptions(store, account, device, "B", 30_000))
      ).acquired,
    ).toBe(true)

    await releaseLock({
      client: store,
      lockPath: LOCK_PATH,
      masterKey,
      clientId: "A",
      roster: account.roster,
    })

    expect(store.has(LOCK_PATH)).toBe(true)
    expect(
      (
        await renewLock(lockOptions(store, account, device, "B", 30_000))
      ).acquired,
    ).toBe(true)
  })

  it("renewal extends the lease so a long sync is not stolen", async () => {
    vi.useFakeTimers()
    const store = new InMemoryObjectStore()
    const { device, account } = await singleDevice()
    const t0 = new Date("2026-01-01T00:00:00.000Z")

    vi.setSystemTime(t0)
    expect(
      (
        await acquireLock(lockOptions(store, account, device, "A", 1000))
      ).acquired,
    ).toBe(true)

    vi.setSystemTime(new Date(t0.getTime() + 900))
    const renewed = await renewLock(lockOptions(store, account, device, "A", 1000))
    expect(renewed.acquired).toBe(true)

    vi.setSystemTime(new Date(t0.getTime() + 1500))
    expect(
      (
        await acquireLock(lockOptions(store, account, device, "B", 1000))
      ).acquired,
    ).toBe(false)

    vi.setSystemTime(new Date(t0.getTime() + 2000))
    expect(
      (
        await acquireLock(lockOptions(store, account, device, "B", 1000))
      ).acquired,
    ).toBe(true)
  })

  it("rejects renewal by a non-owner", async () => {
    vi.useFakeTimers()
    const store = new InMemoryObjectStore()
    const { device, account } = await singleDevice()
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"))
    await acquireLock(lockOptions(store, account, device, "A", 30_000))

    const result = await renewLock(lockOptions(store, account, device, "C", 30_000))
    expect(result.acquired).toBe(false)
    expect(
      (
        await renewLock(lockOptions(store, account, device, "A", 30_000))
      ).acquired,
    ).toBe(true)
  })
})
