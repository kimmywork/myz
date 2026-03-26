import { test } from "node:test"
import assert from "node:assert/strict"
import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { loadConfig } from "../src/config"

test("loadConfig parses minimal bot.yml", () => {
  const workspaceDir = mkdtempSync(join(tmpdir(), "myz-bot-workspace-"))
  const runtimeDir = mkdtempSync(join(tmpdir(), "myz-bot-runtime-"))
  const path = join(runtimeDir, "bot.yml")
  writeFileSync(
    path,
    [
      "telegram:",
      "  username: testbot",
      "  token: testtoken",
      "ai:",
      "  provider: openai_compatible",
      "  model: gpt-test",
    ].join("\n"),
  )

  const config = loadConfig({ workspaceRoot: workspaceDir, runtimeRoot: runtimeDir })
  assert.equal(config.telegram.username, "testbot")
  assert.equal(config.ai.model, "gpt-test")
  assert.equal(config.workspaceRoot, realpathSync(workspaceDir))
  assert.equal(config.runtimeRoot, runtimeDir)
  assert.equal(config.skillSources[0]?.id, "builtin")
  assert.equal(config.skillSources[1]?.id, "project")
  assert.equal(config.telegram.timeoutSeconds, 25)
  assert.equal(config.telegram.retry.retries, 2)
  assert.equal(config.network.requestTimeoutMs, 180000)
  assert.equal(config.ai.retry.retries, 2)
  assert.equal(config.scheduler.enabled, true)
  assert.equal(config.scheduler.pollIntervalMs, 15000)
  assert.equal(config.upgrade.enabled, true)
  assert.equal(config.debug, false)
  assert.equal(config.upgrade.packageName, "myz-bot")
  assert.equal(config.upgrade.channel, "latest")
  assert.equal(config.upgrade.checkIntervalMs, 21600000)
  assert.equal(config.upgrade.strategy, "notify")
  assert.equal(config.upgrade.applyMode, "manual")
  assert.equal(config.upgrade.allowPrerelease, false)
  assert.equal(config.soul.autoDraft, true)
  assert.equal(config.soul.autoApply, true)
  assert.equal(config.soul.autoDraftMessageInterval, 40)
  assert.equal(config.soul.autoDraftTimeIntervalMs, 14400000)
  assert.equal(config.soul.growthFeedbackBatchMessageInterval, 20)
  assert.equal(config.soul.growthFeedbackTimeIntervalMs, 3600000)
  assert.equal(config.soul.relationshipReflectionMessageInterval, 20)
  assert.equal(config.soul.relationshipReflectionTimeIntervalMs, 3600000)
})

