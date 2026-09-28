import { describe, expect, it } from "vitest"
import { deriveMasterKeyFromDataKey, deriveStreamMasterKey, generateAccountId } from "../src/dataKey"
import {
  advanceHighWater,
  assertNotRollback,
  isRollback,
} from "../src/highWater"

describe("data key model", () => {
  it("generates random, prefixed account ids", () => {
    const a = generateAccountId()
    const b = generateAccountId()
    expect(a.startsWith("acct_")).toBe(true)
    expect(a).not.toBe(b)
  })

  it("derives a stable master key from D", async () => {
    const d = new Uint8Array(32).fill(5)
    const m1 = await deriveMasterKeyFromDataKey(d)
    const m2 = await deriveMasterKeyFromDataKey(d)
    expect(Array.from(m1)).toEqual(Array.from(m2))
    expect(m1).toHaveLength(32)
  })

  it("derives per-stream master keys that differ by stream", async () => {
    const d = new Uint8Array(32).fill(5)
    const master = await deriveMasterKeyFromDataKey(d)
    const inbox = await deriveStreamMasterKey(master, "inbox")
    const other = await deriveStreamMasterKey(master, "other")
    expect(Array.from(inbox)).not.toEqual(Array.from(other))
  })
})

describe("anti-rollback high-water marks", () => {
  it("detects a rollback to an older version", () => {
    expect(isRollback(5, 4)).toBe(true)
    expect(isRollback(5, 5)).toBe(false)
    expect(isRollback(5, 6)).toBe(false)
    expect(isRollback(null, 1)).toBe(false)
  })

  it("advances the high-water mark monotonically", () => {
    expect(advanceHighWater(null, 3)).toBe(3)
    expect(advanceHighWater(3, 2)).toBe(3)
    expect(advanceHighWater(3, 7)).toBe(7)
  })

  it("throws only on a real rollback", () => {
    expect(() => assertNotRollback(4, 4)).not.toThrow()
    expect(() => assertNotRollback(4, 3)).toThrow(/rollback/i)
  })
})
