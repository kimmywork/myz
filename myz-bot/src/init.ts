import { existsSync, mkdirSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"
import { DEFAULT_SOUL, ensureSoulFile } from "./soul"
import {
  DEFAULT_AGENTS_TEMPLATE,
  DEFAULT_BOOTSTRAP_TEMPLATE,
} from "./workspaceTemplates"

const DEFAULT_BOT_YML = `telegram:
  username: "your_bot_username"
  token: "\${TELEGRAM_BOT_TOKEN}"
  timeoutSeconds: 25
  allowedUsers: []
  allowedChats: []
  adminUsers: []
  saveIncomingMedia: true
  groupResponseMode:
    onlyWhenMentioned: true
    allowReplyToBot: true
    allowAdminCommands: true
  retry:
    retries: 2
    baseDelayMs: 800

network:
  requestTimeoutMs: 180000
  connectTimeoutMs: 10000
  keepAliveTimeoutMs: 4000
  keepAliveTimeoutThresholdMs: 2000
  proxyUrl: ""

ai:
  provider: openai_compatible
  baseUrl: "https://api.openai.com/v1/chat/completions"
  accessToken: "\${OPENAI_API_KEY}"
  headers: {}
  model: "gpt-4o-mini"
  systemPromptInUserMessage: false
  retry:
    retries: 2
    baseDelayMs: 1000
  capabilities:
    toolCalling: true
    reasoning: false
    vision: false
    imageOutput: false
  limits:
    contextWindow: 8192
    maxOutputTokens: 1024
    maxOutputTokenParam: max_tokens
  tooling:
    toolChoice: auto
    strict: auto
    parallelToolCalls: auto

mcpServers: []
workspaceRoot: "."
skills:
  sources: []
  allowlist: []
  denylist: []
tools:
  allowlist: []
  denylist: []
scheduler:
  enabled: true
  pollIntervalMs: 15000
  maxBatchSize: 20
  failureRetryBaseDelayMs: 60000
context:
  maxHistoryMessages: 120
  maxHistoryChars: 120000
  compressionThreshold: 160
  compressionCooldownMs: 300000
  summaryMaxMessages: 20
  summaryMaxChars: 6000
soul:
  autoDraft: true
  autoApply: true
  reviewRequired: true
  autoDraftMessageInterval: 40
  autoDraftTimeIntervalMs: 14400000
  growthFeedbackBatchMessageInterval: 20
  growthFeedbackTimeIntervalMs: 3600000
  relationshipReflectionMessageInterval: 20
  relationshipReflectionTimeIntervalMs: 3600000
`

export async function initWorkspace(cwd = process.cwd()) {
  const botPath = resolve(cwd, "bot.yml")
  const soulPath = resolve(cwd, "SOUL.md")
  const agentsPath = resolve(cwd, "AGENTS.md")
  const bootstrapPath = resolve(cwd, "BOOTSTRAP.md")
  const projectSkillsDir = resolve(cwd, ".myz", "skills")
  const memoryDir = resolve(cwd, "memory")
  const conversationsDir = resolve(cwd, "conversations")

  if (!existsSync(botPath)) {
    writeFileSync(botPath, DEFAULT_BOT_YML)
  }

  if (!existsSync(soulPath)) {
    writeFileSync(soulPath, DEFAULT_SOUL)
  }
  if (!existsSync(agentsPath)) {
    writeFileSync(agentsPath, DEFAULT_AGENTS_TEMPLATE)
  }
  if (!existsSync(bootstrapPath)) {
    writeFileSync(bootstrapPath, DEFAULT_BOOTSTRAP_TEMPLATE)
  }
  ensureSoulFile(cwd)

  mkdirSync(projectSkillsDir, { recursive: true })
  mkdirSync(memoryDir, { recursive: true })
  mkdirSync(conversationsDir, { recursive: true })

  console.log("init completed")
}
