import { describe, expect, it } from "vitest"
import { deriveLocalUnlockKey, LOCAL_KDF_ITERATIONS } from "../src/kdf"

describe("local unlock KDF", () => {
  it("rejects iteration counts below the minimum", async () => {
    await expect(
      deriveLocalUnlockKey("pass", new Uint8Array(16), 100_000),
    ).rejects.toThrow(/iterations/i)
  })

  it("derives a 32-byte key at the minimum iteration count", async () => {
    const key = await deriveLocalUnlockKey(
      "correct horse battery staple",
      new Uint8Array(16).fill(1),
      LOCAL_KDF_ITERATIONS,
    )
    expect(key).toHaveLength(32)
  })
})
