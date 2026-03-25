import { test } from "node:test"
import assert from "node:assert/strict"
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { initWorkspace } from "../src/init"

test("initWorkspace creates AGENTS.md and BOOTSTRAP.md templates", async () => {
  const root = mkdtempSync(join(tmpdir(), "myz-bot-init-"))

  await initWorkspace(root)

  const agents = readFileSync(join(root, "AGENTS.md"), "utf-8")
  const bootstrap = readFileSync(join(root, "BOOTSTRAP.md"), "utf-8")

  assert.match(agents, /# AGENTS\.md/)
  assert.match(agents, /## First Run/)
  assert.match(agents, /## Tasks And Follow-ups/)
  assert.match(bootstrap, /# BOOTSTRAP\.md/)
  assert.match(bootstrap, /## First Conversation/)
  assert.match(bootstrap, /Telegram \/ Runtime Setup/)
})

test("initWorkspace does not overwrite existing AGENTS.md or BOOTSTRAP.md", async () => {
  const root = mkdtempSync(join(tmpdir(), "myz-bot-init-"))
  const agentsPath = join(root, "AGENTS.md")
  const bootstrapPath = join(root, "BOOTSTRAP.md")

  writeFileSync(agentsPath, "custom agents")
  writeFileSync(bootstrapPath, "custom bootstrap")

  await initWorkspace(root)

  assert.equal(readFileSync(agentsPath, "utf-8"), "custom agents")
  assert.equal(readFileSync(bootstrapPath, "utf-8"), "custom bootstrap")
})
