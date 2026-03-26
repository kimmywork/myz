import { test } from "node:test"
import assert from "node:assert/strict"
import { existsSync, mkdtempSync, readFileSync, readdirSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { prepareConversationContext } from "../src/context"
import {
  createAssistantMessage,
  createSystemMessage,
  createToolMessage,
  createUserMessage,
} from "../src/conversations"

test("prepareConversationContext compresses aggressively when history exceeds context budget", () => {
  const root = mkdtempSync(join(tmpdir(), "myz-bot-context-"))
  const conversationDir = join(root, "conversations", "c1")
  const memoryDir = join(root, "memory")
  const messages = Array.from({ length: 8 }).flatMap((_, index) => [
    createUserMessage("c1", `user message ${index + 1} ${"x".repeat(600)}`),
    createAssistantMessage("c1", `assistant message ${index + 1} ${"y".repeat(600)}`),
  ])

  const result = prepareConversationContext({
    conversationDir,
    conversationId: "c1",
    memoryDir,
    messages,
    maxHistoryMessages: 4,
    compressionThreshold: 6,
    summaryMaxMessages: 3,
    contextWindowTokens: 4096,
    maxOutputTokens: 512,
  })

  assert.equal(result.compressed, true)
  assert.ok(result.summary.includes("会话压缩摘要"))
  assert.equal(result.history.length, 3)

  const summaryFile = join(conversationDir, "context", "summary.json")
  assert.equal(existsSync(summaryFile), true)
  const dailyLogs = readdirSync(memoryDir).filter((name: string) => /^\d{4}-\d{2}-\d{2}\.md$/.test(name))
  assert.equal(dailyLogs.length, 1)
  const memorySummary = readFileSync(join(memoryDir, dailyLogs[0] || ""), "utf-8")
  assert.match(memorySummary, /会话摘要 c1/)
  assert.match(memorySummary, /会话压缩摘要/)

  const stored = JSON.parse(readFileSync(summaryFile, "utf-8")) as { summary?: string }
  assert.equal(stored.summary, result.summary)
})

test("prepareConversationContext excludes tool responses from compressed summary", () => {
  const root = mkdtempSync(join(tmpdir(), "myz-bot-context-"))
  const conversationDir = join(root, "conversations", "c2")
  const memoryDir = join(root, "memory")
  const messages = [
    createUserMessage("c2", `user message 1 ${"x".repeat(700)}`),
    createAssistantMessage("c2", `assistant message 1 ${"y".repeat(700)}`),
    createAssistantMessage("c2", "", { type: "tool_audit", toolName: "Remember" }),
    createToolMessage("c2", "tool result should not be summarized", "tool-1", {
      type: "tool_audit",
      toolName: "Remember",
    }),
    createUserMessage("c2", `user message 2 ${"x".repeat(700)}`),
    createAssistantMessage("c2", `assistant message 2 ${"y".repeat(700)}`),
    createUserMessage("c2", `user message 3 ${"x".repeat(700)}`),
    createAssistantMessage("c2", `assistant message 3 ${"y".repeat(700)}`),
  ]

  const result = prepareConversationContext({
    conversationDir,
    conversationId: "c2",
    memoryDir,
    messages,
    maxHistoryMessages: 2,
    compressionThreshold: 4,
    summaryMaxMessages: 4,
    contextWindowTokens: 4096,
    maxOutputTokens: 512,
  })

  assert.equal(result.compressed, true)
  assert.doesNotMatch(result.summary, /tool result should not be summarized/)
  assert.doesNotMatch(result.summary, /assistant:Remember/)
})

test("prepareConversationContext keeps tool responses in live history before compression", () => {
  const root = mkdtempSync(join(tmpdir(), "myz-bot-context-"))
  const conversationDir = join(root, "conversations", "c3")
  const memoryDir = join(root, "memory")
  const toolMessage = createToolMessage("c3", "tool result is still visible", "tool-1", {
    toolName: "Read",
  })
  const messages = [
    createSystemMessage("c3", "system"),
    createUserMessage("c3", "user message 1"),
    createAssistantMessage("c3", "assistant message 1"),
    toolMessage,
    createUserMessage("c3", "user message 2"),
  ]

  const result = prepareConversationContext({
    conversationDir,
    conversationId: "c3",
    memoryDir,
    messages,
    maxHistoryMessages: 10,
    compressionThreshold: 20,
    summaryMaxMessages: 4,
    contextWindowTokens: 32768,
    maxOutputTokens: 1024,
  })

  assert.equal(result.compressed, false)
  assert.equal(result.history.some((message) => message.role === "tool"), true)
  assert.equal(
    result.history.some((message) => message.content === "tool result is still visible"),
    true,
  )
})

test("prepareConversationContext drops tool responses only when compression rewrites history", () => {
  const root = mkdtempSync(join(tmpdir(), "myz-bot-context-"))
  const conversationDir = join(root, "conversations", "c4")
  const memoryDir = join(root, "memory")
  const messages = [
    createSystemMessage("c4", "system"),
    createUserMessage("c4", `user message 1 ${"x".repeat(700)}`),
    createAssistantMessage("c4", `assistant message 1 ${"y".repeat(700)}`),
    createToolMessage("c4", "tool result should be dropped after compression", "tool-1", {
      toolName: "Read",
    }),
    createUserMessage("c4", `user message 2 ${"x".repeat(700)}`),
    createAssistantMessage("c4", `assistant message 2 ${"y".repeat(700)}`),
    createUserMessage("c4", `user message 3 ${"x".repeat(700)}`),
    createAssistantMessage("c4", `assistant message 3 ${"y".repeat(700)}`),
  ]

  const result = prepareConversationContext({
    conversationDir,
    conversationId: "c4",
    memoryDir,
    messages,
    maxHistoryMessages: 2,
    compressionThreshold: 4,
    summaryMaxMessages: 4,
    contextWindowTokens: 4096,
    maxOutputTokens: 512,
  })

  assert.equal(result.compressed, true)
  assert.equal(result.history.some((message) => message.role === "tool"), false)
  assert.doesNotMatch(result.summary, /tool result should be dropped after compression/)
})

test("prepareConversationContext does not compress just because message count is high when content still fits", () => {
  const root = mkdtempSync(join(tmpdir(), "myz-bot-context-"))
  const conversationDir = join(root, "conversations", "c5")
  const memoryDir = join(root, "memory")
  const messages = Array.from({ length: 90 }).flatMap((_, index) => [
    createUserMessage("c5", `u${index + 1}`),
    createAssistantMessage("c5", `a${index + 1}`),
  ])

  const result = prepareConversationContext({
    conversationDir,
    conversationId: "c5",
    memoryDir,
    messages,
    maxHistoryMessages: 30,
    compressionThreshold: 40,
    summaryMaxMessages: 6,
    contextWindowTokens: 32768,
    maxOutputTokens: 1024,
  })

  assert.equal(result.compressed, false)
  assert.equal(result.history.length, messages.length)
})
