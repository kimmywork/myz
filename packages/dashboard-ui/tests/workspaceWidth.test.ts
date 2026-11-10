import { describe, expect, it } from "vitest"
import {
  NAV_WIDTH_DEFAULT,
  NAV_WIDTH_MAX,
  NAV_WIDTH_MIN,
  clampWidth,
  readStoredWidth,
  stepWidth,
  toggleCollapsed,
  writeStoredWidth,
} from "../src/workspace/width"

function memoryStorage(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial))
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => {
      map.set(key, value)
    },
    dump: () => Object.fromEntries(map),
  }
}

describe("clampWidth", () => {
  it("keeps values inside the draggable range", () => {
    expect(clampWidth(150, 200, 320)).toBe(200)
    expect(clampWidth(400, 200, 320)).toBe(320)
    expect(clampWidth(261.6, 200, 320)).toBe(262)
  })

  it("falls back to the minimum for non-finite values", () => {
    expect(clampWidth(Number.NaN, 200, 320)).toBe(200)
  })
})

describe("stepWidth", () => {
  it("steps by 8px and clamps at the bounds", () => {
    expect(stepWidth(240, 8, 200, 320)).toBe(248)
    expect(stepWidth(240, -8, 200, 320)).toBe(232)
    expect(stepWidth(200, -8, 200, 320)).toBe(200)
    expect(stepWidth(318, 8, 200, 320)).toBe(320)
  })
})

describe("readStoredWidth", () => {
  it("returns the default when nothing is stored", () => {
    expect(
      readStoredWidth(memoryStorage(), "k", 240, 200, 320),
    ).toBe(240)
  })

  it("preserves zero because it means collapsed", () => {
    expect(
      readStoredWidth(memoryStorage({ k: "0" }), "k", 240, 200, 320),
    ).toBe(0)
  })

  it("clamps out-of-range values and ignores malformed ones", () => {
    expect(
      readStoredWidth(memoryStorage({ k: "900" }), "k", 240, 200, 320),
    ).toBe(320)
    expect(
      readStoredWidth(memoryStorage({ k: "wide" }), "k", 240, 200, 320),
    ).toBe(240)
  })

  it("survives missing or throwing storage", () => {
    expect(readStoredWidth(null, "k", 240, 200, 320)).toBe(240)
    const throwing = {
      getItem: () => {
        throw new Error("denied")
      },
      setItem: () => {
        throw new Error("denied")
      },
    }
    expect(readStoredWidth(throwing, "k", 240, 200, 320)).toBe(240)
    expect(() => writeStoredWidth(throwing, "k", 240)).not.toThrow()
  })
})

describe("writeStoredWidth / toggleCollapsed", () => {
  it("rounds and stores the width", () => {
    const storage = memoryStorage()
    writeStoredWidth(storage, "k", 247.8)
    expect(storage.dump()).toEqual({ k: "248" })
  })

  it("collapses to 0 and restores the default", () => {
    expect(toggleCollapsed(240, NAV_WIDTH_DEFAULT)).toBe(0)
    expect(toggleCollapsed(0, NAV_WIDTH_DEFAULT)).toBe(NAV_WIDTH_DEFAULT)
    expect(NAV_WIDTH_MIN).toBe(200)
    expect(NAV_WIDTH_MAX).toBe(320)
  })
})
