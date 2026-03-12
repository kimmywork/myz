import { existsSync, mkdirSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"
import { DEFAULT_SOUL, ensureSoulFile } from "./soul"

const DEFAULT_BOT_YML = `telegram:
  username: "your_bot_username"
  token: "\${TELEGRAM_BOT_TOKEN}"

ai:
  provider: openai_compatible
  baseUrl: "https://api.openai.com/v1/chat/completions"
  accessToken: "\${OPENAI_API_KEY}"
  headers: {}
  model: "gpt-4o-mini"
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
conversationsDir: "conversations"
memoryDir: "memory"
`

export async function initWorkspace(cwd = process.cwd()) {
  const botPath = resolve(cwd, "bot.yml")
  const soulPath = resolve(cwd, "SOUL.md")
  const memoryDir = resolve(cwd, "memory")
  const conversationsDir = resolve(cwd, "conversations")

  if (!existsSync(botPath)) {
    writeFileSync(botPath, DEFAULT_BOT_YML)
  }

  if (!existsSync(soulPath)) {
    writeFileSync(soulPath, DEFAULT_SOUL)
  } else {
    ensureSoulFile(cwd)
  }

  mkdirSync(memoryDir, { recursive: true })
  mkdirSync(conversationsDir, { recursive: true })

  console.log("init completed")
}
