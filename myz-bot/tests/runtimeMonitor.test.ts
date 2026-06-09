import { test } from "node:test"
import assert from "node:assert/strict"
import { createUserMessage } from "../src/sessions"
import {
  createRuntimeMonitor,
  formatRuntimeMonitorScreen,
} from "../src/runtimeMonitor"

test("runtime monitor tracks request metrics and chat tail", async () => {
  const writes: string[] = []
  const output = {
    isTTY: true,
    columns: 100,
    rows: 18,
    write(chunk: string) {
      writes.push(chunk)
      return true
    },
  }
  let current = new Date("2026-04-29T10:00:00.000Z")
  const monitor = createRuntimeMonitor({
    provider: "openai_compatible",
    model: "deepseek-chat",
    streamingEnabled: true,
    historyMode: "summary-compaction(120)",
    contextCompactionStatus: "summary-only",
    output,
    now: () => current,
  })
  monitor.setInputState({
    enabled: true,
    label: "local",
    draft: "继续看看 runtime",
    hint: "Local TUI chat | Enter send | Ctrl+C exit",
  })

  monitor.noteIncomingMessage({
    sessionId: "c1",
    text: "帮我整理这个任务",
  })
  const request = monitor.noteRequestStart({
    sessionId: "c1",
    source: "conversation",
    messages: [createUserMessage("c1", "帮我整理这个任务")],
  })
  current = new Date("2026-04-29T10:00:02.000Z")
  monitor.notePhase("tool", "c1")
  monitor.noteOutgoingMessage({
    sessionId: "c1",
    text: "我先看一下当前任务结构。",
    role: "progress",
  })
  monitor.noteRequestComplete({
    sessionId: "c1",
    source: "conversation",
    startedAt: request.startedAt - 2000,
    requestId: request.requestId,
    usage: {
      total_tokens: 200,
      prompt_tokens: 120,
      completion_tokens: 80,
      output_tokens_details: {
        reasoning_tokens: 18,
      },
      input_tokens_details: {
        cached_tokens: 40,
      },
    } as any,
    toolCallCount: 2,
  })
  monitor.noteOutgoingMessage({
    sessionId: "c1",
    text: "任务我已经先拆开了。",
  })
  monitor.notePhase("idle", "c1")

  await new Promise((resolve) => setTimeout(resolve, 5))

  const snapshot = monitor.getSnapshot()
  assert.equal(snapshot.requestCount, 1)
  assert.equal(snapshot.pendingRequests, 0)
  assert.equal(snapshot.totalTokens, 200)
  assert.equal(snapshot.contextMessages, 1)
  assert.equal(snapshot.activeConversationId, "c1")
  assert.equal(snapshot.lastRequest?.toolCallCount, 2)
  assert.equal(snapshot.lastRequest?.cachedPromptTokens, 40)
  assert.equal(snapshot.chatTail.length, 3)
  assert.match(snapshot.chatTail[0]?.text || "", /整理这个任务/)
  assert.match(snapshot.chatTail[1]?.text || "", /任务结构/)
  assert.match(snapshot.chatTail[2]?.text || "", /先拆开了/)
  assert.ok((snapshot.lastRequest?.tokensPerSecond || 0) > 0)
  assert.ok(writes.length > 0)
  assert.equal(typeof monitor.bindInput, "function")

  const screen = formatRuntimeMonitorScreen(snapshot, {
    width: 100,
    height: 18,
  })
  assert.match(screen, /provider=openai_compatible/)
  assert.match(screen, /model=deepseek-chat/)
  assert.match(screen, /stream=on/)
  assert.match(screen, /pending=0/)
  assert.match(screen, /history=summary-compaction\(120\)/)
  assert.match(screen, /compaction=summary-only/)
  assert.match(screen, /prompt=120/)
  assert.match(screen, /cached=40/)
  assert.match(screen, /completion=80/)
  assert.match(screen, /reasoning=18/)
  assert.match(screen, /Recent Chat/)
  assert.match(screen, /Local TUI chat/)
  assert.match(screen, /local> 继续看看 runtime/)

  monitor.close()
})

test("runtime monitor preserves explicit newlines in chat tail", async () => {
  const output = {
    isTTY: true,
    columns: 100,
    rows: 18,
    write() {
      return true
    },
  }

  const monitor = createRuntimeMonitor({
    provider: "openai_compatible",
    model: "deepseek-chat",
    streamingEnabled: true,
    historyMode: "summary-compaction(120)",
    contextCompactionStatus: "summary-only",
    output,
  })

  monitor.noteOutgoingMessage({
    sessionId: "c1",
    text: "第一行\n\n第二行",
  })

  await new Promise((resolve) => setTimeout(resolve, 5))

  assert.equal(monitor.getSnapshot().chatTail[0]?.text, "第一行\n\n第二行")

  monitor.close()
})

test("runtime monitor does not aggressively truncate normal chat content", async () => {
  const output = {
    isTTY: true,
    columns: 100,
    rows: 18,
    write() {
      return true
    },
  }

  const monitor = createRuntimeMonitor({
    provider: "openai_compatible",
    model: "deepseek-chat",
    streamingEnabled: true,
    historyMode: "summary-compaction(120)",
    contextCompactionStatus: "summary-only",
    output,
  })

  const longText = Array.from({ length: 40 }, (_, index) => `条目-${index + 1}`).join(" | ")
  monitor.noteOutgoingMessage({
    sessionId: "c1",
    text: longText,
  })

  await new Promise((resolve) => setTimeout(resolve, 5))

  assert.equal(monitor.getSnapshot().chatTail[0]?.text, longText)

  monitor.close()
})
