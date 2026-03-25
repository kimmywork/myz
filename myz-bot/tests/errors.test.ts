import { test } from "node:test"
import assert from "node:assert/strict"
import { formatErrorReply } from "../src/errors"
import type { BotRuntimeConfig } from "../src/config"

function createConfig(): BotRuntimeConfig {
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

test("formatErrorReply includes stack for admins", () => {
  const config = createConfig()
  const error = new Error("boom")
  const reply = formatErrorReply({
    config,
    user: { id: 1, username: "admin" },
    error,
  })
  assert.match(reply, /boom/)
  assert.match(reply, /Error:/)
})

test("formatErrorReply hides stack for non-admins", () => {
  const config = createConfig()
  const reply = formatErrorReply({
    config,
    user: { id: 2, username: "user" },
    error: new Error("boom"),
  })
  assert.equal(reply, "处理失败，请稍后重试。")
})
