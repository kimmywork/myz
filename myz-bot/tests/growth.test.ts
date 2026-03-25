import { test } from "node:test"
import assert from "node:assert/strict"
import { existsSync, mkdtempSync, readdirSync, readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  analyzeSoulGrowthFeedback,
  countGrowthVisibleMessages,
  inferSoulGrowthBaseProfile,
  loadSoulGrowthState,
  parseGrowthAnalysisResponse,
  recordSoulGrowthFeedback,
  renderSoulGrowthContext,
  shouldTriggerSoulGrowthFeedbackBatch,
} from "../src/growth"
import type { Message } from "@myz/ai-core/types"
import type { BotRuntimeConfig } from "../src/config"

const SOUL = [
  "# 星乃綺美",
  "可爱，俏皮，活泼。主动与他人沟通获取信息，喜欢通过对话来理解和解决问题。",
  "偏简洁、清晰、自然对话风格，必要时会礼貌解释原因。",
].join("\n")

function createConfig(): BotRuntimeConfig {
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
    workspaceRoot: "/tmp/workspace",
    skillsDir: "/tmp/workspace/.myz/skills",
    skills: { sources: [], allowlist: [], denylist: [] },
    tools: { allowlist: [], denylist: [] },
    conversationsDir: "/tmp/workspace/conversations",
    memoryDir: "/tmp/workspace/memory",
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

test("inferSoulGrowthBaseProfile reflects current soul bias", () => {
  const profile = inferSoulGrowthBaseProfile(SOUL)
  assert.ok(profile.playfulness > 0)
  assert.ok(profile.initiative > 0)
})

test("parseGrowthAnalysisResponse accepts json wrapped in fences", () => {
  const event = parseGrowthAnalysisResponse([
    "```json",
    '{"shouldRecord":true,"tone":"positive","feedbackSummary":"用户认可 bot 很懂自己","assistantSummary":"回复让用户感到被理解","adjustments":[{"trait":"warmth","delta":0.9,"reason":"用户认可体贴感"}]}',
    "```",
  ].join("\n"))
  assert.ok(event)
  assert.equal(event.tone, "positive")
  assert.equal(event.adjustments.length, 1)
  assert.equal(event.feedbackSummary, "用户认可 bot 很懂自己")
})

function createTranscript(messages: Array<Partial<Message>>): Message[] {
  return messages.map((message, index) => ({
    schemaVersion: "1.0.0",
    id: `m-${index + 1}`,
    conversationId: "c1",
    role: "user",
    content: "",
    timestamp: new Date(1_700_000_000_000 + index * 1000).toISOString(),
    ...message,
  }))
}

test("shouldTriggerSoulGrowthFeedbackBatch ignores tool traces and uses visible messages", () => {
  const messages = createTranscript([
    { role: "user", content: "u1" },
    { role: "assistant", content: "a1" },
    { role: "assistant", content: "定时提醒", metadata: { type: "scheduled_task_reply" } },
    { role: "assistant", content: "", metadata: { type: "tool_audit" } },
    { role: "tool", content: "t1" },
    { role: "user", content: "u2" },
    { role: "assistant", content: "a2" },
  ])
  assert.equal(countGrowthVisibleMessages(messages), 4)
  assert.equal(shouldTriggerSoulGrowthFeedbackBatch(messages, 4), true)
})

test("analyzeSoulGrowthFeedback uses llm result on a transcript batch", async () => {
  const event = await analyzeSoulGrowthFeedback({
    config: createConfig(),
    soul: SOUL,
    conversationId: "c1",
    messages: createTranscript([
      { role: "assistant", content: "我会把这些小习惯替你对齐好。" },
      { role: "user", content: "你太懂我了，开心" },
    ]),
    createCompletion: async () =>
      JSON.stringify({
        shouldRecord: true,
        tone: "positive",
        feedbackSummary: "用户觉得 bot 很懂自己",
        assistantSummary: "bot 会主动对齐用户习惯",
        adjustments: [
          { trait: "warmth", delta: 0.8, reason: "用户感到被理解和照顾" },
          { trait: "initiative", delta: 0.4, reason: "用户认可主动对齐偏好" },
        ],
      }),
  })
  assert.ok(event)
  assert.equal(event?.tone, "positive")
  assert.equal(event?.adjustments.length, 2)
})

test("recordSoulGrowthFeedback persists gradual growth and exposes context", async () => {
  const workspaceRoot = mkdtempSync(join(tmpdir(), "myz-bot-growth-"))

  const first = await recordSoulGrowthFeedback({
    config: createConfig(),
    workspaceRoot,
    soul: SOUL,
    conversationId: "c1",
    messages: createTranscript([
      { role: "assistant", content: "好呀，我可以继续帮你处理，下一步我来整理。" },
      { role: "user", content: "辛苦啦，给你点赞！" },
    ]),
    createCompletion: async () =>
      JSON.stringify({
        shouldRecord: true,
        tone: "positive",
        feedbackSummary: "用户感谢 bot 的体贴和轻松语气",
        assistantSummary: "bot 主动接手下一步并保持轻松回应",
        adjustments: [
          { trait: "warmth", delta: 0.8, reason: "用户认可体贴和回应感" },
          { trait: "playfulness", delta: 0.5, reason: "用户认可轻松语气" },
        ],
      }),
  })
  assert.ok(first)

  const second = await recordSoulGrowthFeedback({
    config: createConfig(),
    workspaceRoot,
    soul: SOUL,
    conversationId: "c1",
    messages: createTranscript([
      { role: "assistant", content: "我在呢，需要的话我继续帮你。" },
      { role: "user", content: "以后可以再温柔一点，也更主动一点。" },
    ]),
    createCompletion: async () =>
      JSON.stringify({
        shouldRecord: true,
        tone: "directive",
        feedbackSummary: "用户希望 bot 更温柔也更主动",
        assistantSummary: "bot 当前已经有陪伴感，但还可以更进一步",
        adjustments: [
          { trait: "warmth", delta: 1.1, reason: "用户要求更温柔" },
          { trait: "initiative", delta: 1.0, reason: "用户要求更主动" },
        ],
      }),
  })
  assert.ok(second)

  const state = loadSoulGrowthState(workspaceRoot)
  assert.ok(state.recentEvents.length >= 2)
  assert.ok(Math.abs(state.traits.warmth.offset) > 0)

  const context = renderSoulGrowthContext(workspaceRoot, SOUL)
  assert.match(context, /角色成长状态/)
  assert.match(context, /成长边界/)
  assert.match(context, /最近反馈/)
})

test("growth event log archives older entries while keeping recent ones", async () => {
  const workspaceRoot = mkdtempSync(join(tmpdir(), "myz-bot-growth-"))
  const config = createConfig()

  for (let index = 0; index < 205; index += 1) {
    await recordSoulGrowthFeedback({
      config,
      workspaceRoot,
      soul: SOUL,
      conversationId: `c${index}`,
      messages: createTranscript([
        { role: "assistant", content: "我会继续陪你处理。" },
        { role: "user", content: `这次第 ${index + 1} 次，我觉得你更贴心一点。` },
      ]),
      createCompletion: async () =>
        JSON.stringify({
          shouldRecord: true,
          tone: "positive",
          feedbackSummary: `用户认可第 ${index + 1} 次贴心表达`,
          assistantSummary: "bot 的照顾感被认可",
          adjustments: [
            { trait: "warmth", delta: 0.4, reason: "正向认可体贴感" },
          ],
        }),
    })
  }

  const eventFile = join(workspaceRoot, "soul", "growth-events.jsonl")
  const archiveDir = join(workspaceRoot, "soul", "archive")
  const activeLines = readFileSync(eventFile, "utf-8").trim().split(/\r?\n/).filter(Boolean)

  assert.equal(activeLines.length, 200)
  assert.equal(existsSync(archiveDir), true)
  assert.ok(
    readdirSync(archiveDir).some((name) => name.startsWith("growth-events-") && name.endsWith(".jsonl")),
  )
})
