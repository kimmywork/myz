import { describe, expect, it } from "vitest"
import {
  DEFAULT_S3_SETTINGS,
  normalizeSyncSettings,
  SyncSettingsSchema,
} from "../src/settings"

const base = { enabled: true, s3: { ...DEFAULT_S3_SETTINGS } }

describe("sync settings tuning", () => {
  it("keeps tuning fields when present", () => {
    const settings = normalizeSyncSettings({
      ...base,
      keepManifests: 12,
      lockLeaseMs: 45_000,
    })
    expect(settings.keepManifests).toBe(12)
    expect(settings.lockLeaseMs).toBe(45_000)
  })

  it("omits tuning fields when absent", () => {
    const settings = normalizeSyncSettings(base)
    expect(settings.keepManifests).toBeUndefined()
    expect(settings.lockLeaseMs).toBeUndefined()
  })

  it("clamps corrupt values into the accepted range", () => {
    const settings = normalizeSyncSettings({
      ...base,
      keepManifests: 0,
      lockLeaseMs: 1,
    })
    expect(settings.keepManifests).toBe(1)
    expect(settings.lockLeaseMs).toBe(10_000)
  })

  it("rejects out-of-range values in the schema", () => {
    expect(
      SyncSettingsSchema.safeParse({ ...base, keepManifests: 0 }).success,
    ).toBe(false)
    expect(
      SyncSettingsSchema.safeParse({ ...base, lockLeaseMs: 1 }).success,
    ).toBe(false)
    expect(
      SyncSettingsSchema.safeParse({ ...base, keepManifests: 30 }).success,
    ).toBe(true)
  })
})
