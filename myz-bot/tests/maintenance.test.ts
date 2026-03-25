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
import { ensureConversationDir } from "../src/conversations"
import {
  __resetRestartStateForTest,
  __setRestartExitHandlerForTest,
  collectTokenUsageSummary,
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

function createConfig(root: string): BotRuntimeConfig {
  return {
    telegram: {
      username: "testbot",
      token: "token",
      timeoutSeconds: 25,
      allowedUsers: [],
      allowedChats: [],
      adminUsers: ["admin"],
      saveIncomingMedia: true,
      groupResponseMode: {
        onlyWhenMentioned: true,
        allowReplyToBot: true,
        allowAdminCommands: true,
      },
      retry: {
        retries: 2,
        baseDelayMs: 800,
      },
    },
    network: {
      requestTimeoutMs: 180000,
      connectTimeoutMs: 10000,
      keepAliveTimeoutMs: 4000,
      keepAliveTimeoutThresholdMs: 2000,
      proxyUrl: "",
    },
    ai: {
      provider: "openai_compatible",
      baseUrl: "",
      accessToken: "",
      headers: {},
      model: "gpt-test",
      systemPromptInUserMessage: false,
      retry: {
        retries: 2,
        baseDelayMs: 1000,
      },
      capabilities: {
        toolCalling: true,
        reasoning: false,
        vision: false,
        imageOutput: false,
      },
      limits: {
        contextWindow: 8192,
        maxOutputTokens: 1024,
        maxOutputTokenParam: "max_tokens",
      },
      tooling: {
        toolChoice: "auto",
        strict: "auto",
        parallelToolCalls: "auto",
      },
    },
    mcpServers: [],
    workspaceRoot: root,
    skillsDir: join(root, ".myz/skills"),
    skills: { sources: [], allowlist: [], denylist: [] },
    tools: { allowlist: [], denylist: [] },
    conversationsDir: join(root, "conversations"),
    memoryDir: join(root, "memory"),
    scheduler: {
      enabled: true,
      pollIntervalMs: 15000,
      maxBatchSize: 20,
      failureRetryBaseDelayMs: 60000,
    },
    context: {
      maxHistoryMessages: 30,
      maxHistoryChars: 120000,
      compressionThreshold: 40,
      compressionCooldownMs: 300000,
      summaryMaxMessages: 12,
      summaryMaxChars: 6000,
    },
    soul: {
      autoDraft: true,
      autoApply: true,
      reviewRequired: true,
      autoDraftMessageInterval: 12,
      autoDraftTimeIntervalMs: 3600000,
      growthFeedbackBatchMessageInterval: 12,
      growthFeedbackTimeIntervalMs: 1800000,
      relationshipReflectionMessageInterval: 12,
      relationshipReflectionTimeIntervalMs: 1800000,
    },
    skillSources: [],
    skillAllowlist: [],
    skillDenylist: [],
    toolAllowlist: [],
    toolDenylist: [],
  }
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
  assert.equal(current.toolCallCount, 3)
  assert.equal(current.byConversation.length, 1)

  const all = collectTokenUsageSummary({
    config,
    scope: "all",
  })
  assert.equal(all.totalTokens, 35)
  assert.equal(all.byConversation[0]?.conversationId, "c1")
  assert.equal(all.byConversation[1]?.conversationId, "c2")
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

  const result = resetConversationMemory(memoryDir, "c1")
  assert.equal(result.removedItems, 1)
  assert.equal(result.removedNotes, 1)
  assert.equal(result.removedSummaries, 1)
  assert.equal(existsSync(current.file), false)
  assert.equal(existsSync(other.file), true)
  assert.equal(existsSync(join(memoryDir, "conversation-summaries", "c1.md")), false)
  assert.equal(existsSync(join(memoryDir, "conversation-summaries", "c2.md")), true)
  assert.equal(loadMemoryIndex(memoryDir).length, 1)
})

test("resetAllMemory clears notes, summaries, and index", () => {
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

  const result = resetAllMemory(memoryDir)
  assert.equal(result.removedItems, 2)
  assert.equal(loadMemoryIndex(memoryDir).length, 0)
  assert.equal(
    readdirSync(join(memoryDir, "conversation-summaries")).filter(Boolean).length,
    0,
  )
  assert.equal(readdirSync(join(memoryDir, "notes")).filter(Boolean).length, 0)
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
    workspaceRoot: config.workspaceRoot,
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
  __resetRestartStateForTest()
  __setRestartExitHandlerForTest((exitCode) => {
    exitCodes.push(exitCode)
  })

  assert.equal(requestProcessRestart({ delayMs: 0, exitCode: 91 }), true)
  assert.equal(requestProcessRestart({ delayMs: 0, exitCode: 92 }), false)

  await new Promise((resolvePromise) => setTimeout(resolvePromise, 5))

  assert.deepEqual(exitCodes, [91])
  __setRestartExitHandlerForTest(null)
  __resetRestartStateForTest()
})
