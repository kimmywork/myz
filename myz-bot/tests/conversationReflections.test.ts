import { test } from "node:test"
import assert from "node:assert/strict"
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { BotRuntimeConfig } from "../src/config"
import { ensureConversationDir } from "../src/conversations"
import {
  loadConversationReflectionState,
  processConversationReflectionPass,
} from "../src/conversationReflections"
import { listSoulDrafts } from "../src/soul"
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
      adminUsers: [],
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
      maxHistoryMessages: 120,
      maxHistoryChars: 120000,
      compressionThreshold: 160,
      compressionCooldownMs: 300000,
      summaryMaxMessages: 20,
      summaryMaxChars: 6000,
    },
    soul: {
      autoDraft: true,
      autoApply: false,
      reviewRequired: true,
      autoDraftMessageInterval: 12,
      autoDraftTimeIntervalMs: 1000,
      growthFeedbackBatchMessageInterval: 12,
      growthFeedbackTimeIntervalMs: 1000,
      relationshipReflectionMessageInterval: 12,
      relationshipReflectionTimeIntervalMs: 1000,
    },
    skillSources: [],
    skillAllowlist: [],
    skillDenylist: [],
    toolAllowlist: [],
    toolDenylist: [],
  }
}

test("processConversationReflectionPass triggers time-based reflections once and advances offsets", async () => {
  const root = mkdtempSync(join(tmpdir(), "myz-bot-reflections-"))
  writeFileSync(join(root, "SOUL.md"), "# Bot\n温柔、可靠。")
  const config = createConfig(root)
  const conversationDir = ensureConversationDir(config.conversationsDir, "c1")
  recordIncomingTelegramMessage({
    conversationDir,
    conversationId: "c1",
    kind: "conversation",
    message: {
      message_id: 101,
      date: Date.parse("2026-03-12T00:00:00.000Z") / 1000,
      text: "你刚才那样说我觉得很贴心。",
      chat: { id: 101, type: "private" },
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
        text: "那我以后会更注意照顾你的感受。",
        chat: { id: 101, type: "private" },
        from: { id: 999, username: "testbot" },
      },
    ],
  })

  let growthCalls = 0
  let relationshipCalls = 0
  let draftCalls = 0
  const first = await processConversationReflectionPass({
    config,
    conversationId: "c1",
    conversationDir,
    identity: {
      actorUserId: 7,
      chatId: 101,
      username: "alice",
      firstName: "Alice",
      displayName: "Alice (@alice)",
      scope: "private",
    },
    actor: "auto",
    now: new Date("2026-03-12T00:30:00.000Z"),
    createGrowthCompletion: async () => {
      growthCalls += 1
      return JSON.stringify({
        shouldRecord: true,
        tone: "positive",
        feedbackSummary: "用户认可 bot 很贴心。",
        assistantSummary: "bot 表现得更温柔体贴。",
        adjustments: [{ trait: "warmth", delta: 0.8, reason: "被认可体贴感" }],
      })
    },
    createRelationshipCompletion: async () => {
      relationshipCalls += 1
      return JSON.stringify({
        shouldUpdate: true,
        relationshipSummary: "双方正形成更稳定的信任感。",
        impressionSummary: "用户会明确表达喜欢的互动风格。",
        aliases: ["Alice"],
        messagingPolicy: "allowed",
      })
    },
    createChronicleCompletion: async () =>
      [
        "# Chat Chronicle",
        "",
        "## 长期脉络",
        "- 双方正在形成更稳定的信任感。",
        "",
        "## 近期阶段",
        "- 用户认可 bot 的贴心表达，bot 也顺势回应会更照顾对方感受。",
      ].join("\n"),
    createDraftContent: async () => {
      draftCalls += 1
      return "# Bot\n更温柔，也更会照顾对方感受。"
    },
  })

  assert.equal(first.growth.triggered, true)
  assert.equal(first.growth.trigger, "time")
  assert.equal(first.growth.recorded, true)
  assert.equal(first.relationship.triggered, true)
  assert.equal(first.relationship.trigger, "time")
  assert.equal(first.relationship.updated, true)
  assert.equal(first.autoDraft.triggered, true)
  assert.equal(first.autoDraft.trigger, "time")
  assert.equal(first.autoDraft.applied, false)
  assert.equal(first.chronicle.updated, true)
  assert.equal(listSoulDrafts(root).length, 1)

  const chronicle = readFileSync(
    join(conversationDir, "context", "chat-chronicle.md"),
    "utf-8",
  )
  assert.match(chronicle, /# Chat Chronicle/)
  assert.match(chronicle, /长期脉络/)

  const state = loadConversationReflectionState(conversationDir)
  assert.equal(state.growth.lastProcessedTelegramMessageId, 102)
  assert.equal(state.relationship.lastProcessedTelegramMessageId, 102)
  assert.equal(state.autoDraft.lastProcessedTelegramMessageId, 102)
  assert.equal(state.chronicle.lastProcessedTelegramMessageId, 102)

  const second = await processConversationReflectionPass({
    config,
    conversationId: "c1",
    conversationDir,
    identity: {
      actorUserId: 7,
      chatId: 101,
      username: "alice",
      firstName: "Alice",
      displayName: "Alice (@alice)",
      scope: "private",
    },
    actor: "auto",
    now: new Date("2026-03-12T01:00:00.000Z"),
    createGrowthCompletion: async () => {
      growthCalls += 1
      return ""
    },
    createRelationshipCompletion: async () => {
      relationshipCalls += 1
      return ""
    },
    createChronicleCompletion: async () => "",
    createDraftContent: async () => {
      draftCalls += 1
      return ""
    },
  })

  assert.equal(second.growth.triggered, false)
  assert.equal(second.relationship.triggered, false)
  assert.equal(second.autoDraft.triggered, false)
  assert.equal(second.chronicle.updated, false)
  assert.equal(growthCalls, 1)
  assert.equal(relationshipCalls, 1)
  assert.equal(draftCalls, 1)
})

