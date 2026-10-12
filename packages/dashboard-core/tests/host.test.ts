import { describe, expect, it } from "vitest"
import {
  DASHBOARD_HOST_CAPABILITY_PRESETS,
  DASHBOARD_HOST_FEATURE_PRESETS,
  DASHBOARD_HOST_KINDS,
} from "../src/host"

describe("dashboard host presets", () => {
  it("defines a capability and feature preset for every host kind", () => {
    for (const kind of DASHBOARD_HOST_KINDS) {
      const capabilities = DASHBOARD_HOST_CAPABILITY_PRESETS[kind]
      const features = DASHBOARD_HOST_FEATURE_PRESETS[kind]
      expect(capabilities).toBeDefined()
      expect(features).toBeDefined()
      expect(Object.values(capabilities).every((v) => typeof v === "boolean")).toBe(
        true,
      )
      expect(Object.values(features).every((v) => typeof v === "boolean")).toBe(
        true,
      )
    }
  })

  it("gives desktop local file storage and window controls", () => {
    const desktop = DASHBOARD_HOST_CAPABILITY_PRESETS.desktop
    expect(desktop.localFileStorage).toBe(true)
    expect(desktop.windowControls).toBe(true)
    expect(desktop.backgroundMessaging).toBe(false)
  })

  it("gives the extension background messaging and sync", () => {
    const extension = DASHBOARD_HOST_CAPABILITY_PRESETS.extension
    expect(extension.backgroundMessaging).toBe(true)
    expect(extension.sync).toBe(true)
    expect(extension.localFileStorage).toBe(false)
  })

  it("marks the mobile extension as touch optimized", () => {
    expect(
      DASHBOARD_HOST_CAPABILITY_PRESETS["mobile-extension"].touchOptimized,
    ).toBe(true)
    expect(
      DASHBOARD_HOST_FEATURE_PRESETS["mobile-extension"].localChatRuntime,
    ).toBe(false)
  })
})
