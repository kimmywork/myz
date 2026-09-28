import { ed25519 } from "@noble/curves/ed25519"
import { afterEach, describe, expect, it, vi } from "vitest"
import { acquireLock, releaseLock, renewLock } from "../src/lock"
import { InMemoryObjectStore } from "./helpers/inMemoryStore"

const LOCK_PATH = "account/lock/lease.bin"
const masterKey = new Uint8Array(32).fill(7)
const privateKey = ed25519.utils.randomPrivateKey()
const publicKey = ed25519.getPublicKey(privateKey)

function lockOptions(
  store: InMemoryObjectStore,
  clientId: string,
  leaseMs?: number,
) {
  return {
    client: store,
    lockPath: LOCK_PATH,
    masterKey,
    privateKey,
    publicKey,
    clientId,
    leaseMs,
  }
}

describe("sync lock ownership", () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it("acquires and owner-releases its own lock", async () => {
    const store = new InMemoryObjectStore()
    const result = await acquireLock(lockOptions(store, "A", 30_000))
    expect(result.acquired).toBe(true)
    expect(store.has(LOCK_PATH)).toBe(true)

    await releaseLock({
      client: store,
      lockPath: LOCK_PATH,
      masterKey,
      publicKey,
      clientId: "A",
    })
    expect(store.has(LOCK_PATH)).toBe(false)
  })

  it("refuses to acquire a lock still held by another client", async () => {
    const store = new InMemoryObjectStore()
    expect((await acquireLock(lockOptions(store, "A", 30_000))).acquired).toBe(
      true,
    )
    expect((await acquireLock(lockOptions(store, "B", 30_000))).acquired).toBe(
      false,
    )
  })

  it("does not let an expired owner release another client's lock", async () => {
    vi.useFakeTimers()
    const store = new InMemoryObjectStore()

    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"))
    expect((await acquireLock(lockOptions(store, "A", 1000))).acquired).toBe(
      true,
    )

    vi.setSystemTime(new Date("2026-01-01T00:00:02.000Z"))
    expect((await acquireLock(lockOptions(store, "B", 30_000))).acquired).toBe(
      true,
    )

    await releaseLock({
      client: store,
      lockPath: LOCK_PATH,
      masterKey,
      publicKey,
      clientId: "A",
    })

    expect(store.has(LOCK_PATH)).toBe(true)
    expect((await renewLock(lockOptions(store, "B", 30_000))).acquired).toBe(
      true,
    )
  })

  it("renewal extends the lease so a long sync is not stolen", async () => {
    vi.useFakeTimers()
    const store = new InMemoryObjectStore()
    const t0 = new Date("2026-01-01T00:00:00.000Z")

    vi.setSystemTime(t0)
    expect((await acquireLock(lockOptions(store, "A", 1000))).acquired).toBe(
      true,
    )

    vi.setSystemTime(new Date(t0.getTime() + 900))
    const renewed = await renewLock(lockOptions(store, "A", 1000))
    expect(renewed.acquired).toBe(true)

    vi.setSystemTime(new Date(t0.getTime() + 1500))
    expect((await acquireLock(lockOptions(store, "B", 1000))).acquired).toBe(
      false,
    )

    vi.setSystemTime(new Date(t0.getTime() + 2000))
    expect((await acquireLock(lockOptions(store, "B", 1000))).acquired).toBe(
      true,
    )
  })

  it("rejects renewal by a non-owner", async () => {
    vi.useFakeTimers()
    const store = new InMemoryObjectStore()
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"))
    await acquireLock(lockOptions(store, "A", 30_000))

    const result = await renewLock(lockOptions(store, "C", 30_000))
    expect(result.acquired).toBe(false)
    expect((await renewLock(lockOptions(store, "A", 30_000))).acquired).toBe(
      true,
    )
  })
})