test("processConversationReflectionPass serializes concurrent runs for the same conversation", async () => {
  const root = mkdtempSync(join(tmpdir(), "myz-bot-reflections-"))
  writeFileSync(join(root, "SOUL.md"), "# Bot\n温柔、可靠。")
  const config = createConfig(root)
  config.soul.autoDraft = true
  config.soul.autoApply = false
  config.soul.autoDraftMessageInterval = 2
  config.soul.growthFeedbackBatchMessageInterval = 2
  config.soul.relationshipReflectionMessageInterval = 2

  const conversationDir = ensureConversationDir(config.conversationsDir, "c1")
  recordIncomingTelegramMessage({
    conversationDir,
    conversationId: "c1",
    kind: "conversation",
    message: {
      message_id: 101,
      date: Date.parse("2026-03-12T00:00:00.000Z") / 1000,
      text: "你这样说我会很开心。",
      chat: { id: 101, type: "private" },
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
        text: "那我会继续这样陪着你。",
        chat: { id: 101, type: "private" },
        from: { id: 999, username: "testbot" },
      },
    ],
  })

  let growthCalls = 0
  let relationshipCalls = 0
  let draftCalls = 0
  const delay = () => new Promise((resolve) => setTimeout(resolve, 20))
  const run = () =>
    processConversationReflectionPass({
      config,
      conversationId: "c1",
      conversationDir,
      identity: {
        actorUserId: 7,
        chatId: 101,
        username: "alice",
        firstName: "Alice",
        displayName: "Alice (@alice)",
        scope: "private",
      },
      actor: "auto",
      now: new Date("2026-03-12T00:30:00.000Z"),
      createGrowthCompletion: async () => {
        growthCalls += 1
        await delay()
        return JSON.stringify({
          shouldRecord: true,
          tone: "positive",
          feedbackSummary: "用户认可当前互动。",
          assistantSummary: "assistant 更柔和地接住了用户。",
          adjustments: [{ trait: "warmth", delta: 0.5, reason: "正向反馈" }],
        })
      },
      createRelationshipCompletion: async () => {
        relationshipCalls += 1
        await delay()
        return JSON.stringify({
          shouldUpdate: true,
          relationshipSummary: "双方关系更轻松稳定。",
          impressionSummary: "用户接受柔和互动。",
          aliases: ["Alice"],
          messagingPolicy: "allowed",
        })
      },
      createChronicleCompletion: async () => "# Chat Chronicle\n\n- 关系更稳定。",
      createDraftContent: async () => {
        draftCalls += 1
        await delay()
        return [
          "# Bot",
          "",
          "## 名字与身份",
          "我是 Kimi。",
          "",
          "## 角色成长状态",
          "- 这段不该再沉积进基础 SOUL。",
        ].join("\n")
      },
    })

  const [first, second] = await Promise.all([run(), run()])

  assert.equal(first.growth.triggered, true)
  assert.equal(second.growth.triggered, false)
  assert.equal(first.relationship.triggered, true)
  assert.equal(second.relationship.triggered, false)
  assert.equal(first.autoDraft.triggered, true)
  assert.equal(second.autoDraft.triggered, false)
  assert.equal(growthCalls, 1)
  assert.equal(relationshipCalls, 1)
  assert.equal(draftCalls, 1)
  assert.equal(listSoulDrafts(root).length, 1)

  const draft = readFileSync(listSoulDrafts(root)[0]!.path, "utf-8")
  assert.doesNotMatch(draft, /角色成长状态/)
})
