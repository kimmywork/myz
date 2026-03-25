import { test } from "node:test"
import assert from "node:assert/strict"
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { loadConfig } from "../src/config"

test("loadConfig parses minimal bot.yml", () => {
  const dir = mkdtempSync(join(tmpdir(), "myz-bot-"))
  const path = join(dir, "bot.yml")
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

  const config = loadConfig(path)
  assert.equal(config.telegram.username, "testbot")
  assert.equal(config.ai.model, "gpt-test")
  assert.ok(config.workspaceRoot)
  assert.equal(config.skillSources[0]?.id, "builtin")
  assert.equal(config.skillSources[1]?.id, "project")
  assert.equal(config.telegram.timeoutSeconds, 25)
  assert.equal(config.telegram.retry.retries, 2)
  assert.equal(config.network.requestTimeoutMs, 180000)
  assert.equal(config.ai.retry.retries, 2)
  assert.equal(config.scheduler.enabled, true)
  assert.equal(config.scheduler.pollIntervalMs, 15000)
  assert.equal(config.context.maxHistoryMessages, 120)
  assert.equal(config.context.maxHistoryChars, 120000)
  assert.equal(config.context.compressionThreshold, 160)
  assert.equal(config.context.compressionCooldownMs, 300000)
  assert.equal(config.context.summaryMaxMessages, 20)
  assert.equal(config.context.summaryMaxChars, 6000)
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
  const dir = mkdtempSync(join(tmpdir(), "myz-bot-"))
  const path = join(dir, "bot.yml")
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
      "tools:",
      "  allowlist:",
      "    - Read",
      "scheduler:",
      "  enabled: true",
      "  pollIntervalMs: 5000",
      "  maxBatchSize: 5",
      "  failureRetryBaseDelayMs: 10000",
      "context:",
      "  maxHistoryMessages: 10",
      "  maxHistoryChars: 20000",
      "  compressionThreshold: 20",
      "  compressionCooldownMs: 1000",
      "  summaryMaxMessages: 8",
      "  summaryMaxChars: 4000",
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

  const config = loadConfig(path)
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
  assert.equal(config.ai.systemPromptInUserMessage, true)
  assert.equal(config.ai.retry.retries, 4)
  assert.equal(config.scheduler.pollIntervalMs, 5000)
  assert.equal(config.scheduler.maxBatchSize, 5)
  assert.equal(config.context.maxHistoryMessages, 10)
  assert.equal(config.context.maxHistoryChars, 20000)
  assert.equal(config.context.compressionThreshold, 20)
  assert.equal(config.context.compressionCooldownMs, 1000)
  assert.equal(config.context.summaryMaxMessages, 8)
  assert.equal(config.context.summaryMaxChars, 4000)
  assert.equal(config.soul.autoDraft, true)
  assert.equal(config.soul.autoApply, false)
  assert.equal(config.soul.autoDraftTimeIntervalMs, 7200000)
  assert.equal(config.soul.growthFeedbackBatchMessageInterval, 6)
  assert.equal(config.soul.growthFeedbackTimeIntervalMs, 600000)
  assert.equal(config.soul.relationshipReflectionMessageInterval, 5)
  assert.equal(config.soul.relationshipReflectionTimeIntervalMs, 900000)
})

test("loadConfig resolves workspaceRoot relative to bot.yml location", () => {
  const dir = mkdtempSync(join(tmpdir(), "myz-bot-"))
  const configDir = join(dir, "configs")
  const workspaceDir = join(dir, "runtime")
  const path = join(configDir, "bot.yml")
  mkdirSync(configDir, { recursive: true })
  writeFileSync(
    path,
    [
      "telegram:",
      "  username: testbot",
      "  token: testtoken",
      'ai:',
      "  provider: openai_compatible",
      "  model: gpt-test",
      'workspaceRoot: "../runtime"',
    ].join("\n"),
  )

  const config = loadConfig(path)
  assert.equal(config.workspaceRoot, workspaceDir)
  assert.equal(config.skillsDir, join(workspaceDir, ".myz/skills"))
  assert.equal(config.conversationsDir, join(workspaceDir, "conversations"))
  assert.equal(config.memoryDir, join(workspaceDir, "memory"))
})
