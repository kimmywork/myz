import { test } from "node:test"
import assert from "node:assert/strict"
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { BotRuntimeConfig } from "../src/config"
import { createRuntimeConfig } from "./helpers/runtimeConfig"
import { ensureConversationDir } from "../src/conversations"
import {
  __resetRestartStateForTest,
  __setRestartExitHandlerForTest,
  collectTokenUsageSummary,
  formatTokenUsageSummary,
  getBotRuntimeStatus,
  requestProcessRestart,
  resetAllMemory,
  resetConversationMemory,
  runHousekeeping,
} from "../src/maintenance"
import {
  createElevatedPermissionRequest,
} from "../src/elevatedPermissions"
import {
  addMemory,
  ensureMemoryDir,
  loadMemoryIndex,
  saveConversationSummary,
} from "../src/memory"
import { createScheduledTask } from "../src/tasks"

function listDailyLogs(memoryDir: string) {
  return readdirSync(memoryDir).filter((name) => /^\d{4}-\d{2}-\d{2}\.md$/.test(name))
}

function createConfig(root: string): BotRuntimeConfig {
  return createRuntimeConfig(root, {
    telegram: {
      adminUsers: ["admin"],
    } as BotRuntimeConfig["telegram"],
  })
}

function writeJsonl(path: string, entries: unknown[]) {
  writeFileSync(
    path,
    entries.length ? `${entries.map((entry) => JSON.stringify(entry)).join("\n")}\n` : "",
  )
}

test("collectTokenUsageSummary aggregates live and archived llm usage", () => {
  const root = mkdtempSync(join(tmpdir(), "myz-bot-maintenance-"))
  const config = createConfig(root)
  const c1Dir = ensureConversationDir(config.conversationsDir, "c1")
  const c2Dir = ensureConversationDir(config.conversationsDir, "c2")
  mkdirSync(join(c1Dir, "context", "archive"), { recursive: true })

  writeJsonl(join(c1Dir, "llm-history.jsonl"), [
    {
      id: "m1",
      conversationId: "c1",
      role: "assistant",
      content: "reply 1",
      timestamp: new Date().toISOString(),
      metadata: {
        toolCallCount: 1,
        providerPreviousResponseId: "resp-prev",
        usage: {
          total_tokens: 10,
          prompt_tokens: 6,
          completion_tokens: 4,
        },
      },
    },
  ])
  writeJsonl(join(c1Dir, "context", "archive", "ops-llm-history-1.jsonl"), [
    {
      id: "m2",
      conversationId: "c1",
      role: "assistant",
      content: "reply 2",
      timestamp: new Date().toISOString(),
      metadata: {
        toolCallCount: 2,
        usage: {
          totalTokens: 20,
          promptTokens: 12,
          completionTokens: 8,
          reasoningTokens: 3,
          cachedPromptTokens: 5,
        },
      },
    },
  ])
  writeJsonl(join(c2Dir, "llm-history.jsonl"), [
    {
      id: "m3",
      conversationId: "c2",
      role: "assistant",
      content: "reply 3",
      timestamp: new Date().toISOString(),
      metadata: {
        toolCallCount: 0,
        usage: {
          total_tokens: 5,
          prompt_tokens: 3,
          completion_tokens: 2,
        },
      },
    },
  ])

  const current = collectTokenUsageSummary({
    config,
    scope: "current",
    conversationId: "c1",
  })
  assert.equal(current.totalTokens, 30)
  assert.equal(current.promptTokens, 18)
  assert.equal(current.completionTokens, 12)
  assert.equal(current.reasoningTokens, 3)
  assert.equal(current.cachedPromptTokens, 5)
  assert.equal(current.toolCallCount, 3)
  assert.equal(current.resumedReplies, 1)
  assert.equal(current.cacheHitReplies, 1)
  assert.equal(current.byConversation.length, 1)

  const all = collectTokenUsageSummary({
    config,
    scope: "all",
  })
  assert.equal(all.totalTokens, 35)
  assert.equal(all.cachedPromptTokens, 5)
  assert.equal(all.resumedReplies, 1)
  assert.equal(all.cacheHitReplies, 1)
  assert.equal(all.byConversation[0]?.conversationId, "c1")
  assert.equal(all.byConversation[1]?.conversationId, "c2")
})

