import { test } from "node:test"
import assert from "node:assert/strict"
import { existsSync, mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { ensureSessionDir } from "../src/sessions"

test("ensureSessionDir creates the conversation runtime directory only", () => {
  const root = mkdtempSync(join(tmpdir(), "myz-bot-conv-"))
  const dir = ensureSessionDir(root, "conv-1")
  assert.equal(existsSync(dir), true)
  assert.equal(dir, join(root, "conv-1"))
})
