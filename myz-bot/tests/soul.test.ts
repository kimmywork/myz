import { test } from "node:test"
import assert from "node:assert/strict"
import { existsSync, mkdtempSync, readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  applySoulDraft,
  compactSoulContent,
  createSoulDraft,
  ensureSoulFile,
  loadSoul,
  stripVolatileSoulSections,
} from "../src/soul"

test("applySoulDraft versions previous soul and updates SOUL.md", () => {
  const workspaceRoot = mkdtempSync(join(tmpdir(), "myz-bot-soul-"))
  const runtimeRoot = join(workspaceRoot, ".runtime")
  ensureSoulFile(workspaceRoot, runtimeRoot)
  const originalSoul = loadSoul(workspaceRoot)

  const draft = createSoulDraft({
    runtimeRoot,
    content: "# New Soul\n\nUpdated persona",
    metadata: {
      actor: "admin",
      trigger: "manual",
      conversationId: "c1",
    },
  })
  const applied = applySoulDraft({
    workspaceRoot,
    runtimeRoot,
    draftId: draft.id,
    metadata: {
      actor: "admin",
    },
  })

  assert.equal(existsSync(applied.versionPath), true)
  assert.equal(readFileSync(join(workspaceRoot, "SOUL.md"), "utf-8").includes("New Soul"), true)
  assert.equal(readFileSync(applied.versionPath, "utf-8").trim(), originalSoul.trim())
})

test("loadSoul and ensureSoulFile do not create runtime soul directories inside workspace by default", () => {
  const workspaceRoot = mkdtempSync(join(tmpdir(), "myz-bot-soul-"))

  ensureSoulFile(workspaceRoot)
  const soul = loadSoul(workspaceRoot)

  assert.match(soul, /名字与身份/)
  assert.equal(existsSync(join(workspaceRoot, "SOUL.md")), true)
  assert.equal(existsSync(join(workspaceRoot, "soul")), false)
})

test("compactSoulContent keeps structure while shrinking oversized soul", () => {
  const soul = [
    "# Bot",
    "",
    "## 名字与身份",
    "A".repeat(2400),
    "",
    "## 性格与气质",
    "B".repeat(2400),
    "",
    "## 语气与表达",
    "C".repeat(2400),
  ].join("\n")

  const compacted = compactSoulContent(soul, 1200)

  assert.match(compacted, /^# Bot/m)
  assert.match(compacted, /^## 名字与身份/m)
  assert.match(compacted, /^## 性格与气质/m)
  assert.match(compacted, /^## 语气与表达/m)
  assert.ok(compacted.length <= 1200)
})

test("stripVolatileSoulSections removes growth summary sections from prompt-visible soul", () => {
  const soul = [
    "# Bot",
    "",
    "## 名字与身份",
    "我是 Kimi。",
    "",
    "## 角色成长状态",
    "- 更温柔了。",
    "",
    "## 最近反馈摘要",
    "- 用户最近很喜欢这样。",
    "",
    "## 成长边界",
    "保持稳定。",
  ].join("\n")

  const stripped = stripVolatileSoulSections(soul)

  assert.match(stripped, /^# Bot/m)
  assert.match(stripped, /^## 名字与身份/m)
  assert.match(stripped, /^## 成长边界/m)
  assert.doesNotMatch(stripped, /角色成长状态/)
  assert.doesNotMatch(stripped, /最近反馈摘要/)
})