test("collectTokenUsageSummary understands responses-style input/output token fields", () => {
  const root = mkdtempSync(join(tmpdir(), "myz-bot-maintenance-"))
  const config = createConfig(root)
  const c1Dir = ensureConversationDir(config.conversationsDir, "c1")

  writeJsonl(join(c1Dir, "llm-history.jsonl"), [
    {
      id: "m1",
      conversationId: "c1",
      role: "assistant",
      content: "reply 1",
      timestamp: new Date().toISOString(),
      metadata: {
        toolCallCount: 0,
        providerPreviousResponseId: "resp-prev",
        usage: {
          total_tokens: 90,
          input_tokens: 60,
          output_tokens: 30,
          input_tokens_details: {
            cached_tokens: 40,
          },
          output_tokens_details: {
            reasoning_tokens: 12,
          },
        },
      },
    },
  ])

  const summary = collectTokenUsageSummary({
    config,
    scope: "current",
    conversationId: "c1",
  })

  assert.equal(summary.totalTokens, 90)
  assert.equal(summary.promptTokens, 60)
  assert.equal(summary.cachedPromptTokens, 40)
  assert.equal(summary.completionTokens, 30)
  assert.equal(summary.reasoningTokens, 12)
  assert.equal(summary.resumedReplies, 1)
  assert.equal(summary.cacheHitReplies, 1)
  assert.match(formatTokenUsageSummary(summary), /resumedReplies: 1/)
  assert.match(formatTokenUsageSummary(summary), /cacheHitReplies: 1/)
  assert.match(formatTokenUsageSummary(summary), /cachedPromptTokens: 40/)
  assert.match(formatTokenUsageSummary(summary), /cached=40/)
  assert.match(formatTokenUsageSummary(summary), /resumed=1/)
  assert.match(formatTokenUsageSummary(summary), /cacheHits=1/)
})

test("resetConversationMemory removes only current conversation bound memories", () => {
  const root = mkdtempSync(join(tmpdir(), "myz-bot-maintenance-"))
  const memoryDir = join(root, "memory")
  ensureMemoryDir(memoryDir)

  const current = addMemory(memoryDir, {
    title: "Current",
    content: "current conversation memory",
    tags: ["auto-memory", "conversation:c1"],
  })
  const other = addMemory(memoryDir, {
    title: "Other",
    content: "other conversation memory",
    tags: ["auto-memory", "conversation:c2"],
  })
  saveConversationSummary(memoryDir, "c1", "summary 1")
  saveConversationSummary(memoryDir, "c2", "summary 2")

  const result = resetConversationMemory({
    memoryDir,
    conversationId: "c1",
  })
  assert.equal(result.removedItems, 1)
  assert.equal(result.removedNotes, 1)
  assert.equal(result.removedSummaries, 1)
  assert.equal(result.clearedLongTermMemory, false)
  assert.equal(readFileSync(current.file, "utf-8").includes("Current"), false)
  assert.equal(existsSync(other.file), true)
  const remainingLog = readFileSync(other.file, "utf-8")
  assert.equal(remainingLog.includes("会话摘要 c1"), false)
  assert.equal(remainingLog.includes("会话摘要 c2"), true)
  assert.equal(loadMemoryIndex(memoryDir).length, 1)
})

test("resetAllMemory clears daily logs and derived memory index", () => {
  const root = mkdtempSync(join(tmpdir(), "myz-bot-maintenance-"))
  const memoryDir = join(root, "memory")
  ensureMemoryDir(memoryDir)

  addMemory(memoryDir, {
    title: "One",
    content: "one",
    tags: ["conversation:c1"],
  })
  addMemory(memoryDir, {
    title: "Two",
    content: "two",
    tags: ["conversation:c2"],
  })
  saveConversationSummary(memoryDir, "c1", "summary 1")
  saveConversationSummary(memoryDir, "c2", "summary 2")

  const result = resetAllMemory({
    memoryDir,
  })
  assert.equal(result.removedItems, 2)
  assert.equal(result.clearedLongTermMemory, false)
  assert.equal(loadMemoryIndex(memoryDir).length, 0)
  assert.equal(listDailyLogs(memoryDir).length, 0)
  assert.equal(existsSync(join(memoryDir, "MEMORY.md")), true)
})

test("resetAllMemory can also clear long-term MEMORY.md", () => {
  const root = mkdtempSync(join(tmpdir(), "myz-bot-maintenance-"))
  const memoryDir = join(root, "memory")
  ensureMemoryDir(memoryDir)
  writeFileSync(join(memoryDir, "MEMORY.md"), "# MEMORY.md\n\n- 长期偏好：保持简洁。\n")
  addMemory(memoryDir, {
    title: "One",
    content: "one",
    tags: ["conversation:c1"],
  })

  const result = resetAllMemory({
    memoryDir,
    includeLongTerm: true,
  })

  assert.equal(result.clearedLongTermMemory, true)
  assert.equal(listDailyLogs(memoryDir).length, 0)
  assert.equal(
    readFileSync(join(memoryDir, "MEMORY.md"), "utf-8"),
    "# MEMORY.md\n\n这里记录长期稳定记忆。\n",
  )
})

test("resetConversationMemory rejects clearing long-term memory in current scope", () => {
  const root = mkdtempSync(join(tmpdir(), "myz-bot-maintenance-"))
  const memoryDir = join(root, "memory")
  ensureMemoryDir(memoryDir)

  assert.throws(
    () =>
      resetConversationMemory({
        memoryDir,
        conversationId: "c1",
        includeLongTerm: true,
      }),
    /current scope 不允许清空全局长期记忆/,
  )
})

