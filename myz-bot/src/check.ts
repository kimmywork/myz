import { loadConfig } from "./config"
import { createTelegramClient } from "./telegram"
import { generateReply } from "./ai"
import { createBotAssistantAgent } from "./agents/botAssistant"
import { configureGlobalNetwork } from "./network"
import { AI_MESSAGE_SCHEMA_VERSION, type Message } from "@myz/ai-core/types"

function buildMessage(role: Message["role"], content: string): Message {
  return {
    schemaVersion: AI_MESSAGE_SCHEMA_VERSION,
    id: `check-${role}-${Date.now()}`,
    role,
    content,
    timestamp: new Date().toISOString(),
  }
}

export async function checkConfig(options: { workspaceRoot?: string } = {}) {
  const config = loadConfig({
    workspaceRoot: options.workspaceRoot,
  })
  configureGlobalNetwork(config.network)
  const results: Array<{ name: string; ok: boolean; detail?: string }> = []

  if (config.channels.telegram) {
    try {
      const telegram = createTelegramClient({
        token: config.channels.telegram.token,
        timeoutSeconds: config.channels.telegram.timeoutSeconds,
        retry: config.channels.telegram.retry,
      })
      const me = await telegram.getMe()
      results.push({ name: "telegram", ok: true, detail: me.username || "ok" })
    } catch (error) {
      results.push({
        name: "telegram",
        ok: false,
        detail: (error as Error).message,
      })
    }
  } else {
    results.push({ name: "telegram", ok: true, detail: "disabled" })
  }

  try {
    const agent = createBotAssistantAgent({
      workspaceRoot: config.workspaceRoot,
    })
    const systemPrompt = agent.buildSystemPrompt({
      user: {},
    })
    const systemMessage = buildMessage("system", systemPrompt)
    const userMessage = buildMessage("user", "请回复 ok。")
    const checkConfig = {
      ...config,
      ai: {
        ...config.ai,
        capabilities: {
          ...config.ai.capabilities,
          toolCalling: false,
        },
      },
      mcpServers: [],
    }
    const reply = await generateReply({
      config: checkConfig,
      messages: agent.prepareMessages({
        systemMessage,
        history: [],
        userMessage,
      }),
    })
    const ok = Boolean(reply.content && reply.content.trim().length > 0)
    results.push({
      name: "llm",
      ok,
      detail: ok ? "ok" : "empty response",
    })
  } catch (error) {
    results.push({
      name: "llm",
      ok: false,
      detail: (error as Error).message,
    })
  }

  const failed = results.filter((item) => !item.ok)
  results.forEach((item) => {
    const status = item.ok ? "OK" : "FAILED"
    console.log(`[${status}] ${item.name}${item.detail ? `: ${item.detail}` : ""}`)
  })

  if (failed.length) {
    process.exitCode = 1
  }
}
