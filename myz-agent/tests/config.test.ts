import assert from "node:assert/strict"
import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { test } from "node:test"
import { loadConfig, loadConfigNew } from "../src/config"

test("loadConfigNew parses new provider format", () => {
  const workspaceDir = mkdtempSync(join(tmpdir(), "myz-workspace-"))
  const runtimeDir = mkdtempSync(join(tmpdir(), "myz-runtime-"))
  mkdirSync(runtimeDir, { recursive: true })
  writeFileSync(
    join(runtimeDir, "myz.yml"),
    [
      "providers:",
      "  deepseek:",
      "    type: openai_compatible",
      "    baseUrl: https://api.deepseek.com/v1",
      '    apiKey: "${DEEPSEEK_API_KEY}"',
      "    compatProfile: deepseek",
      "    models:",
      "      - id: deepseek-chat",
      "        contextWindow: 65536",
      "        maxOutputTokens: 8192",
      "        capabilities:",
      "          toolCalling: true",
      "          reasoning: false",
      "          vision: false",
      "defaults:",
      "  provider: deepseek",
      "  model: deepseek-chat",
    ].join("\n"),
  )

  const config = loadConfigNew({ workspaceRoot: workspaceDir, runtimeRoot: runtimeDir })
  assert.equal(config.defaults.provider, "deepseek")
  assert.equal(config.defaults.model, "deepseek-chat")
  assert.equal(config.workspaceRoot, realpathSync(workspaceDir))
  assert.equal(config.runtimeRoot, runtimeDir)
  assert.ok(config.providers.deepseek)
  assert.equal(config.providers.deepseek.type, "openai_compatible")
  assert.equal(config.providers.deepseek.compatProfile, "deepseek")
  assert.equal(config.providers.deepseek.models.length, 1)
  assert.equal(config.providers.deepseek.models[0].id, "deepseek-chat")
  assert.equal(config.providers.deepseek.models[0].contextWindow, 65536)
  assert.equal(config.context.strategy, "summary")
})

test("loadConfigNew parses workspace config override", () => {
  const workspaceDir = mkdtempSync(join(tmpdir(), "myz-workspace-"))
  const runtimeDir = mkdtempSync(join(tmpdir(), "myz-runtime-"))
  mkdirSync(runtimeDir, { recursive: true })
  mkdirSync(join(workspaceDir, ".agents"), { recursive: true })
  writeFileSync(
    join(runtimeDir, "myz.yml"),
    [
      "providers:",
      "  deepseek:",
      "    type: openai_compatible",
      "    baseUrl: https://api.deepseek.com/v1",
      "    apiKey: test-key",
      "    models:",
      "      - id: deepseek-chat",
      "        contextWindow: 65536",
      "        maxOutputTokens: 8192",
      "        capabilities:",
      "          toolCalling: true",
      "          reasoning: false",
      "          vision: false",
      "      - id: deepseek-reasoner",
      "        contextWindow: 65536",
      "        maxOutputTokens: 8192",
      "        capabilities:",
      "          toolCalling: true",
      "          reasoning: true",
      "          vision: false",
      "defaults:",
      "  provider: deepseek",
      "  model: deepseek-chat",
    ].join("\n"),
  )
  writeFileSync(
    join(workspaceDir, ".agents", "myz.yml"),
    [
      "defaults:",
      "  model: deepseek-reasoner",
      "permissions:",
      "  - pattern: bash:rm *",
      "    action: deny",
      "context:",
      "  strategy: token-budget",
    ].join("\n"),
  )

  const config = loadConfigNew({ workspaceRoot: workspaceDir, runtimeRoot: runtimeDir })
  assert.equal(config.defaults.provider, "deepseek")
  assert.equal(config.defaults.model, "deepseek-reasoner")
  assert.equal(config.permissions.length, 1)
  assert.equal(config.permissions[0].pattern, "bash:rm *")
  assert.equal(config.permissions[0].action, "deny")
  assert.equal(config.context.strategy, "token-budget")
})

test("loadConfigNew handles env var references", () => {
  const workspaceDir = mkdtempSync(join(tmpdir(), "myz-workspace-"))
  const runtimeDir = mkdtempSync(join(tmpdir(), "myz-runtime-"))
  mkdirSync(runtimeDir, { recursive: true })
  process.env.MYZ_TEST_API_KEY = "test-123"
  writeFileSync(
    join(runtimeDir, "myz.yml"),
    [
      "providers:",
      "  test:",
      "    type: openai_compatible",
      "    baseUrl: https://api.test.com/v1",
      '    apiKey: "${MYZ_TEST_API_KEY}"',
      "    models:",
      "      - id: test-model",
      "        contextWindow: 4096",
      "        maxOutputTokens: 1024",
      "        capabilities:",
      "          toolCalling: true",
      "          reasoning: false",
      "          vision: false",
      "defaults:",
      "  provider: test",
      "  model: test-model",
    ].join("\n"),
  )

  const config = loadConfigNew({ workspaceRoot: workspaceDir, runtimeRoot: runtimeDir })
  assert.equal(config.providers.test.apiKey, "test-123")
  delete process.env.MYZ_TEST_API_KEY
})


test("loadConfig ignores legacy workspaceRoot in config", () => {
  const dir = mkdtempSync(join(tmpdir(), "myz-"))
  const runtimeDir = join(dir, "runtime")
  const workspaceDir = join(dir, "workspace")
  mkdirSync(runtimeDir, { recursive: true })
  mkdirSync(workspaceDir, { recursive: true })
  writeFileSync(
    join(runtimeDir, "myz.yml"),
    [
      "ai:",
      "  provider: openai_compatible",
      "  model: gpt-test",
      'workspaceRoot: "../ignored"',
    ].join("\n"),
  )

  const config = loadConfig({ workspaceRoot: workspaceDir, runtimeRoot: runtimeDir })
  assert.equal(config.workspaceRoot, realpathSync(workspaceDir))
  assert.equal(config.runtimeRoot, runtimeDir)
})
