import { test } from "node:test"
import assert from "node:assert/strict"
import {
  authorizeMessage,
  evaluateMessageHandling,
  shouldRespondToMessage,
} from "../src/permissions"
import type { BotRuntimeConfig } from "../src/config"
import type { TelegramMessage } from "../src/telegram"

function createConfig(): BotRuntimeConfig {
  return {
    telegram: {
      username: "testbot",
      token: "token",
      timeoutSeconds: 25,
      allowedUsers: ["alice", "1001"],
      allowedChats: [1, 2],
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
    workspaceRoot: "/tmp/workspace",
    skillsDir: "/tmp/workspace/.myz/skills",
    skills: {
      sources: [],
      allowlist: [],
      denylist: [],
    },
    tools: {
      allowlist: [],
      denylist: [],
    },
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

function createMessage(overrides: Partial<TelegramMessage> = {}): TelegramMessage {
  return {
    message_id: 1,
    date: Date.now(),
    text: "hello @testbot",
    chat: {
      id: 1,
      type: "group",
    },
    from: {
      id: 1001,
      username: "alice",
    },
    ...overrides,
  }
}

test("authorizeMessage rejects unlisted users", () => {
  const config = createConfig()
  const result = authorizeMessage(
    config,
    createMessage({
      from: {
        id: 9999,
        username: "unknown",
      },
    }),
  )
  assert.equal(result.ok, false)
})

test("shouldRespondToMessage requires mention in groups", () => {
  const config = createConfig()
  const result = shouldRespondToMessage(
    config,
    createMessage({
      text: "hello everyone",
    }),
    "testbot",
  )
  assert.equal(result, false)
})

test("shouldRespondToMessage allows admin command without mention", () => {
  const config = createConfig()
  const result = shouldRespondToMessage(
    config,
    createMessage({
      text: "/soul draft",
      from: {
        id: 7,
        username: "admin",
      },
    }),
    "testbot",
  )
  assert.equal(result, true)
})

test("shouldRespondToMessage accepts all group messages when mention gate is disabled", () => {
  const config = createConfig()
  config.telegram.groupResponseMode.onlyWhenMentioned = false
  const handling = evaluateMessageHandling(
    config,
    createMessage({
      text: "hello everyone",
    }),
    "testbot",
  )
  assert.equal(handling.shouldProcess, true)
  assert.equal(handling.shouldReply, false)

  const result = shouldRespondToMessage(
    config,
    createMessage({
      text: "hello everyone",
    }),
    "testbot",
  )
  assert.equal(result, false)
})

test("evaluateMessageHandling still replies to mentions when mention gate is disabled", () => {
  const config = createConfig()
  config.telegram.groupResponseMode.onlyWhenMentioned = false
  const handling = evaluateMessageHandling(
    config,
    createMessage({
      text: "hello @testbot",
    }),
    "testbot",
  )
  assert.equal(handling.shouldProcess, true)
  assert.equal(handling.shouldReply, true)
})

test("evaluateMessageHandling still replies to admin commands when mention gate is disabled", () => {
  const config = createConfig()
  config.telegram.groupResponseMode.onlyWhenMentioned = false
  const handling = evaluateMessageHandling(
    config,
    createMessage({
      text: "/soul draft",
      from: {
        id: 7,
        username: "admin",
      },
    }),
    "testbot",
  )
  assert.equal(handling.shouldProcess, true)
  assert.equal(handling.shouldReply, true)
})
