import { test } from "node:test"
import assert from "node:assert/strict"
import { existsSync, mkdtempSync, readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { prepareConversationContext } from "../src/contextCompaction"
import {
  createAssistantMessage,
  createSystemMessage,
  createToolMessage,
  createUserMessage,
  loadAllMessages,
} from "../src/conversations"

test("prepareConversationContext compacts oversized history into a stored summary", () => {
  const root = mkdtempSync(join(tmpdir(), "myz-bot-context-"))
  const conversationDir = join(root, "conversations", "c1")
  const messages = Array.from({ length: 8 }).flatMap((_, index) => [
    createUserMessage("c1", `user message ${index + 1} ${"x".repeat(600)}`),
    createAssistantMessage("c1", `assistant message ${index + 1} ${"y".repeat(600)}`),
  ])

  const result = prepareConversationContext({
    conversationDir,
    conversationId: "c1",
    messages,
    maxHistoryMessages: 4,
    summaryMaxMessages: 3,
    contextWindowTokens: 4096,
    maxOutputTokens: 512,
  })

  assert.equal(result.compressed, true)
  assert.match(result.summary, /会话压缩摘要/)
  assert.ok(result.history.length <= 4)

  const summaryFile = join(conversationDir, "context", "summary.json")
  assert.equal(existsSync(summaryFile), true)
  const stored = JSON.parse(readFileSync(summaryFile, "utf-8")) as { summary?: string }
  assert.equal(stored.summary, result.summary)

  const rewritten = loadAllMessages(conversationDir)
  assert.deepEqual(rewritten, result.history)
})

test("prepareConversationContext excludes tool outputs from stored summary but preserves live tool chains", () => {
  const root = mkdtempSync(join(tmpdir(), "myz-bot-context-"))
  const conversationDir = join(root, "conversations", "c2")
  const assistantWithTool = createAssistantMessage("c2", "我先读取文件")
  assistantWithTool.tool_calls = [
    {
      id: "tool-1",
      type: "function",
      function: {
        name: "Read",
        arguments: "{\"path\":\"/workspace/a.md\"}",
      },
    },
  ]
  const messages = [
    createSystemMessage("c2", "system"),
    createUserMessage("c2", `user message 0 ${"x".repeat(1500)}`),
    createAssistantMessage("c2", `assistant message 0 ${"y".repeat(1500)}`),
    createUserMessage("c2", `user message 1 ${"x".repeat(1500)}`),
    createAssistantMessage("c2", `assistant message 1 ${"y".repeat(1500)}`),
    createAssistantMessage("c2", "", { type: "tool_audit", toolName: "Read" }),
    assistantWithTool,
    createToolMessage("c2", "tool result should stay in live tail", "tool-1", {
      toolName: "Read",
    }),
    createUserMessage("c2", "user message 2"),
  ]

  const result = prepareConversationContext({
    conversationDir,
    conversationId: "c2",
    messages,
    maxHistoryMessages: 2,
    maxHistoryChars: 3000,
    summaryMaxMessages: 4,
    contextWindowTokens: 4096,
    maxOutputTokens: 512,
  })

  assert.equal(result.compressed, true)
  assert.doesNotMatch(result.summary, /tool result should stay in live tail/)
  assert.doesNotMatch(result.summary, /assistant:Read/)
  assert.equal(result.history.some((message) => message.role === "tool"), true)
  assert.equal(
    result.history.some(
      (message) =>
        message.role === "assistant" &&
        Array.isArray(message.tool_calls) &&
        message.tool_calls.some((toolCall) => toolCall?.id === "tool-1"),
    ),
    true,
  )
})

test("prepareConversationContext keeps full history when content still fits the context budget", () => {
  const root = mkdtempSync(join(tmpdir(), "myz-bot-context-"))
  const conversationDir = join(root, "conversations", "c3")
  const messages = Array.from({ length: 90 }).flatMap((_, index) => [
    createUserMessage("c3", `u${index + 1}`),
    createAssistantMessage("c3", `a${index + 1}`),
  ])

  const result = prepareConversationContext({
    conversationDir,
    conversationId: "c3",
    messages,
    maxHistoryMessages: 30,
    summaryMaxMessages: 6,
    contextWindowTokens: 32768,
    maxOutputTokens: 1024,
  })

  assert.equal(result.compressed, false)
  assert.equal(result.history.length, messages.length)
  assert.equal(result.summary, "")
})
