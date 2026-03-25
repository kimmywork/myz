import { test } from "node:test"
import assert from "node:assert/strict"
import { mkdtempSync, readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
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
    conversationId: "c1",
    userContent: "你先记下来我的系统状态",
    assistantContent: "当前环境是 macOS arm64，Node/Python/Rust/Java/Docker 可用。",
  })
  assert.ok(first)
  assert.equal(loadMemoryIndex(memoryDir).length, 1)

  const second = rememberConversationExchange({
    memoryDir,
    conversationId: "c1",
    userContent: "你先记下来我的系统状态",
    assistantContent: "当前环境是 macOS arm64，Node/Python/Rust/Java/Docker 可用。",
  })
  assert.ok(second)
  assert.equal(second?.deduplicated, true)
  assert.equal(loadMemoryIndex(memoryDir).length, 1)

  const noteFile = loadMemoryIndex(memoryDir)[0]?.file || ""
  const noteContent = readFileSync(noteFile, "utf-8")
  assert.match(noteContent, /系统环境状态/)
  assert.match(noteContent, /Remembered state/)
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
