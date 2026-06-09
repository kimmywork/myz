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
      "ai:",
      "  provider: openai_compatible",
      "  model: gpt-test",
    ].join("\n"),
  )

  const config = loadConfig({ workspaceRoot: workspaceDir, runtimeRoot: runtimeDir })
  assert.equal(config.ai.model, "gpt-test")
  assert.equal(config.workspaceRoot, realpathSync(workspaceDir))
  assert.equal(config.runtimeRoot, runtimeDir)
  assert.equal(config.skillSources[0]?.id, "builtin")
  assert.equal(config.skillSources[1]?.id, "project")
  assert.equal(config.channels.tui.enabled, true)
  assert.equal(config.network.requestTimeoutMs, 180000)
  assert.equal(config.ai.retry.retries, 2)
  assert.equal(config.ai.streamingEnabled, true)
  assert.equal(config.ai.compatProfile, "auto")
  assert.equal(config.ai.reasoningMode, "provider_default")
  assert.equal(config.ai.reasoningEffort, "provider_default")
  assert.equal(config.contextCompaction.enabled, true)
  assert.equal(config.contextCompaction.maxHistoryMessages, 120)
  assert.equal(config.contextCompaction.maxHistoryChars, 120000)
  assert.equal(config.contextCompaction.summaryMaxChars, 6000)
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
  assert.equal(config.soul.reviewRequired, true)
})

test("loadConfig parses permissions and skill policies", () => {
  const workspaceDir = mkdtempSync(join(tmpdir(), "myz-bot-workspace-"))
  const runtimeDir = mkdtempSync(join(tmpdir(), "myz-bot-runtime-"))
  const path = join(runtimeDir, "bot.yml")
  writeFileSync(
    path,
    [
      "channels:",
      "  tui:",
      "    label: console",
      "    operatorUsername: operator",
      "network:",
      "  requestTimeoutMs: 90000",
      "  connectTimeoutMs: 5000",
      "  keepAliveTimeoutMs: 2000",
      "  keepAliveTimeoutThresholdMs: 1000",
      "  proxyUrl: http://127.0.0.1:7890",
      "ai:",
      "  provider: openai_compatible",
      "  compatProfile: deepseek",
      "  reasoningMode: disabled",
      "  reasoningEffort: high",
      "  reasoningBudget: 1024",
      "  model: gpt-test",
      "  systemPromptInUserMessage: true",
      "  retry:",
      "    retries: 4",
      "contextCompaction:",
      "  enabled: false",
      "  maxHistoryMessages: 48",
      "  maxHistoryChars: 64000",
      "  summaryMaxMessages: 8",
      "  summaryMaxChars: 2400",
      "  compressionCooldownMs: 90000",
      "skills:",
      "  allowlist:",
      "    - builtin/planning-mode",
      "  denylist:",
      "    - builtin/non-existent",
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
      "  reviewRequired: false",
    ].join("\n"),
  )

  const config = loadConfig({ workspaceRoot: workspaceDir, runtimeRoot: runtimeDir })
  assert.equal(config.channels.tui.label, "console")
  assert.equal(config.channels.tui.operatorUsername, "operator")
  assert.equal(config.network.requestTimeoutMs, 90000)
  assert.equal(config.network.connectTimeoutMs, 5000)
  assert.equal(config.network.proxyUrl, "http://127.0.0.1:7890")
  assert.deepEqual(config.skillAllowlist, ["builtin/planning-mode"])
  assert.deepEqual(config.skillDenylist, ["builtin/non-existent"])
  assert.deepEqual(config.toolAllowlist, ["read"])
  assert.equal(config.debug, true)
  assert.equal(config.ai.systemPromptInUserMessage, true)
  assert.equal(config.ai.compatProfile, "deepseek")
  assert.equal(config.ai.reasoningMode, "disabled")
  assert.equal(config.ai.reasoningEffort, "high")
  assert.equal(config.ai.reasoningBudget, 1024)
  assert.equal(config.contextCompaction.enabled, false)
  assert.equal(config.contextCompaction.maxHistoryMessages, 48)
  assert.equal(config.contextCompaction.maxHistoryChars, 64000)
  assert.equal(config.contextCompaction.summaryMaxMessages, 8)
  assert.equal(config.contextCompaction.summaryMaxChars, 2400)
  assert.equal(config.contextCompaction.compressionCooldownMs, 90000)
  assert.equal(config.ai.retry.retries, 4)
  assert.equal(config.scheduler.pollIntervalMs, 5000)
  assert.equal(config.scheduler.maxBatchSize, 5)
  assert.equal(config.upgrade.packageName, "custom-bot")
  assert.equal(config.upgrade.channel, "0.2.0")
  assert.equal(config.upgrade.checkIntervalMs, 120000)
  assert.equal(config.upgrade.strategy, "prepare-and-restart")
  assert.equal(config.upgrade.applyMode, "launcher-only")
  assert.equal(config.upgrade.allowPrerelease, true)
  assert.equal(config.soul.reviewRequired, false)
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
  assert.equal(config.sessionsDir, join(config.runtimeRoot, "workspaces", config.workspaceId, "sessions"))
  assert.equal(config.memoryDir, join(config.workspaceRoot, "memory"))
})

test("loadConfig rejects removed legacy context section", () => {
  const workspaceDir = mkdtempSync(join(tmpdir(), "myz-bot-workspace-"))
  const runtimeDir = mkdtempSync(join(tmpdir(), "myz-bot-runtime-"))
  const path = join(runtimeDir, "bot.yml")
  writeFileSync(
    path,
    [
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

test("loadConfig rejects unsupported ai provider types", () => {
  const workspaceDir = mkdtempSync(join(tmpdir(), "myz-bot-workspace-"))
  const runtimeDir = mkdtempSync(join(tmpdir(), "myz-bot-runtime-"))
  const path = join(runtimeDir, "bot.yml")
  writeFileSync(
    path,
    [
      "ai:",
      "  provider: ollama",
      "  model: gpt-test",
    ].join("\n"),
  )

  assert.throws(
    () => loadConfig({ workspaceRoot: workspaceDir, runtimeRoot: runtimeDir }),
    /invalid_value|provider/i,
  )
})
