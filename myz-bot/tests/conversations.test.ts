import { test } from "node:test"
import assert from "node:assert/strict"
import { existsSync, mkdtempSync, readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  ensureConversationDir,
  getConversationWorkspaceDir,
} from "../src/conversations"

test("ensureConversationDir creates per-conversation workspace", () => {
  const root = mkdtempSync(join(tmpdir(), "myz-bot-conv-"))
  const dir = ensureConversationDir(root, "conv-1")
  const workspaceDir = getConversationWorkspaceDir(root, "conv-1")
  assert.equal(existsSync(dir), true)
  assert.equal(existsSync(workspaceDir), true)
  assert.equal(
    readFileSync(join(dir, ".gitignore"), "utf-8"),
    "workspace/*\n",
  )
})
