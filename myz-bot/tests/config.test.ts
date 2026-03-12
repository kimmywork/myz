import { test } from "node:test"
import assert from "node:assert/strict"
import { mkdtempSync, writeFileSync } from "node:fs"
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
})