test("runHousekeeping archives live llm files and resets recovered context", () => {
  const root = mkdtempSync(join(tmpdir(), "myz-bot-maintenance-"))
  const config = createConfig(root)
  const conversationDir = ensureConversationDir(config.conversationsDir, "c1")
  mkdirSync(join(conversationDir, "context"), { recursive: true })
  writeJsonl(join(conversationDir, "llm-history.jsonl"), [
    {
      id: "m1",
      conversationId: "c1",
      role: "assistant",
      content: "reply 1",
      timestamp: new Date().toISOString(),
    },
  ])
  writeJsonl(join(conversationDir, "llm-trace.jsonl"), [
    {
      id: "t1",
      conversationId: "c1",
      role: "tool",
      content: "trace 1",
      timestamp: new Date().toISOString(),
    },
  ])
  writeFileSync(
    join(conversationDir, "context", "recovered-context.json"),
    JSON.stringify({
      schemaVersion: "1.0.0",
      recoveredContext: "old",
    }),
  )

  const result = runHousekeeping({
    conversationsDir: config.conversationsDir,
    scope: "current",
    conversationId: "c1",
  })

  assert.equal(result.conversations, 1)
  assert.equal(result.archivedHistoryFiles, 1)
  assert.equal(result.archivedTraceFiles, 1)
  assert.equal(readFileSync(join(conversationDir, "llm-history.jsonl"), "utf-8"), "")
  assert.equal(readFileSync(join(conversationDir, "llm-trace.jsonl"), "utf-8"), "")

  const archiveEntries = readdirSync(join(conversationDir, "context", "archive"))
  assert.equal(archiveEntries.some((name) => /ops-llm-history/.test(name)), true)
  assert.equal(archiveEntries.some((name) => /ops-llm-trace/.test(name)), true)

  const recoveredContext = JSON.parse(
    readFileSync(join(conversationDir, "context", "recovered-context.json"), "utf-8"),
  ) as { recoveredContext?: string; schemaVersion?: string }
  assert.equal(recoveredContext.schemaVersion, "1.0.0")
  assert.equal(recoveredContext.recoveredContext, undefined)
})

test("getBotRuntimeStatus reports conversations, memory, permissions, and active tasks", () => {
  const root = mkdtempSync(join(tmpdir(), "myz-bot-maintenance-"))
  const config = createConfig(root)
  ensureMemoryDir(config.memoryDir)
  addMemory(config.memoryDir, {
    title: "One",
    content: "memory",
    tags: ["conversation:c1"],
  })
  createElevatedPermissionRequest({
    workspaceRoot: config.workspaceRuntimeRoot,
    access: "read",
    targetPath: join(root, "secret.txt"),
    rawTarget: join(root, "secret.txt"),
    toolName: "Read",
    reason: "test",
    conversationId: "c1",
  })
  const conversationDir = ensureConversationDir(config.conversationsDir, "c1")
  createScheduledTask({
    conversationDir,
    conversationId: "c1",
    title: "Pending",
    dueAt: new Date(Date.now() + 60_000).toISOString(),
  })

  const status = getBotRuntimeStatus(config)
  assert.equal(status.conversations, 1)
  assert.equal(status.memoryItems, 1)
  assert.equal(status.pendingPermissionRequests, 1)
  assert.equal(status.activeTasks, 1)
  assert.equal(status.schedulerEnabled, true)
})

test("requestProcessRestart schedules a single exit request", async () => {
  const exitCodes: number[] = []
  const root = mkdtempSync(join(tmpdir(), "myz-bot-restart-"))
  const requestFilePath = join(root, "system", "restart-request.json")
  __resetRestartStateForTest()
  __setRestartExitHandlerForTest((exitCode) => {
    exitCodes.push(exitCode)
  })

  assert.equal(
    requestProcessRestart({
      delayMs: 0,
      exitCode: 91,
      requestFilePath,
      reason: "ops_restart",
      requestedBy: "admin",
    }),
    true,
  )
  assert.equal(requestProcessRestart({ delayMs: 0, exitCode: 92 }), false)

  await new Promise((resolvePromise) => setTimeout(resolvePromise, 5))

  assert.deepEqual(exitCodes, [91])
  assert.equal(existsSync(requestFilePath), true)
  const request = JSON.parse(readFileSync(requestFilePath, "utf-8")) as {
    reason?: string
    requestedBy?: string
    exitCode?: number
  }
  assert.equal(request.reason, "ops_restart")
  assert.equal(request.requestedBy, "admin")
  assert.equal(request.exitCode, 91)
  __setRestartExitHandlerForTest(null)
  __resetRestartStateForTest()
})
