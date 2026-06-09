import { test } from "node:test"
import assert from "node:assert/strict"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  ensureMemoryDir,
  didToolTraceRemember,
  isExplicitMemoryRequest,
  loadMemoryIndex,
  rememberConversationExchange,
} from "../src/memory"

test("isExplicitMemoryRequest detects direct remember intents", () => {
  assert.equal(isExplicitMemoryRequest("你先记下来我的系统状态"), true)
  assert.equal(isExplicitMemoryRequest("remember this setup"), true)
  assert.equal(isExplicitMemoryRequest("我们之后再聊"), false)
})

test("rememberConversationExchange persists and deduplicates explicit memory", () => {
  const memoryDir = mkdtempSync(join(tmpdir(), "myz-bot-memory-"))

  const first = rememberConversationExchange({
    memoryDir,
    sessionId: "c1",
    userContent: "你先记下来我的系统状态",
    assistantContent: "当前环境是 macOS arm64，Node/Python/Rust/Java/Docker 可用。",
  })
  assert.ok(first)
  assert.equal(loadMemoryIndex(memoryDir).length, 1)

  const second = rememberConversationExchange({
    memoryDir,
    sessionId: "c1",
    userContent: "你先记下来我的系统状态",
    assistantContent: "当前环境是 macOS arm64，Node/Python/Rust/Java/Docker 可用。",
  })
  assert.ok(second)
  assert.equal(second?.deduplicated, true)
  assert.equal(loadMemoryIndex(memoryDir).length, 1)

  const noteFile = loadMemoryIndex(memoryDir)[0]?.file || ""
  const noteContent = readFileSync(noteFile, "utf-8")
  assert.equal(existsSync(join(memoryDir, "MEMORY.md")), true)
  assert.match(noteFile, /\/\d{4}-\d{2}-\d{2}\.md$/)
  assert.match(noteContent, /系统环境状态/)
  assert.match(noteContent, /Remembered state/)
  assert.match(noteContent, /<!-- myz-memory /)
})

test("ensureMemoryDir migrates legacy notes and conversation summaries into daily logs", () => {
  const memoryDir = mkdtempSync(join(tmpdir(), "myz-bot-memory-"))
  const legacyNotesDir = join(memoryDir, "notes")
  const legacySummariesDir = join(memoryDir, "conversation-summaries")
  const legacyNoteFile = join(legacyNotesDir, "mem-old.md")
  mkdirSync(legacyNotesDir, { recursive: true })
  mkdirSync(legacySummariesDir, { recursive: true })
  writeFileSync(legacyNoteFile, "# 用户偏好\n\n用户偏好简洁回复。\n")
  writeFileSync(
    join(memoryDir, "index.json"),
    JSON.stringify(
      {
        items: [
          {
            id: "mem-old",
            title: "用户偏好",
            tags: ["auto-memory", "conversation:c1"],
            createdAt: "2026-03-26T08:00:00.000Z",
            file: legacyNoteFile,
          },
        ],
      },
      null,
      2,
    ),
  )
  writeFileSync(
    join(legacySummariesDir, "c1.md"),
    "会话压缩摘要\n\n用户最近一直在整理长期记忆。",
  )

  ensureMemoryDir(memoryDir)

  assert.equal(existsSync(join(memoryDir, "index.json")), false)
  assert.equal(existsSync(legacyNotesDir), false)
  assert.equal(existsSync(legacySummariesDir), false)
  const dailyLogs = readdirSync(memoryDir).filter((name) => /^\d{4}-\d{2}-\d{2}\.md$/.test(name))
  assert.equal(dailyLogs.length >= 1, true)
  const merged = dailyLogs
    .map((name) => readFileSync(join(memoryDir, name), "utf-8"))
    .join("\n")
  assert.match(merged, /用户偏好/)
  assert.match(merged, /用户偏好简洁回复/)
  assert.match(merged, /会话摘要 c1/)
  assert.match(merged, /用户最近一直在整理长期记忆/)
  assert.equal(loadMemoryIndex(memoryDir).length, 1)
})

test("didToolTraceRemember detects remember tool usage", () => {
  assert.equal(
    didToolTraceRemember([
      {
        role: "assistant",
        tool_calls: [{ function: { name: "Remember" } }],
      },
    ]),
    true,
  )
  assert.equal(
    didToolTraceRemember([
      {
        role: "tool",
        metadata: { toolName: "Remember" },
      },
    ]),
    true,
  )
  assert.equal(didToolTraceRemember([{ role: "assistant" }]), false)
})
