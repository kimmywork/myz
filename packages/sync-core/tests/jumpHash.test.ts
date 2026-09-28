import { describe, expect, it } from "vitest"
import { fnv1a32, jumpConsistentHash } from "../src/jumpHash"

describe("jump consistent hash", () => {
  it("hashes deterministically into range", () => {
    for (const key of ["h:1", "status:h:1", "rel:a:b", "mark:h:9"]) {
      const bucket = jumpConsistentHash(key, 64)
      expect(bucket).toBeGreaterThanOrEqual(0)
      expect(bucket).toBeLessThan(64)
      expect(jumpConsistentHash(key, 64)).toBe(bucket)
    }
    expect(() => jumpConsistentHash("x", 0)).toThrow()
  })

  it("only remaps a small fraction of keys when growing by one bucket", () => {
    const keys = Array.from({ length: 2000 }, (_, index) => `h:${index}`)
    let moved = 0
    for (const key of keys) {
      if (jumpConsistentHash(key, 64) !== jumpConsistentHash(key, 65)) {
        moved += 1
      }
    }
    expect(moved / keys.length).toBeLessThan(0.1)
    expect(moved).toBeGreaterThan(0)
  })

  it("spreads keys roughly uniformly across buckets", () => {
    const counts = new Array(16).fill(0)
    for (let index = 0; index < 4000; index += 1) {
      counts[jumpConsistentHash(`h:${index}`, 16)] += 1
    }
    const expected = 4000 / 16
    for (const count of counts) {
      expect(Math.abs(count - expected) / expected).toBeLessThan(0.35)
    }
  })

  it("exposes a stable fnv1a seed", () => {
    expect(fnv1a32("myz")).toBe(fnv1a32("myz"))
    expect(fnv1a32("myz")).not.toBe(fnv1a32("myz!"))
  })
})
