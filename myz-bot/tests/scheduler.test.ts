import { test } from "node:test"
import assert from "node:assert/strict"
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { BotRuntimeConfig } from "../src/config"
import {
  ensureConversationDir,
  saveMetadata,
} from "../src/conversations"
import {
  processConversationReflectionPass,
} from "../src/conversationReflections"
import {
  processDueConversationReflections,
  processDueScheduledTasks,
} from "../src/scheduler"
import { listSoulDrafts } from "../src/soul"
import { createScheduledTask, listConversationTasks } from "../src/tasks"
import {
  recordIncomingTelegramMessage,
  recordOutgoingTelegramMessages,
} from "../src/telegramHistory"

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
      failureRetryBaseDelayMs: 1000,
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
      autoDraft: false,
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

test("processDueScheduledTasks sends direct reminders and marks task triggered", async () => {
  const root = mkdtempSync(join(tmpdir(), "myz-bot-scheduler-"))
  const config = createConfig(root)
  const conversationDir = ensureConversationDir(config.conversationsDir, "c1")
  saveMetadata(conversationDir, {
    schemaVersion: "1.0.0",
    conversationId: "c1",
    chatId: 42,
    userId: 7,
    username: "admin",
    firstName: "A",
    lastName: "B",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  })

  const task = createScheduledTask({
    conversationDir,
    conversationId: "c1",
    title: "提醒查看日报",
    dueAt: new Date(Date.now() + 60_000).toISOString(),
    triggerMode: "direct",
    directReply: "这是你的日报提醒",
  })

  const tasksFile = join(conversationDir, "tasks.json")
  const parsed = JSON.parse(readFileSync(tasksFile, "utf-8")) as {
    tasks: Array<{ id: string; dueAt: string }>
  }
  parsed.tasks = parsed.tasks.map((entry) =>
    entry.id === task.id
      ? { ...entry, dueAt: new Date(Date.now() - 1_000).toISOString() }
      : entry,
  )
  writeFileSync(tasksFile, JSON.stringify(parsed, null, 2))

  const sent: Array<{ chatId: number; text: string; options?: Record<string, unknown> }> = []
  const telegram = {
    sendMessage: async (
      chatId: number,
      text: string,
      options?: Record<string, unknown>,
    ) => {
      sent.push({ chatId, text, options })
      return { ok: true }
    },
  } as any

  await processDueScheduledTasks({
    config,
    telegram,
  })

  assert.equal(sent.length, 1)
  assert.equal(sent[0]?.chatId, 42)
  assert.match(String(sent[0]?.text || ""), /日报提醒/)

  const tasks = listConversationTasks({
    conversationDir,
    conversationId: "c1",
  })
  assert.equal(tasks[0]?.status, "triggered")
})

test("processDueConversationReflections runs time-based catch-up once per conversation", async () => {
  const root = mkdtempSync(join(tmpdir(), "myz-bot-scheduler-"))
  writeFileSync(join(root, "SOUL.md"), "# Bot\n温柔、可靠。")
  const config = createConfig(root)
  config.soul.autoDraft = true
  config.soul.autoApply = false
  config.soul.autoDraftTimeIntervalMs = 1000
  config.soul.growthFeedbackTimeIntervalMs = 1000
  config.soul.relationshipReflectionTimeIntervalMs = 1000

  const conversationDir = ensureConversationDir(config.conversationsDir, "c1")
  saveMetadata(conversationDir, {
    schemaVersion: "1.0.0",
    conversationId: "c1",
    chatId: 42,
    userId: 7,
    scope: "private",
    chatType: "private",
    username: "alice",
    firstName: "Alice",
    lastName: "A",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    lastMessageAt: new Date().toISOString(),
  })
  recordIncomingTelegramMessage({
    conversationDir,
    conversationId: "c1",
    kind: "conversation",
    message: {
      message_id: 101,
      date: Date.parse("2026-03-12T00:00:00.000Z") / 1000,
      text: "你刚才那样说真的很贴心。",
      chat: { id: 42, type: "private" },
      from: { id: 7, username: "alice", first_name: "Alice" },
    },
  })
  recordOutgoingTelegramMessages({
    conversationDir,
    conversationId: "c1",
    kind: "conversation",
    sendResult: [
      {
        message_id: 102,
        date: Date.parse("2026-03-12T00:00:05.000Z") / 1000,
        text: "那我以后继续这样照顾你。",
        chat: { id: 42, type: "private" },
        from: { id: 1, username: "testbot" },
      },
    ],
  })

  const telegram = {
    sendMessage: async () => [],
    getUpdates: async () => [],
    getMe: async () => ({ id: 1, username: "testbot" }),
    getFile: async () => ({ file_id: "file" }),
    downloadFile: async () => new ArrayBuffer(0),
  }

  let growthCalls = 0
  let relationshipCalls = 0
  let draftCalls = 0
  const runReflectionPass: typeof processConversationReflectionPass = (options) =>
    processConversationReflectionPass({
      ...options,
      now: new Date("2026-03-12T00:30:00.000Z"),
      createGrowthCompletion: async () => {
        growthCalls += 1
        return JSON.stringify({
          shouldRecord: true,
          tone: "positive",
          feedbackSummary: "用户认可 bot 很贴心。",
          assistantSummary: "bot 表现得更温柔。",
          adjustments: [{ trait: "warmth", delta: 0.6, reason: "用户认可温柔度" }],
        })
      },
      createRelationshipCompletion: async () => {
        relationshipCalls += 1
        return JSON.stringify({
          shouldUpdate: true,
          relationshipSummary: "双方关系更亲近。",
          impressionSummary: "用户会明确给出正反馈。",
          aliases: ["Alice"],
          messagingPolicy: "allowed",
        })
      },
      createDraftContent: async () => {
        draftCalls += 1
        return "# Bot\n更温柔。"
      },
    })

  await processDueConversationReflections({
    config,
    telegram,
    processReflectionPass: runReflectionPass,
  })
  await processDueConversationReflections({
    config,
    telegram,
    processReflectionPass: runReflectionPass,
  })

  assert.equal(growthCalls, 1)
  assert.equal(relationshipCalls, 1)
  assert.equal(draftCalls, 1)
  assert.equal(listSoulDrafts(root).length, 1)
})
