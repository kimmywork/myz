import { describe, expect, it } from "vitest"
import { mapConcurrent } from "../src/concurrency"

describe("mapConcurrent", () => {
  it("preserves order and maps every item", async () => {
    const results = await mapConcurrent([1, 2, 3, 4, 5], 2, async (value) => {
      await new Promise((resolve) => setTimeout(resolve, 1))
      return value * 10
    })
    expect(results).toEqual([10, 20, 30, 40, 50])
  })

  it("never exceeds the concurrency limit", async () => {
    let active = 0
    let peak = 0
    await mapConcurrent(Array.from({ length: 20 }, (_, i) => i), 4, async () => {
      active += 1
      peak = Math.max(peak, active)
      await new Promise((resolve) => setTimeout(resolve, 1))
      active -= 1
      return null
    })
    expect(peak).toBeLessThanOrEqual(4)
  })

  it("rejects on an invalid limit", async () => {
    await expect(mapConcurrent([1], 0, async (v) => v)).rejects.toThrow()
  })
})
