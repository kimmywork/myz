import { test } from "node:test"
import assert from "node:assert/strict"
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { initWorkspace } from "../src/init"

const TEST_ANSWERS = {
  telegramUsername: "testbot",
  telegramToken: "telegram-token",
  aiProvider: "openai_compatible",
  aiBaseUrl: "https://api.openai.com/v1/chat/completions",
  aiAccessToken: "${OPENAI_API_KEY}",
  aiModel: "gpt-4o-mini",
} as const

test("initWorkspace creates AGENTS.md and BOOTSTRAP.md templates", async () => {
  const root = mkdtempSync(join(tmpdir(), "myz-bot-init-"))
  const runtimeRoot = mkdtempSync(join(tmpdir(), "myz-bot-runtime-"))

  await initWorkspace({
    workspaceRoot: root,
    runtimeRoot,
    answers: TEST_ANSWERS,
  })

  const agents = readFileSync(join(root, "AGENTS.md"), "utf-8")
  const bootstrap = readFileSync(join(root, "BOOTSTRAP.md"), "utf-8")
  const config = readFileSync(join(runtimeRoot, "bot.yml"), "utf-8")

  assert.match(agents, /# AGENTS\.md/)
  assert.match(agents, /## First Run/)
  assert.match(agents, /## Tasks And Follow-ups/)
  assert.match(bootstrap, /# BOOTSTRAP\.md/)
  assert.match(bootstrap, /## First Conversation/)
  assert.match(bootstrap, /Telegram \/ Runtime Setup/)
  assert.match(config, /upgrade:/)
  assert.match(config, /channel: "latest"/)
  assert.equal(existsSync(join(root, "soul")), false)
})

test("initWorkspace does not overwrite existing AGENTS.md or BOOTSTRAP.md", async () => {
  const root = mkdtempSync(join(tmpdir(), "myz-bot-init-"))
  const runtimeRoot = mkdtempSync(join(tmpdir(), "myz-bot-runtime-"))
  const agentsPath = join(root, "AGENTS.md")
  const bootstrapPath = join(root, "BOOTSTRAP.md")

  writeFileSync(agentsPath, "custom agents")
  writeFileSync(bootstrapPath, "custom bootstrap")

  await initWorkspace({
    workspaceRoot: root,
    runtimeRoot,
    answers: TEST_ANSWERS,
  })

  assert.equal(readFileSync(agentsPath, "utf-8"), "custom agents")
  assert.equal(readFileSync(bootstrapPath, "utf-8"), "custom bootstrap")
})

test("initWorkspace reuses existing bot.yml when existingConfigAction is reuse", async () => {
  const root = mkdtempSync(join(tmpdir(), "myz-bot-init-"))
  const runtimeRoot = mkdtempSync(join(tmpdir(), "myz-bot-runtime-"))
  const configPath = join(runtimeRoot, "bot.yml")
  const originalConfig = [
    "telegram:",
    "  username: oldbot",
    "  token: old-token",
    "ai:",
    "  provider: openai_compatible",
    '  baseUrl: "https://example.invalid/v1"',
    '  accessToken: "old-secret"',
    "  model: old-model",
  ].join("\n")
  writeFileSync(configPath, originalConfig)

  await initWorkspace({
    workspaceRoot: root,
    runtimeRoot,
    existingConfigAction: "reuse",
    answers: TEST_ANSWERS,
  })

  assert.equal(readFileSync(configPath, "utf-8"), originalConfig)
})

test("initWorkspace updates existing bot.yml only when existingConfigAction is update", async () => {
  const root = mkdtempSync(join(tmpdir(), "myz-bot-init-"))
  const runtimeRoot = mkdtempSync(join(tmpdir(), "myz-bot-runtime-"))
  const configPath = join(runtimeRoot, "bot.yml")
  writeFileSync(
    configPath,
    [
      "telegram:",
      "  username: oldbot",
      "  token: old-token",
      "ai:",
      "  provider: openai_compatible",
      '  baseUrl: "https://example.invalid/v1"',
      '  accessToken: "old-secret"',
      "  model: old-model",
    ].join("\n"),
  )

  await initWorkspace({
    workspaceRoot: root,
    runtimeRoot,
    existingConfigAction: "update",
    answers: {
      telegramToken: "new-token",
      aiModel: "new-model",
    },
  })

  const nextConfig = readFileSync(configPath, "utf-8")
  assert.match(nextConfig, /username: "oldbot"/)
  assert.match(nextConfig, /token: "new-token"/)
  assert.match(nextConfig, /baseUrl: "https:\/\/example\.invalid\/v1"/)
  assert.match(nextConfig, /accessToken: "old-secret"/)
  assert.match(nextConfig, /model: "new-model"/)
})

test("initWorkspace rejects noninteractive overwrite when existing config action is unspecified", async () => {
  const root = mkdtempSync(join(tmpdir(), "myz-bot-init-"))
  const runtimeRoot = mkdtempSync(join(tmpdir(), "myz-bot-runtime-"))
  const configPath = join(runtimeRoot, "bot.yml")
  writeFileSync(
    configPath,
    [
      "telegram:",
      "  username: oldbot",
      "  token: old-token",
      "ai:",
      "  provider: openai_compatible",
      "  model: old-model",
    ].join("\n"),
  )

  await assert.rejects(
    initWorkspace({
      workspaceRoot: root,
      runtimeRoot,
      answers: TEST_ANSWERS,
    }),
    /existingConfigAction 为 reuse 或 update/,
  )
})