test("loadConfig parses permissions and skill policies", () => {
  const workspaceDir = mkdtempSync(join(tmpdir(), "myz-bot-workspace-"))
  const runtimeDir = mkdtempSync(join(tmpdir(), "myz-bot-runtime-"))
  const path = join(runtimeDir, "bot.yml")
  writeFileSync(
    path,
    [
      "telegram:",
      "  username: testbot",
      "  token: testtoken",
      "  timeoutSeconds: 40",
      "  allowedUsers:",
      "    - alice",
      "  allowedChats:",
      "    - 42",
      "  adminUsers:",
      "    - admin",
      "  retry:",
      "    retries: 3",
      "network:",
      "  requestTimeoutMs: 90000",
      "  connectTimeoutMs: 5000",
      "  keepAliveTimeoutMs: 2000",
      "  keepAliveTimeoutThresholdMs: 1000",
      "  proxyUrl: http://127.0.0.1:7890",
      "ai:",
      "  provider: openai_compatible",
      "  model: gpt-test",
      "  systemPromptInUserMessage: true",
      "  retry:",
      "    retries: 4",
      "skills:",
      "  allowlist:",
      "    - builtin/planning",
      "  denylist:",
      "    - builtin/problem-solving",
      "debug: true",
      "tools:",
      "  allowlist:",
      "    - Read",
      "scheduler:",
      "  enabled: true",
      "  pollIntervalMs: 5000",
      "  maxBatchSize: 5",
      "  failureRetryBaseDelayMs: 10000",
      "upgrade:",
      "  enabled: true",
      "  packageName: custom-bot",
      "  channel: 0.2.0",
      "  checkIntervalMs: 120000",
      "  strategy: prepare-and-restart",
      "  applyMode: launcher-only",
      "  allowPrerelease: true",
      "soul:",
      "  autoDraft: true",
      "  autoApply: false",
      "  autoDraftTimeIntervalMs: 7200000",
      "  growthFeedbackBatchMessageInterval: 6",
      "  growthFeedbackTimeIntervalMs: 600000",
      "  relationshipReflectionMessageInterval: 5",
      "  relationshipReflectionTimeIntervalMs: 900000",
    ].join("\n"),
  )

  const config = loadConfig({ workspaceRoot: workspaceDir, runtimeRoot: runtimeDir })
  assert.deepEqual(config.telegram.allowedUsers, ["alice"])
  assert.deepEqual(config.telegram.allowedChats, [42])
  assert.deepEqual(config.telegram.adminUsers, ["admin"])
  assert.equal(config.telegram.timeoutSeconds, 40)
  assert.equal(config.telegram.retry.retries, 3)
  assert.equal(config.network.requestTimeoutMs, 90000)
  assert.equal(config.network.connectTimeoutMs, 5000)
  assert.equal(config.network.proxyUrl, "http://127.0.0.1:7890")
  assert.deepEqual(config.skillAllowlist, ["builtin/planning"])
  assert.deepEqual(config.skillDenylist, ["builtin/problem-solving"])
  assert.deepEqual(config.toolAllowlist, ["read"])
  assert.equal(config.debug, true)
  assert.equal(config.ai.systemPromptInUserMessage, true)
  assert.equal(config.ai.retry.retries, 4)
  assert.equal(config.scheduler.pollIntervalMs, 5000)
  assert.equal(config.scheduler.maxBatchSize, 5)
  assert.equal(config.upgrade.packageName, "custom-bot")
  assert.equal(config.upgrade.channel, "0.2.0")
  assert.equal(config.upgrade.checkIntervalMs, 120000)
  assert.equal(config.upgrade.strategy, "prepare-and-restart")
  assert.equal(config.upgrade.applyMode, "launcher-only")
  assert.equal(config.upgrade.allowPrerelease, true)
  assert.equal(config.soul.autoDraft, true)
  assert.equal(config.soul.autoApply, false)
  assert.equal(config.soul.autoDraftTimeIntervalMs, 7200000)
  assert.equal(config.soul.growthFeedbackBatchMessageInterval, 6)
  assert.equal(config.soul.growthFeedbackTimeIntervalMs, 600000)
  assert.equal(config.soul.relationshipReflectionMessageInterval, 5)
  assert.equal(config.soul.relationshipReflectionTimeIntervalMs, 900000)
})

test("loadConfig ignores legacy workspaceRoot in bot.yml and uses the provided workspace", () => {
  const dir = mkdtempSync(join(tmpdir(), "myz-bot-"))
  const runtimeDir = join(dir, "runtime")
  const workspaceDir = join(dir, "workspace")
  const path = join(runtimeDir, "bot.yml")
  mkdirSync(runtimeDir, { recursive: true })
  mkdirSync(workspaceDir, { recursive: true })
  writeFileSync(
    path,
    [
      "telegram:",
      "  username: testbot",
      "  token: testtoken",
      "ai:",
      "  provider: openai_compatible",
      "  model: gpt-test",
      'workspaceRoot: "../ignored"',
    ].join("\n"),
  )

  const config = loadConfig({ workspaceRoot: workspaceDir, runtimeRoot: runtimeDir })
  assert.equal(config.workspaceRoot, realpathSync(workspaceDir))
  assert.equal(config.skillsDir, join(config.workspaceRoot, "skills"))
  assert.equal(config.attachmentsDir, join(config.runtimeRoot, "workspaces", config.workspaceId, "attachments"))
  assert.equal(config.runtimeRoot, runtimeDir)
  assert.equal(config.conversationsDir, join(config.runtimeRoot, "workspaces", config.workspaceId, "conversations"))
  assert.equal(config.memoryDir, join(config.workspaceRoot, "memory"))
})

test("loadConfig rejects removed legacy context section", () => {
  const workspaceDir = mkdtempSync(join(tmpdir(), "myz-bot-workspace-"))
  const runtimeDir = mkdtempSync(join(tmpdir(), "myz-bot-runtime-"))
  const path = join(runtimeDir, "bot.yml")
  writeFileSync(
    path,
    [
      "telegram:",
      "  username: testbot",
      "  token: testtoken",
      "ai:",
      "  provider: openai_compatible",
      "  model: gpt-test",
      "context:",
      "  maxHistoryMessages: 10",
    ].join("\n"),
  )

  assert.throws(
    () => loadConfig({ workspaceRoot: workspaceDir, runtimeRoot: runtimeDir }),
    /context.*removed/i,
  )
})
