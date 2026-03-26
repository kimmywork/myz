import { test } from "node:test"
import assert from "node:assert/strict"
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createRuntimeConfig } from "./helpers/runtimeConfig"
import {
  applyUpgrade,
  checkForUpgrade,
  compareVersions,
  readUpgradeState,
  syncUpgradeState,
} from "../src/upgrade"

test("compareVersions orders stable and prerelease semver correctly", () => {
  assert.ok(compareVersions("1.2.4", "1.2.3") > 0)
  assert.ok(compareVersions("1.2.3", "1.2.3-beta.1") > 0)
  assert.ok(compareVersions("1.2.3-beta.2", "1.2.3-beta.1") > 0)
  assert.equal(compareVersions("1.2.3", "1.2.3"), 0)
})

test("syncUpgradeState detects launcher mode from active launch.json", () => {
  const root = mkdtempSync(join(tmpdir(), "myz-bot-upgrade-"))
  const config = createRuntimeConfig(root)
  mkdirSync(config.systemDir, { recursive: true })
  writeFileSync(
    join(config.systemDir, "launch.json"),
    JSON.stringify(
      {
        status: "running",
        supervisorPid: process.pid,
      },
      null,
      2,
    ),
  )

  const state = syncUpgradeState(config)

  assert.equal(state.currentMode, "launcher")
  assert.equal(readUpgradeState(config.systemDir)?.currentMode, "launcher")
})

test("checkForUpgrade records available version from npm registry payload", async () => {
  const root = mkdtempSync(join(tmpdir(), "myz-bot-upgrade-"))
  const config = createRuntimeConfig(root)

  const result = await checkForUpgrade({
    config,
    fetchImpl: async () =>
      ({
        ok: true,
        status: 200,
        statusText: "OK",
        json: async () => ({
          "dist-tags": {
            latest: "9.9.9",
          },
          versions: {
            "0.1.0": {},
            "9.9.9": {},
          },
        }),
      }) as Response,
  })

  assert.equal(result.updateAvailable, true)
  assert.equal(result.targetVersion, "9.9.9")
  assert.equal(result.state.status, "available")
  assert.equal(result.state.lastKnownVersion, "9.9.9")
})

test("applyUpgrade rejects non-launcher mode", async () => {
  const root = mkdtempSync(join(tmpdir(), "myz-bot-upgrade-"))
  const config = createRuntimeConfig(root)

  const result = await applyUpgrade({
    config,
    requestedBy: "tester",
    scheduleExit: false,
  })

  assert.equal(result.ok, false)
  assert.match(result.message, /launch -w/)
})

test("applyUpgrade writes restart request and pending version in launcher mode", async () => {
  const root = mkdtempSync(join(tmpdir(), "myz-bot-upgrade-"))
  const config = createRuntimeConfig(root)
  mkdirSync(config.systemDir, { recursive: true })
  writeFileSync(
    join(config.systemDir, "launch.json"),
    JSON.stringify(
      {
        status: "running",
        supervisorPid: process.pid,
      },
      null,
      2,
    ),
  )

  const result = await applyUpgrade({
    config,
    requestedBy: "tester",
    scheduleExit: false,
    fetchImpl: async () =>
      ({
        ok: true,
        status: 200,
        statusText: "OK",
        json: async () => ({
          "dist-tags": {
            latest: "9.9.9",
          },
          versions: {
            "0.1.0": {},
            "9.9.9": {},
          },
        }),
      }) as Response,
  })

  assert.equal(result.ok, true)
  assert.equal(result.state.pendingVersion, "9.9.9")
  assert.equal(result.state.status, "pending_apply")

  const restartRequest = JSON.parse(
    readFileSync(join(config.systemDir, "restart-request.json"), "utf-8"),
  ) as {
    reason: string
    requestedBy: string
    targetVersion: string
    packageName: string
  }

  assert.equal(restartRequest.reason, "upgrade_apply")
  assert.equal(restartRequest.requestedBy, "tester")
  assert.equal(restartRequest.targetVersion, "9.9.9")
  assert.equal(restartRequest.packageName, "myz-bot")
})
