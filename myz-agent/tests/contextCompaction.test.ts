import { compactContext } from "@myz/agent-core"
import type { Message } from "@myz/agent-providers"
import assert from "node:assert/strict"
import { test } from "node:test"

function makeUser(content: string): Message {
  return { role: "user", content }
}

function makeAssistant(content: string): Message {
  return { role: "assistant", content }
}

function makeTool(content: string, toolCallId: string): Message {
  return { role: "tool", content, tool_call_id: toolCallId }
}

function makeAssistantWithTool(content: string, toolCallId: string, toolName: string): Message {
  return {
    role: "assistant",
    content,
    tool_calls: [{
      id: toolCallId,
      type: "function",
      function: { name: toolName, arguments: "{}" },
    }],
  }
}

test("compactContext: no compression when under budget", async () => {
  const messages: Message[] = [
    makeUser("hello"),
    makeAssistant("hi there"),
  ]

  const result = await compactContext({
    messages,
    config: { strategy: "token-budget", summaryThresholdRatio: 0.8, recentWindowRatio: 0.3, summaryMaxTokens: 2000 },
    contextWindow: 128000,
    maxOutputTokens: 8192,
  })

  assert.equal(result.compressed, false)
  assert.equal(result.history.length, 2)
})

test("compactContext: token-budget drops old messages", async () => {
  const messages: Message[] = Array.from({ length: 20 }).flatMap((_, i) => [
    makeUser(`message ${i} ${"x".repeat(200)}`),
    makeAssistant(`response ${i} ${"y".repeat(200)}`),
  ])

  const result = await compactContext({
    messages,
    config: { strategy: "token-budget", summaryThresholdRatio: 0.8, recentWindowRatio: 0.3, summaryMaxTokens: 2000 },
    contextWindow: 2048,
    maxOutputTokens: 512,
  })

  assert.equal(result.compressed, true)
  assert.ok(result.history.length < messages.length)
  assert.ok(result.summary.includes("已移除"))
})

test("compactContext: none strategy never compresses", async () => {
  const messages: Message[] = Array.from({ length: 100 }).flatMap((_, i) => [
    makeUser(`msg ${i} ${"z".repeat(500)}`),
    makeAssistant(`resp ${i} ${"w".repeat(500)}`),
  ])

  const result = await compactContext({
    messages,
    config: { strategy: "none", summaryThresholdRatio: 0.8, recentWindowRatio: 0.3, summaryMaxTokens: 2000 },
    contextWindow: 1024,
    maxOutputTokens: 128,
  })

  assert.equal(result.compressed, false)
  assert.equal(result.history.length, messages.length)
})

test("compactContext: preserves tool call / result pairs in recent window", async () => {
  const toolCallId = "tc-1"
  const longMsg = "x".repeat(2000)
  const messages: Message[] = [
    makeUser(`old message 1 ${longMsg}`),
    makeAssistant(`old response 1 ${longMsg}`),
    makeUser(`old message 2 ${longMsg}`),
    makeAssistant(`old response 2 ${longMsg}`),
    makeUser("recent question"),
    makeAssistantWithTool("let me check", toolCallId, "Read"),
    makeTool("file content here", toolCallId),
    makeAssistant("based on the file..."),
  ]

  const result = await compactContext({
    messages,
    config: { strategy: "token-budget", summaryThresholdRatio: 0.8, recentWindowRatio: 0.5, summaryMaxTokens: 2000 },
    contextWindow: 2048,
    maxOutputTokens: 256,
  })

  assert.equal(result.compressed, true)
  // The recent window should contain the tool call and result together
  const hasToolCall = result.history.some((m) =>
    m.role === "assistant" && m.tool_calls?.some((tc) => tc.id === toolCallId),
  )
  const hasToolResult = result.history.some((m) =>
    m.role === "tool" && m.tool_call_id === toolCallId,
  )
  assert.ok(hasToolCall, "should keep tool call in recent window")
  assert.ok(hasToolResult, "should keep tool result in recent window")
})

test("compactContext: summary strategy without LLM client falls back to token-budget", async () => {
  const messages: Message[] = Array.from({ length: 20 }).flatMap((_, i) => [
    makeUser(`msg ${i} ${"x".repeat(200)}`),
    makeAssistant(`resp ${i} ${"y".repeat(200)}`),
  ])

  const result = await compactContext({
    messages,
    config: { strategy: "summary", summaryThresholdRatio: 0.8, recentWindowRatio: 0.3, summaryMaxTokens: 2000 },
    contextWindow: 2048,
    maxOutputTokens: 512,
    // no client = falls back to token-budget
  })

  assert.equal(result.compressed, true)
  assert.ok(result.summary.includes("已移除"))
})

test("compactContext: summary is injected as user message with metadata", async () => {
  const messages: Message[] = Array.from({ length: 20 }).flatMap((_, i) => [
    makeUser(`msg ${i} ${"x".repeat(200)}`),
    makeAssistant(`resp ${i} ${"y".repeat(200)}`),
  ])

  const result = await compactContext({
    messages,
    config: { strategy: "token-budget", summaryThresholdRatio: 0.8, recentWindowRatio: 0.3, summaryMaxTokens: 2000 },
    contextWindow: 2048,
    maxOutputTokens: 512,
  })

  assert.equal(result.compressed, true)
  const firstMsg = result.history[0]
  assert.equal(firstMsg.role, "user")
  assert.equal(firstMsg.metadata?.type, "context_summary")
  assert.equal(firstMsg.metadata?.hiddenFromHistory, true)
})
